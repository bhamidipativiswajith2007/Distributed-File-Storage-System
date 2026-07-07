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
  uploadFile: async (tempFilePath, originalName) => {
    let uploadResults;
    const fileId = uuidv4();

    try {
      // 1. Chunker handles split, replica selection, and concurrent/sequential uploads
      uploadResults = await chunkerService.splitAndUpload(tempFilePath);

      // 2. Save parent file metadata record
      const fileMetadata = new File({
        fileId,
        fileName: originalName,
        fileSize: uploadResults.fileSize,
        totalChunks: uploadResults.totalChunks
      });
      await fileMetadata.save();

      // 3. Save chunk mappings in bulk, storing the replicas array for each chunk
      const chunkRecords = uploadResults.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        fileId: fileId,
        chunkIndex: chunk.chunkIndex,
        checksum: chunk.checksum,
        replicas: chunk.replicas // Saved in MongoDB to record placement locations
      }));
      await Chunk.insertMany(chunkRecords);

      return fileId;
    } catch (error) {
      console.error(`[FileService] Upload failed for ${originalName}:`, error.message);
      throw error;
    } finally {
      // Always clear the temporary upload file to prevent server disk space leak
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

  /**
   * Purpose: Retrieve chunks for a file, connect to the primary replica node, verify hashes, and stream bytes.
   * Input:
   *   - fileId: Unique UUID of the file.
   *   - expressResponse: Express response object.
   * Output: Streams binary data to response socket.
   * High-Level Workflow:
   *   1. Fetch the file metadata.
   *   2. Query and sort chunks by chunkIndex in ascending order.
   *   3. Set HTTP download attachment headers.
   *   4. For each chunk:
   *      - Access the replicas array. Select the first node ID (index 0) as the source node.
   *      - Resolve node ID to the active URL configuration.
   *      - Download chunk binary buffer from that target node URL.
   *      - Validate SHA-256 integrity hash.
   *      - Stream the chunk buffer to the response socket.
   */
  downloadFile: async (fileId, expressResponse) => {
    const fileMetadata = await File.findOne({ fileId });
    if (!fileMetadata) {
      const error = new Error('File not found');
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
      // Phase 3: Assume every node is healthy and always download from the first replica (index 0)
      if (!chunkMetadata.replicas || chunkMetadata.replicas.length === 0) {
        throw new Error(`No replica node registered for chunk index ${chunkMetadata.chunkIndex}`);
      }
      
      const primaryNodeId = chunkMetadata.replicas[0];
      
      // Resolve nodeId to its corresponding storage node URL
      const targetNode = storageNodes.find(node => node.id === primaryNodeId);
      if (!targetNode) {
        throw new Error(`Storage configuration missing for node: ${primaryNodeId}`);
      }

      console.log(`[FileService] Fetching chunk ${chunkMetadata.chunkIndex} from primary replica: ${targetNode.id} (${targetNode.url})`);
      
      // Download chunk bytes from the resolved node URL
      const chunkBuffer = await storageNodeService.downloadChunk(targetNode.url, chunkMetadata.chunkId);

      // Verify SHA-256 integrity checksum
      const computedChecksum = calculateChecksum(chunkBuffer);
      if (computedChecksum !== chunkMetadata.checksum) {
        const integrityError = new Error(`Integrity check failed for chunk index ${chunkMetadata.chunkIndex}`);
        integrityError.chunkIndex = chunkMetadata.chunkIndex;
        throw integrityError;
      }

      // Stream chunk buffer to response socket
      expressResponse.write(chunkBuffer);
    }

    // Finish the response stream
    expressResponse.end();
  },

  /**
   * Purpose: Delete a file's chunk files from all of their replica nodes, and then delete database records.
   * Input:
   *   - fileId: Unique UUID of the file.
   * Output: Resolves on success, throws an error if any deletion step fails.
   * High-Level Workflow:
   *   1. Verify file exists.
   *   2. Query all chunks.
   *   3. For each chunk:
   *      - Loop through its replicas array.
   *      - Resolve each nodeId to its configured URL.
   *      - Delete chunk file from that target node URL.
   *   4. Delete the Chunk and File documents from MongoDB.
   */
  deleteFile: async (fileId) => {
    const fileMetadata = await File.findOne({ fileId });
    if (!fileMetadata) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    // Load chunk metadata records
    const fileChunks = await Chunk.find({ fileId });

    // Step 1: Delete all copies of all chunks from their respective storage nodes
    for (const chunkMetadata of fileChunks) {
      for (const nodeId of chunkMetadata.replicas) {
        // Resolve nodeId to its corresponding storage node URL
        const targetNode = storageNodes.find(node => node.id === nodeId);
        if (!targetNode) {
          throw new Error(`Storage configuration missing for node: ${nodeId}`);
        }

        console.log(`[FileService] Deleting chunk replica ${chunkMetadata.chunkId} from ${targetNode.id} (${targetNode.url})`);
        
        // Delete the chunk replica file from the resolved storage node URL
        await storageNodeService.deleteChunk(targetNode.url, chunkMetadata.chunkId);
      }
    }

    // Step 2: Delete database records only after successful physical storage deletion
    await Chunk.deleteMany({ fileId });
    await File.deleteOne({ fileId });
    
    console.log(`[FileService] Successfully deleted file ${fileId} and all of its chunk replica metadata`);
  },

  /**
   * Purpose: Fetch a list of all uploaded files in the system, sorted by creation date.
   * Output: Array of file metadata objects.
   */
  listFiles: async () => {
    return File.find({}, { _id: 0 }).sort({ createdAt: -1 });
  }
};
