/**
 * @file metadata-service/services/storageNodeService.js
 * @description Wrapper service for HTTP communication with the Storage Node Cluster.
 * 
 * Concepts Used:
 * - Dynamic Routing: Instead of sending all requests to a single hardcoded node URL, 
 *   every API method now accepts a dynamic `nodeUrl` parameter. This allows the same service
 *   to talk to Node 1 (port 5001), Node 2 (port 5002), Node 3 (port 5003), etc.
 * - Axios REST Clients: Perform HTTP requests to the designated storage node.
 * - ArrayBuffer Responses: Avoids UTF-8 text corruption when downloading binary data.
 */

import axios from 'axios';

export const storageNodeService = {
  /**
   * Purpose: Upload a raw binary chunk to a specific Storage Node.
   * Input:
   *   - nodeUrl: Base URL of the target Storage Node (e.g. http://localhost:5001).
   *   - chunkId: Unique UUID identifying the chunk.
   *   - chunkBuffer: Node.js Buffer containing the chunk's physical bytes.
   * Output: Resolves on success, throws an error on failure.
   * High-Level Workflow:
   *   1. Construct PUT URL using target nodeUrl.
   *   2. Perform PUT request with raw binary buffer.
   *   3. Set Content-Type to application/octet-stream.
   */
  uploadChunk: async (nodeUrl, chunkId, chunkBuffer) => {
    const uploadUrl = `${nodeUrl}/chunks/${chunkId}`;
    try {
      await axios.put(uploadUrl, chunkBuffer, {
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
    } catch (error) {
      console.error(`[StorageNodeService] Failed to upload chunk ${chunkId} to ${nodeUrl}:`, error.message);
      throw new Error(`Failed to upload chunk ${chunkId} to storage node (${nodeUrl}): ${error.message}`);
    }
  },

  /**
   * Purpose: Download a chunk's binary data from a specific Storage Node.
   * Input:
   *   - nodeUrl: Base URL of the target Storage Node.
   *   - chunkId: Unique UUID of the chunk.
   * Output: Node.js Buffer containing the raw chunk bytes.
   * High-Level Workflow:
   *   1. Construct GET URL using target nodeUrl.
   *   2. Execute request with responseType: 'arraybuffer'.
   *   3. Convert the returned data to a Buffer and return it.
   */
  downloadChunk: async (nodeUrl, chunkId) => {
    const downloadUrl = `${nodeUrl}/chunks/${chunkId}`;
    try {
      const storageNodeResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer'
      });
      return Buffer.from(storageNodeResponse.data);
    } catch (error) {
      console.error(`[StorageNodeService] Failed to download chunk ${chunkId} from ${nodeUrl}:`, error.message);
      if (error.response && error.response.status === 404) {
        throw new Error(`Chunk ${chunkId} not found on storage node (${nodeUrl}).`);
      }
      throw new Error(`Failed to download chunk ${chunkId} from storage node (${nodeUrl}): ${error.message}`);
    }
  },

  /**
   * Purpose: Delete a chunk file from a specific Storage Node.
   * Input:
   *   - nodeUrl: Base URL of the target Storage Node.
   *   - chunkId: Unique UUID of the chunk.
   * Output: Boolean indicating if deletion succeeded (true) or file did not exist (false).
   * High-Level Workflow:
   *   1. Construct DELETE URL using target nodeUrl.
   *   2. Execute request.
   *   3. Return true on 200, return false on 404.
   */
  deleteChunk: async (nodeUrl, chunkId) => {
    const deleteUrl = `${nodeUrl}/chunks/${chunkId}`;
    try {
      await axios.delete(deleteUrl);
      return true;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.warn(`[StorageNodeService] Chunk ${chunkId} not found on ${nodeUrl} during delete.`);
        return false;
      }
      console.error(`[StorageNodeService] Failed to delete chunk ${chunkId} from ${nodeUrl}:`, error.message);
      throw new Error(`Failed to delete chunk ${chunkId} from storage node (${nodeUrl}): ${error.message}`);
    }
  }
};
