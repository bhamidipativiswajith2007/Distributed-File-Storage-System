/**
 * @file metadata-service/services/nodeSelectionService.js
 * @description Service containing the logic for selecting a storage node for chunk placement.
 * 
 * Concept: Round Robin Load Balancing
 * Round Robin is a simple load-balancing algorithm that cycles through a list of servers in order.
 * Instead of maintaining a complex, mutable global index counter (which could lead to race conditions 
 * during concurrent uploads), we use a mathematical approach: we pass the current chunk's index
 * and apply the modulo (%) operator against the length of our storage nodes array.
 * 
 * Formula:
 * Selected Node Index = chunkIndex % N (where N is the total number of storage nodes)
 */

import { storageNodes } from '../config/storageNodes.js';

export const nodeSelectionService = {
  /**
   * Purpose: Select a storage node for a specific chunk index using the Round Robin algorithm.
   * Input:
   *   - chunkIndex: The position of the chunk (0-indexed integer).
   * Output:
   *   - The configuration object of the selected storage node (e.g. { id: 'node-1', url: 'http://localhost:5001' }).
   * High-Level Workflow:
   *   1. Validate that we have active storage nodes configured.
   *   2. Compute the selected node index using the modulo operator.
   *   3. Retrieve and return the corresponding storage node configuration.
   */
  getNodeForChunk: (chunkIndex) => {
    if (!storageNodes || storageNodes.length === 0) {
      throw new Error('No storage nodes configured. Cannot distribute chunks.');
    }

    // Determine the index in the storageNodes array using modulo
    const selectedNodeIndex = chunkIndex % storageNodes.length;

    const selectedNode = storageNodes[selectedNodeIndex];
    
    return selectedNode;
  }
};

export default nodeSelectionService;
