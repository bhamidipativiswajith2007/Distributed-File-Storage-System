/**
 * @file metadata-service/services/fileService.js
 * @description Core service orchestrating file metadata database operations and replicated storage tasks.
 * 
 * Concepts Used:
 * - Replication-Aware Retrieval with Automatic Failover: When downloading, the service reads the `replicas` array.
 *   It attempts to fetch the chunk from the primary replica (first in list). If the primary node is unreachable or
 *   fails checksum validation, it automatically fails over to the next replica node on the Consistent Hash Ring.
 * - Replication-Aware Deletion: During deletion, the service loops through all nodeIds stored in the `replicas`
 *   array for each chunk and deletes the files from all hosting nodes before cleaning up MongoDB records.
 */

import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { File } from '../models/File.js';
import { Chunk } from '../models/Chunk.js';
import { chunkerService } from './chunkerService.js';
import { storageNodeService } from './storageNodeService.js';
import { storageNodes } from '../config/storageNodes.js';
import { calculateChecksum } from '../utils/hash.js';

export const fileService = {
  /**
   * Purpose: Chunk an uploaded temporary file, store replicas on multiple nodes via Consistent Hashing, and save metadata.
   * Input:
   *   - tempFilePath: Absolute path to the temporary file created by Multer.
   *   - originalName: Original uploaded filename.
   *   - ownerId: ID of authenticated user.
   * Output: The newly generated fileId.
   */
  uploadFile: async (tempFilePath, originalName, ownerId) => {
    let uploadResults;
    const fileId = uuidv4();

    try {
      // 1. Chunker handles split, Consistent Hash replica selection, and concurrent/sequential uploads
      uploadResults = await chunkerService.splitAndUpload(tempFilePath);

      // 2. Save parent file metadata record with ownerId
      const fileMetadata = new File({
        fileId,
        fileName: originalName,
        fileSize: uploadResults.fileSize,
        totalChunks: uploadResults.totalChunks,
        ownerId
      });
      await fileMetadata.save();

      // 3. Save chunk mappings in bulk, storing the replicas array for each chunk
      const chunkRecords = uploadResults.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        fileId: fileId,
        chunkIndex: chunk.chunkIndex,
        checksum: chunk.checksum,
        replicas: chunk.replicas
      }));
      await Chunk.insertMany(chunkRecords);

      return fileId;
    } catch (error) {
      console.error(`[FileService] Upload failed for ${originalName}:`, error.message);
      throw error;
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
          console.log(`[FileService] Cleaned up temporary upload file: ${tempFilePath}`);
        }
      } catch (unlinkError) {
        console.error(`[FileService] Failed to remove temporary file ${tempFilePath}:`, unlinkError.message);
      }
    }
  },

  downloadFile: async (fileId, ownerId, expressResponse) => {
    const fileMetadata = await File.findOne({ fileId, ownerId });
    if (!fileMetadata) {
      const error = new Error('File not found or you do not have permission to access it');
      error.statusCode = 404;
      throw error;
    }

    // Retrieve chunks sorted by index (crucial for reassembly order)
    const fileChunks = await Chunk.find({ fileId }).sort({ chunkIndex: 1 });
    
    if (!fileChunks || fileChunks.length !== fileMetadata.totalChunks) {
      const error = new Error('File metadata is corrupted (missing chunks)');
      error.statusCode = 500;
      throw error;
    }

    // Set HTTP headers for file attachment downloads
    expressResponse.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.fileName}"`);
    expressResponse.setHeader('Content-Length', fileMetadata.fileSize);
    expressResponse.setHeader('Content-Type', 'application/octet-stream');

    // Sequentially download each chunk with automatic replica failover
    for (const chunkMetadata of fileChunks) {
      if (!chunkMetadata.replicas || chunkMetadata.replicas.length === 0) {
        throw new Error(`No replica node registered for chunk index ${chunkMetadata.chunkIndex}`);
      }
      
      let chunkBuffer = null;
      let lastError = null;

      // Try primary replica first; failover to secondary replica if primary fails
      for (const replicaNodeId of chunkMetadata.replicas) {
        const targetNode = storageNodes.find(node => node.id === replicaNodeId);
        if (!targetNode) {
          console.warn(`[FileService] Storage node config missing for ${replicaNodeId}`);
          continue;
        }

        try {
          console.log(`[FileService] Fetching chunk ${chunkMetadata.chunkIndex} from replica: ${targetNode.id} (${targetNode.url})`);
          const buffer = await storageNodeService.downloadChunk(targetNode.url, chunkMetadata.chunkId);

          const computedChecksum = calculateChecksum(buffer);
          if (computedChecksum !== chunkMetadata.checksum) {
            throw new Error(`Integrity check failed: checksum mismatch on node ${targetNode.id}`);
          }

          chunkBuffer = buffer;
          break; // Successfully fetched and verified
        } catch (replicaError) {
          console.warn(`[FileService] Replica ${replicaNodeId} failed for chunk ${chunkMetadata.chunkIndex}: ${replicaError.message}. Attempting failover to next replica...`);
          lastError = replicaError;
        }
      }

      if (!chunkBuffer) {
        const error = new Error(`All replicas failed for chunk index ${chunkMetadata.chunkIndex}: ${lastError?.message || 'No reachable nodes'}`);
        error.statusCode = 500;
        throw error;
      }

      expressResponse.write(chunkBuffer);
    }

    expressResponse.end();
  },

  deleteFile: async (fileId, ownerId) => {
    const fileMetadata = await File.findOne({ fileId, ownerId });
    if (!fileMetadata) {
      const error = new Error('File not found or you do not have permission to delete it');
      error.statusCode = 404;
      throw error;
    }

    const fileChunks = await Chunk.find({ fileId });

    for (const chunkMetadata of fileChunks) {
      for (const nodeId of chunkMetadata.replicas) {
        const targetNode = storageNodes.find(node => node.id === nodeId);
        if (!targetNode) {
          console.warn(`[FileService] Storage configuration missing for node: ${nodeId}`);
          continue;
        }

        console.log(`[FileService] Deleting chunk replica ${chunkMetadata.chunkId} from ${targetNode.id} (${targetNode.url})`);
        
        await storageNodeService.deleteChunk(targetNode.url, chunkMetadata.chunkId);
      }
    }

    await Chunk.deleteMany({ fileId });
    await File.deleteOne({ fileId });
    
    console.log(`[FileService] Successfully deleted file ${fileId} and all of its chunk replica metadata`);
  },

  listFiles: async (ownerId) => {
    return File.find({ ownerId }, { _id: 0, ownerId: 0 }).sort({ createdAt: -1 });
  }
};
