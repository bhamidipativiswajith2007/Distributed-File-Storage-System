/**
 * @file metadata-service/services/fileService.js
 * @description Core service orchestrating file operations, database transactions, and data assembly.
 * 
 * Concepts Used:
 * - Chunk Sorting: Databases do not guarantee the insertion order of records when queried. If we download 
 *   chunks out of order, the reassembled file will be corrupt (e.g. an image will be scrambled). We must 
 *   explicitly sort the chunks by `chunkIndex` in ascending order before downloading.
 * - Ordered Deletions: If we delete MongoDB metadata first, and then the Storage Node deletes fail, 
 *   we lose all records of the chunk files. The chunk files become permanent orphans. By deleting the 
 *   chunks from the Storage Node first, we ensure that if any chunk deletion fails, the process stops, 
 *   leaving the database record in place so we can retry.
 */

import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { File } from '../models/File.js';
import { Chunk } from '../models/Chunk.js';
import { chunkerService } from './chunkerService.js';
import { storageNodeService } from './storageNodeService.js';
import { calculateChecksum } from '../utils/hash.js';

export const fileService = {
  /**
   * Purpose: Chunk an uploaded temporary file, store chunk mappings, and save file metadata.
   * Input:
   *   - tempFilePath: Absolute path to the temporary file created by Multer.
   *   - originalName: Original uploaded filename.
   * Output: The newly generated fileId.
   * High-Level Workflow:
   *   1. Split and upload the temporary file to the Storage Node.
   *   2. Create and save a new File document in MongoDB.
   *   3. Save Chunk document mapping records in bulk (using insertMany).
   *   4. Delete the temporary file from local disk.
   */
  uploadFile: async (tempFilePath, originalName) => {
    let uploadResults;
    const fileId = uuidv4();

    try {
      // 1. Chunk and upload the file to the Storage Node
      uploadResults = await chunkerService.splitAndUpload(tempFilePath);

      // 2. Save parent file metadata
      const fileMetadata = new File({
        fileId,
        fileName: originalName,
        fileSize: uploadResults.fileSize,
        totalChunks: uploadResults.totalChunks
      });
      await fileMetadata.save();

      // 3. Save chunk mappings in bulk
      const chunkRecords = uploadResults.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        fileId: fileId,
        chunkIndex: chunk.chunkIndex,
        checksum: chunk.checksum
      }));
      await Chunk.insertMany(chunkRecords);

      return fileId;
    } catch (error) {
      console.error(`[FileService] Upload failed for ${originalName}:`, error.message);
      throw error;
    } finally {
      // Always delete the temporary file from the metadata-service disk to prevent disk space leaks
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
   * Purpose: Retrieve chunks for a file, verify integrity on-the-fly, and write them sequentially to the response socket.
   * Input:
   *   - fileId: Unique UUID of the file.
   *   - expressResponse: Express response object.
   * Output: Streams binary data to response, finishes by ending the stream.
   * High-Level Workflow:
   *   1. Fetch the file metadata. Return 404 if missing.
   *   2. Query and explicitly sort the file's chunks by chunkIndex.
   *   3. Set Content-Disposition, Content-Length, and Content-Type response headers.
   *   4. Sequentially download each chunk.
   *   5. Calculate and verify each chunk's SHA-256 checksum against the database.
   *   6. Write the chunk data directly to the Express response socket.
   */
  downloadFile: async (fileId, expressResponse) => {
    const fileMetadata = await File.findOne({ fileId });
    if (!fileMetadata) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    // Retrieve chunks sorted by index (crucial for maintaining file assembly order)
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

    // Sequentially download, verify, and write each chunk
    for (const chunkMetadata of fileChunks) {
      console.log(`[FileService] Fetching chunk ${chunkMetadata.chunkIndex} (ID: ${chunkMetadata.chunkId})`);
      
      const chunkBuffer = await storageNodeService.downloadChunk(chunkMetadata.chunkId);

      // Verify SHA-256 integrity checksum
      const computedChecksum = calculateChecksum(chunkBuffer);
      if (computedChecksum !== chunkMetadata.checksum) {
        const integrityError = new Error(`Integrity check failed for chunk index ${chunkMetadata.chunkIndex}`);
        integrityError.chunkIndex = chunkMetadata.chunkIndex;
        throw integrityError;
      }

      // Write chunk buffer to response socket stream
      expressResponse.write(chunkBuffer);
    }

    // Finalize/close the response connection
    expressResponse.end();
  },

  /**
   * Purpose: Delete a file's chunk files on the Storage Node first, and then delete database records on success.
   * Input:
   *   - fileId: Unique UUID of the file.
   * Output: Resolves on success, throws an error if any deletion step fails.
   * High-Level Workflow:
   *   1. Verify file exists in database.
   *   2. Query all chunks.
   *   3. Request chunk deletions from the Storage Node. If one fails, stop.
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

    // Step 1: Delete files from physical storage node first
    for (const chunkMetadata of fileChunks) {
      console.log(`[FileService] Requesting deletion of chunk ${chunkMetadata.chunkId} from storage node`);
      // If a deletion fails, this throws and halts the execution, leaving DB records intact.
      await storageNodeService.deleteChunk(chunkMetadata.chunkId);
    }

    // Step 2: Delete database records only after successful physical storage deletion
    await Chunk.deleteMany({ fileId });
    await File.deleteOne({ fileId });
    
    console.log(`[FileService] Successfully deleted file ${fileId} and its chunk metadata`);
  },

  /**
   * Purpose: Fetch a list of all uploaded files in the system, sorted by creation date.
   * Output: Array of file metadata objects.
   */
  listFiles: async () => {
    return File.find({}, { _id: 0 }).sort({ createdAt: -1 });
  }
};
