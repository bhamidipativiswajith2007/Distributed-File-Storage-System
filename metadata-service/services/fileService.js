/**
 * @file metadata-service/services/fileService.js
 * @description Core service orchestrating file metadata database operations and replicated storage tasks.
 * 
 * Concepts Used:
 * - Replication-Aware Retrieval: When downloading, the service reads the `replicas` array from MongoDB.
 *   For Phase 3, we assume all nodes are healthy, so we retrieve the first node ID in the array (index 0),
 *   resolve its URL, and download the chunk from there.
 * - Replication-Aware Deletion: During deletion, the service loops through all nodeIds stored in the `replicas`
 *   array for each chunk and deletes the files from all hosting nodes. Only after all copies of all chunks 
 *   are successfully deleted do we clean up MongoDB records.
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
   * Purpose: Chunk an uploaded temporary file, store replicas on multiple nodes, and save metadata.
   * Input:
   *   - tempFilePath: Absolute path to the temporary file created by Multer.
   *   - originalName: Original uploaded filename.
   * Output: The newly generated fileId.
   * High-Level Workflow:
   *   1. Split and upload file chunks to multiple storage nodes (replication).
   *   2. Create and save a new File document in MongoDB.
   *   3. Save Chunk document mapping records (including replicas array) in bulk.
   *   4. Delete the temporary upload file from local disk.
   */
  uploadFile: async (tempFilePath, originalName, ownerId) => {
    let uploadResults;
    const fileId = uuidv4();

    try {
      // 1. Chunker handles split, replica selection, and concurrent/sequential uploads
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

    // Sequentially download from their primary replica, verify, and write each chunk
    for (const chunkMetadata of fileChunks) {
      if (!chunkMetadata.replicas || chunkMetadata.replicas.length === 0) {
        throw new Error(`No replica node registered for chunk index ${chunkMetadata.chunkIndex}`);
      }
      
      const primaryNodeId = chunkMetadata.replicas[0];
      
      const targetNode = storageNodes.find(node => node.id === primaryNodeId);
      if (!targetNode) {
        throw new Error(`Storage configuration missing for node: ${primaryNodeId}`);
      }

      console.log(`[FileService] Fetching chunk ${chunkMetadata.chunkIndex} from primary replica: ${targetNode.id} (${targetNode.url})`);
      
      const chunkBuffer = await storageNodeService.downloadChunk(targetNode.url, chunkMetadata.chunkId);

      const computedChecksum = calculateChecksum(chunkBuffer);
      if (computedChecksum !== chunkMetadata.checksum) {
        const integrityError = new Error(`Integrity check failed for chunk index ${chunkMetadata.chunkIndex}`);
        integrityError.chunkIndex = chunkMetadata.chunkIndex;
        throw integrityError;
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
          throw new Error(`Storage configuration missing for node: ${nodeId}`);
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
