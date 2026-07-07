/**
 * @file metadata-service/services/chunkerService.js
 * @description Service responsible for splitting temporary files into chunks and distributing them.
 * 
 * Concepts Used:
 * - Round Robin Distribution Integration: Coordinates with `nodeSelectionService` to determine the 
 *   placement of each chunk. The selected nodeId is stored inside the chunk tracker array.
 * - Multi-Node Rollback: If an upload fails mid-way, the rollback logic deletes uploaded chunks 
 *   from their respective storage nodes using their correct dynamic URLs.
 */

import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { calculateChecksum } from '../utils/hash.js';
import { storageNodeService } from './storageNodeService.js';
import { nodeSelectionService } from './nodeSelectionService.js';
import { storageNodes } from '../config/storageNodes.js';
import { config } from '../config/index.js';

export const chunkerService = {
  /**
   * Purpose: Split a file, select placement node cyclically, upload to designated storage node, and roll back on failure.
   * Input:
   *   - filePath: Absolute path to the temporary file on disk.
   * Output: Object containing:
   *   - fileSize: Total file size in bytes.
   *   - totalChunks: Total number of chunks uploaded.
   *   - chunks: Array of metadata objects ({ chunkId, chunkIndex, checksum, nodeId }).
   * High-Level Workflow:
   *   1. Determine size. Open file descriptor.
   *   2. Loop through file. Allocate buffer. Read segment.
   *   3. Call nodeSelectionService to get target storage node for current chunkIndex.
   *   4. Generate UUID and checksum.
   *   5. Call storageNodeService.uploadChunk with target node URL.
   *   6. Keep track of uploaded chunk (mapping to nodeId).
   *   7. Close file descriptor. If any error occurs, loop through tracker and delete chunks from respective nodes.
   */
  splitAndUpload: async (filePath) => {
    const fileStats = await fs.promises.stat(filePath);
    const fileSize = fileStats.size;

    if (fileSize === 0) {
      throw new Error('Cannot upload an empty file.');
    }

    const fileDescriptor = await fs.promises.open(filePath, 'r');
    const uploadedChunksTracker = [];
    
    let chunkIndex = 0;
    let bytePosition = 0;

    try {
      while (bytePosition < fileSize) {
        const remainingBytes = fileSize - bytePosition;
        const currentChunkSize = Math.min(config.CHUNK_SIZE, remainingBytes);
        const chunkBuffer = Buffer.alloc(currentChunkSize);

        const { bytesRead } = await fileDescriptor.read(chunkBuffer, 0, currentChunkSize, bytePosition);
        if (bytesRead === 0) {
          break;
        }

        const finalChunkBuffer = bytesRead === currentChunkSize ? chunkBuffer : chunkBuffer.subarray(0, bytesRead);

        // 1. Determine the storage node using Round Robin selection
        const targetNode = nodeSelectionService.getNodeForChunk(chunkIndex);
        
        // 2. Generate UUID and compute SHA-256 hash
        const chunkId = uuidv4();
        const checksum = calculateChecksum(finalChunkBuffer);

        console.log(`[ChunkerService] Routing chunk ${chunkIndex} to ${targetNode.id} (${targetNode.url}) - ID: ${chunkId}`);

        // 3. Upload the chunk buffer to the dynamically selected storage node url
        await storageNodeService.uploadChunk(targetNode.url, chunkId, finalChunkBuffer);

        // 4. Save metadata tracker details, mapping chunk to nodeId
        uploadedChunksTracker.push({
          chunkId,
          chunkIndex,
          checksum,
          nodeId: targetNode.id
        });

        bytePosition += bytesRead;
        chunkIndex++;
      }
    } catch (error) {
      console.error('[ChunkerService] Upload aborted due to error. Initiating cluster rollback...');
      
      // Rollback: delete already uploaded chunks from their respective storage nodes
      for (const uploadedChunk of uploadedChunksTracker) {
        try {
          // Find the URL of the node where this chunk was uploaded
          const nodeConfig = storageNodes.find(node => node.id === uploadedChunk.nodeId);
          if (nodeConfig) {
            console.log(`[ChunkerService] Rollback: Deleting chunk ${uploadedChunk.chunkId} from ${nodeConfig.id}`);
            await storageNodeService.deleteChunk(nodeConfig.url, uploadedChunk.chunkId);
          }
        } catch (cleanupError) {
          console.error(`[ChunkerService] Failed to clean up chunk ${uploadedChunk.chunkId} from nodeId ${uploadedChunk.nodeId}:`, cleanupError.message);
        }
      }
      throw error;
    } finally {
      await fileDescriptor.close();
    }

    return {
      fileSize,
      totalChunks: chunkIndex,
      chunks: uploadedChunksTracker
    };
  }
};
