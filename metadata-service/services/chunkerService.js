/**
 * @file metadata-service/services/chunkerService.js
 * @description Service responsible for splitting temporary files into chunks and uploading them.
 * 
 * Concepts Used:
 * - File Descriptors: Instead of loading a large file into memory, we use `fs.promises.open` to get a file descriptor.
 *   This is a reference handle that allows us to read segments of the file directly from disk.
 * - Why UUID: Generating a UUID (Universally Unique Identifier) ensures every single chunk across the system 
 *   has a globally unique filename. This prevents file overwrites and name collisions on the Storage Node.
 * - Rollback on Failure (Cleanup): If we successfully upload 10 chunks, and chunk 11 fails (due to a network dropout 
 *   or storage error), we must not leave the first 10 chunks orphaned on the Storage Node. We clean them up 
 *   immediately (delete them) to avoid consuming space for a file that can never be reassembled.
 */

import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { calculateChecksum } from '../utils/hash.js';
import { storageNodeService } from './storageNodeService.js';
import { config } from '../config/index.js';

export const chunkerService = {
  /**
   * Purpose: Read a file sequentially in fixed-size blocks, calculate hash, upload to Storage Node, and rollback on error.
   * Input:
   *   - filePath: Absolute path to the temporary file on disk.
   * Output: Object containing:
   *   - fileSize: Total file size in bytes.
   *   - totalChunks: Total number of chunks uploaded.
   *   - chunks: Array of metadata objects for each uploaded chunk ({ chunkId, chunkIndex, checksum }).
   * High-Level Workflow:
   *   1. Get the file size using stat. Reject empty files.
   *   2. Open the file descriptor for reading.
   *   3. Loop through the file, reading exactly CHUNK_SIZE bytes (or the remaining bytes for the last chunk).
   *   4. Generate a UUID chunkId and calculate its SHA-256 checksum.
   *   5. Upload the chunk buffer to the Storage Node via PUT.
   *   6. Track the uploaded chunk. If an error occurs, delete all uploaded chunks and throw the error.
   *   7. Close the file descriptor.
   */
  splitAndUpload: async (filePath) => {
    const fileStats = await fs.promises.stat(filePath);
    const fileSize = fileStats.size;

    // Guard clause to reject invalid empty files
    if (fileSize === 0) {
      throw new Error('Cannot upload an empty file.');
    }

    // Open file descriptor for sequential reading
    const fileDescriptor = await fs.promises.open(filePath, 'r');
    const uploadedChunksTracker = [];
    
    let chunkIndex = 0;
    let bytePosition = 0;

    try {
      while (bytePosition < fileSize) {
        const remainingBytes = fileSize - bytePosition;
        // Determine size: Use standard CHUNK_SIZE, or if we are at the end, use the remaining bytes.
        const currentChunkSize = Math.min(config.CHUNK_SIZE, remainingBytes);
        
        // Allocate a buffer to hold this specific chunk's data in RAM
        const chunkBuffer = Buffer.alloc(currentChunkSize);

        // Read bytes directly from the file descriptor at the current byte position
        const { bytesRead } = await fileDescriptor.read(chunkBuffer, 0, currentChunkSize, bytePosition);
        if (bytesRead === 0) {
          break; // End of file reached
        }

        // If we read fewer bytes than allocated (e.g. file changed), slice the buffer to match the actual size
        const finalChunkBuffer = bytesRead === currentChunkSize ? chunkBuffer : chunkBuffer.subarray(0, bytesRead);

        // Generate identifiers and integrity verification checksums
        const chunkId = uuidv4();
        const checksum = calculateChecksum(finalChunkBuffer);

        console.log(`[ChunkerService] Uploading chunk ${chunkIndex} (ID: ${chunkId}, Size: ${bytesRead} bytes)`);

        // Stream the chunk buffer to the storage node
        await storageNodeService.uploadChunk(chunkId, finalChunkBuffer);

        // Keep track of successful uploads so we can roll them back if a later chunk fails
        uploadedChunksTracker.push({
          chunkId,
          chunkIndex,
          checksum
        });

        // Advance progress trackers
        bytePosition += bytesRead;
        chunkIndex++;
      }
    } catch (error) {
      console.error('[ChunkerService] Upload aborted due to error. Initiating cleanup...');
      
      // Rollback logic: Clean up already uploaded chunks to prevent orphan leaks on the storage node
      for (const uploadedChunk of uploadedChunksTracker) {
        try {
          await storageNodeService.deleteChunk(uploadedChunk.chunkId);
        } catch (cleanupError) {
          console.error(`[ChunkerService] Failed to clean up chunk ${uploadedChunk.chunkId}:`, cleanupError.message);
        }
      }
      // Re-throw the original error to be handled by the controller
      throw error;
    } finally {
      // Ensure the file descriptor is closed to prevent system file handle leaks
      await fileDescriptor.close();
    }

    return {
      fileSize,
      totalChunks: chunkIndex,
      chunks: uploadedChunksTracker
    };
  }
};
