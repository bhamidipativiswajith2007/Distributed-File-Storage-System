/**
 * @file metadata-service/services/chunkerService.js
 * @description Service responsible for splitting temporary files and distributing chunk replicas.
 * 
 * Concepts Used:
 * - Chunk Replication Flow: For every chunk, we fetch a list of target storage nodes from `replicaSelectionService`.
 *   We upload the chunk buffer to each replica node sequentially.
 * - Transactional Rollback (Replication-Aware): If an upload to *any* replica node fails, we must:
 *   1. Clean up (delete) any successful copies of the CURRENT chunk we already uploaded.
 *   2. Propagate the error to the main catch block, which unlinks all previous successfully uploaded chunks
 *      from all of their respective replica storage nodes.
 *   This ensures absolute atomic transactional safety across the cluster.
 */

import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { calculateChecksum } from '../utils/hash.js';
import { storageNodeService } from './storageNodeService.js';
import { replicaSelectionService } from './replicaSelectionService.js';
import { storageNodes } from '../config/storageNodes.js';
import { config } from '../config/index.js';

export const chunkerService = {
  /**
   * Purpose: Split a file, select placement replica nodes cyclically, upload to all replicas, and roll back on failure.
   * Input:
   *   - filePath: Absolute path to the temporary file on disk.
   * Output: Object containing:
   *   - fileSize: Total file size in bytes.
   *   - totalChunks: Total number of chunks uploaded.
   *   - chunks: Array of metadata objects ({ chunkId, chunkIndex, checksum, replicas: [nodeIds] }).
   * High-Level Workflow:
   *   1. Determine size. Open file descriptor.
   *   2. Loop through file. Read segment into buffer.
   *   3. Call replicaSelectionService.getReplicasForChunk(chunkIndex) to get target nodes.
   *   4. Generate UUID and checksum.
   *   5. For each target node:
   *      - Upload chunk to node URL.
   *      - Track successful uploads for this chunk.
   *      - If any upload fails, immediately delete the copies of this chunk on other replica nodes, and throw error.
   *   6. Add chunk metadata with replicas list to the tracker.
   *   7. If parent catch executes, clean up all uploaded chunks from all their replica nodes.
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

        // 1. Get list of target replica nodes using Round Robin replica selection
        const targetNodes = replicaSelectionService.getReplicasForChunk(chunkIndex);
        
        // 2. Generate UUID and compute SHA-256 hash
        const chunkId = uuidv4();
        const checksum = calculateChecksum(finalChunkBuffer);

        const successfulReplicasForThisChunk = [];

        try {
          // 3. Upload the chunk buffer to ALL selected replica storage nodes
          for (const targetNode of targetNodes) {
            console.log(`[ChunkerService] Uploading chunk ${chunkIndex} replica to ${targetNode.id} (${targetNode.url}) - ID: ${chunkId}`);
            
            await storageNodeService.uploadChunk(targetNode.url, chunkId, finalChunkBuffer);
            
            // Log successful uploads for this specific chunk so we can roll back if subsequent replicas fail
            successfulReplicasForThisChunk.push(targetNode.id);
          }
        } catch (uploadError) {
          console.error(`[ChunkerService] Upload failed for chunk ${chunkIndex}. Rolling back current chunk replicas...`);
          
          // Cleanup current chunk's uploaded replicas
          for (const nodeId of successfulReplicasForThisChunk) {
            const nodeConfig = storageNodes.find(node => node.id === nodeId);
            if (nodeConfig) {
              try {
                await storageNodeService.deleteChunk(nodeConfig.url, chunkId);
              } catch (deleteError) {
                console.error(`[ChunkerService] Rollback failed for current chunk on ${nodeConfig.id}:`, deleteError.message);
              }
            }
          }
          // Propagate error to the outer catch block to trigger full file rollback
          throw uploadError;
        }

        // 4. Save metadata details containing the full list of replica nodes
        uploadedChunksTracker.push({
          chunkId,
          chunkIndex,
          checksum,
          replicas: successfulReplicasForThisChunk
        });

        bytePosition += bytesRead;
        chunkIndex++;
      }
    } catch (error) {
      console.error('[ChunkerService] Chunker execution aborted. Initiating full cluster rollback...');
      
      // Rollback: delete all copies of previously successfully uploaded chunks from all their replica nodes
      for (const uploadedChunk of uploadedChunksTracker) {
        for (const nodeId of uploadedChunk.replicas) {
          const nodeConfig = storageNodes.find(node => node.id === nodeId);
          if (nodeConfig) {
            try {
              console.log(`[ChunkerService] Rolling back: Deleting chunk ${uploadedChunk.chunkId} from ${nodeConfig.id}`);
              await storageNodeService.deleteChunk(nodeConfig.url, uploadedChunk.chunkId);
            } catch (cleanupError) {
              console.error(`[ChunkerService] Failed to rollback chunk ${uploadedChunk.chunkId} from ${nodeConfig.id}:`, cleanupError.message);
            }
          }
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
