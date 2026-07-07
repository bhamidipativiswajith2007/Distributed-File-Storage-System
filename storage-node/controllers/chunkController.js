/**
 * @file storage-node/controllers/chunkController.js
 * @description Controller handling read, write, and delete operations on physical file chunks.
 * 
 * Concepts Used:
 * - Streams & Pipeline: Instead of reading entire files into RAM, Node.js streams read/write data in small, 
 *   sequential packets (chunks). The stream `pipeline` utility pipes data from a source (like an incoming 
 *   HTTP request stream) to a destination (like a local disk write stream) safely. If any error occurs, 
 *   pipeline automatically cleans up and closes all open streams, preventing memory leaks.
 * - Local disk storage: Chunks are stored as raw `.bin` files. This is simple, fast, and avoids the overhead 
 *   of storing large blobs inside a database.
 */

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { config } from '../config/index.js';

/**
 * Purpose: Check if a specific file exists on the local disk.
 * Input:
 *   - filePath: Absolute path to the file.
 * Output: Promise resolving to true if file exists, false otherwise.
 * High-Level Workflow:
 *   1. Use fs.promises.access with the F_OK flag to verify file visibility.
 *   2. If it succeeds, return true. If it catches an error, return false.
 */
const checkIfFileExists = async (filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Purpose: Receive binary chunk stream from Metadata Service and save it to disk.
 * Input:
 *   - request: Express request stream containing binary data (PUT /chunks/:chunkId).
 *   - response: Express response object.
 *   - next: Callback to forward errors to the error middleware.
 * Output: JSON response confirming successful upload.
 * High-Level Workflow:
 *   1. Extract chunkId from request URL parameters.
 *   2. Ensure the storage directory exists on disk.
 *   3. Open a write stream to a local path (storage-node/data/chunks/<chunkId>.bin).
 *   4. Stream the binary request body directly to disk using `pipeline`.
 *   5. Send a 201 Created JSON response.
 */
export const uploadChunk = async (request, response, next) => {
  try {
    const { chunkId } = request.params;
    if (!chunkId) {
      return response.status(400).json({ success: false, error: 'Missing chunkId' });
    }

    // Ensure target folder exists (creates storage-node/data/chunks/ recursively if missing)
    await fs.promises.mkdir(config.CHUNKS_DIR, { recursive: true });

    const targetFilePath = path.join(config.CHUNKS_DIR, `${chunkId}.bin`);
    
    // Create a write stream that saves incoming bytes directly to the file system
    const diskWriteStream = fs.createWriteStream(targetFilePath);

    // Stream concept: We pipe the incoming request (which is a readable stream of bytes) 
    // directly into our disk write stream. This avoids holding the chunk bytes in RAM.
    await pipeline(request, diskWriteStream);

    return response.status(201).json({
      success: true,
      message: 'Chunk uploaded successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Purpose: Read chunk file from disk and stream it back to the client.
 * Input:
 *   - request: Express request object containing chunkId in URL (GET /chunks/:chunkId).
 *   - response: Express response stream.
 *   - next: Callback to forward errors.
 * Output: Streams binary chunk to client, sets Content-Type to application/octet-stream.
 * High-Level Workflow:
 *   1. Resolve local path of the chunk file.
 *   2. Check if the file exists on disk. If not, return 404 Not Found.
 *   3. Set Content-Type header to binary stream.
 *   4. Create a read stream on the local file.
 *   5. Pipe the file read stream directly into the Express response stream using `pipeline`.
 */
export const downloadChunk = async (request, response, next) => {
  try {
    const { chunkId } = request.params;
    const targetFilePath = path.join(config.CHUNKS_DIR, `${chunkId}.bin`);

    const doesFileExist = await checkIfFileExists(targetFilePath);
    if (!doesFileExist) {
      return response.status(404).json({ success: false, error: 'Chunk not found' });
    }

    // Inform the client that we are sending raw, untyped binary data
    response.setHeader('Content-Type', 'application/octet-stream');

    // Create a read stream that emits small chunks of the file sequentially from disk
    const diskReadStream = fs.createReadStream(targetFilePath);
    
    // Pipe the file read stream directly to the response socket stream.
    // If the client disconnects early, pipeline will automatically close the diskReadStream.
    await pipeline(diskReadStream, response);
  } catch (error) {
    next(error);
  }
};

/**
 * Purpose: Delete a chunk file from disk.
 * Input:
 *   - request: Express request containing chunkId in URL (DELETE /chunks/:chunkId).
 *   - response: Express response object.
 *   - next: Callback to forward errors.
 * Output: JSON response reflecting success or 404 if not found.
 * High-Level Workflow:
 *   1. Resolve local path of the chunk file.
 *   2. Check if file exists. If not, return a clear 404 JSON response.
 *   3. Delete the file using fs.promises.unlink.
 *   4. Return a 200 OK JSON response.
 */
export const deleteChunk = async (request, response, next) => {
  try {
    const { chunkId } = request.params;
    const targetFilePath = path.join(config.CHUNKS_DIR, `${chunkId}.bin`);

    const doesFileExist = await checkIfFileExists(targetFilePath);
    if (!doesFileExist) {
      // Return 404 so the Metadata Service knows this chunk did not exist on the node.
      return response.status(404).json({
        success: false,
        error: 'Chunk not found'
      });
    }

    // Delete the file from local disk
    await fs.promises.unlink(targetFilePath);

    return response.status(200).json({
      success: true,
      message: 'Chunk deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Purpose: Health check endpoint to verify node is online.
 * Input: Express request and response objects.
 * Output: JSON payload {"status": "healthy"}.
 */
export const getHealth = (request, response) => {
  response.status(200).json({
    status: 'healthy'
  });
};
