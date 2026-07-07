/**
 * @file metadata-service/services/storageNodeService.js
 * @description Wrapper service for HTTP communication with the Storage Node APIs.
 * 
 * Concepts Used:
 * - Axios REST Clients: We use the `axios` library to perform HTTP requests to the Storage Node.
 * - HTTP PUT with Binary: When uploading a chunk, we pass the raw binary Buffer directly as the request body
 *   and set Content-Type to `application/octet-stream`. This tells the target server to read it as raw bytes.
 * - ArrayBuffer Responses: When downloading, we tell Axios to expect `arraybuffer` data. This prevents Axios 
 *   from trying to parse the binary image/video file bytes as a UTF-8 text string, which would corrupt the data.
 */

import axios from 'axios';
import { config } from '../config/index.js';

export const storageNodeService = {
  /**
   * Purpose: Upload a raw binary chunk to the Storage Node via HTTP PUT.
   * Input:
   *   - chunkId: Unique UUID identifying the chunk.
   *   - chunkBuffer: Node.js Buffer containing the chunk's physical bytes.
   * Output: Resolves on success, throws an error on network or storage failure.
   * High-Level Workflow:
   *   1. Construct the Storage Node PUT URL using config parameters.
   *   2. Perform PUT request sending the raw binary buffer.
   *   3. Set Content-Type to application/octet-stream.
   */
  uploadChunk: async (chunkId, chunkBuffer) => {
    const uploadUrl = `${config.STORAGE_NODE_URL}/chunks/${chunkId}`;
    try {
      await axios.put(uploadUrl, chunkBuffer, {
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        // Prevent Axios from restricting large body limits (since chunks can be up to 4MB+)
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
    } catch (error) {
      console.error(`[StorageNodeService] Failed to upload chunk ${chunkId}:`, error.message);
      throw new Error(`Failed to upload chunk ${chunkId} to storage node: ${error.message}`);
    }
  },

  /**
   * Purpose: Retrieve a chunk's binary data from the Storage Node via HTTP GET.
   * Input:
   *   - chunkId: Unique UUID of the chunk.
   *   - Output: Node.js Buffer containing the raw chunk data.
   * High-Level Workflow:
   *   1. Construct GET URL.
   *   2. Execute request with responseType: 'arraybuffer'.
   *   3. Convert the returned ArrayBuffer data to a standard Node.js Buffer.
   */
  downloadChunk: async (chunkId) => {
    const downloadUrl = `${config.STORAGE_NODE_URL}/chunks/${chunkId}`;
    try {
      const storageNodeResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer'
      });
      // Convert the raw ArrayBuffer response data into a Node.js Buffer
      return Buffer.from(storageNodeResponse.data);
    } catch (error) {
      console.error(`[StorageNodeService] Failed to download chunk ${chunkId}:`, error.message);
      if (error.response && error.response.status === 404) {
        throw new Error(`Chunk ${chunkId} not found on storage node.`);
      }
      throw new Error(`Failed to download chunk ${chunkId} from storage node: ${error.message}`);
    }
  },

  /**
   * Purpose: Delete a chunk file from the Storage Node via HTTP DELETE.
   * Input:
   *   - chunkId: Unique UUID of the chunk.
   * Output: Boolean indicating if deletion was successful (true) or file did not exist (false).
   * High-Level Workflow:
   *   1. Construct DELETE URL.
   *   2. Execute request.
   *   3. If it succeeds, return true.
   *   4. If it returns 404, catch the status code and return false (chunk did not exist).
   */
  deleteChunk: async (chunkId) => {
    const deleteUrl = `${config.STORAGE_NODE_URL}/chunks/${chunkId}`;
    try {
      await axios.delete(deleteUrl);
      return true;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.warn(`[StorageNodeService] Chunk ${chunkId} not found during delete.`);
        return false;
      }
      console.error(`[StorageNodeService] Failed to delete chunk ${chunkId}:`, error.message);
      throw new Error(`Failed to delete chunk ${chunkId} from storage node: ${error.message}`);
    }
  }
};
