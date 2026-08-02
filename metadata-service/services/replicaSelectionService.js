/**
 * @file metadata-service/services/replicaSelectionService.js
 * @description Service containing the logic for choosing storage nodes for chunk replication.
 * 
 * Concept: Round Robin Replica Placement
 * To store every chunk on multiple distinct nodes (fault tolerance), we expand our Round Robin algorithm.
 * For a given chunkIndex, we want to choose REPLICATION_FACTOR (e.g. 2) unique nodes.
 * We calculate the index for each replica by adding an offset (r = 0, 1, ...) to the chunkIndex,
 * and applying the modulo operator against the total number of storage nodes.
 * 
 * Formula:
 * Target Node Index = (chunkIndex + r) % N (where r is the replica copy index from 0 to REPLICATION_FACTOR - 1)
 * 
 * Example (with 3 storage nodes, and REPLICATION_FACTOR = 2):
 * - Chunk 0:
 *   - Replica 0 (Primary): (0 + 0) % 3 = 0 -> Node 1 (port 5001)
 *   - Replica 1 (Secondary): (0 + 1) % 3 = 1 -> Node 2 (port 5002)
 * - Chunk 1:
 *   - Replica 0 (Primary): (1 + 0) % 3 = 1 -> Node 2 (port 5002)
 *   - Replica 1 (Secondary): (1 + 1) % 3 = 2 -> Node 3 (port 5003)
 */

import { storageNodes } from '../config/storageNodes.js';
import { config } from '../config/index.js';

export const replicaSelectionService = {
  /**
   * Purpose: Select a set of distinct storage nodes to store replicas of a chunk.
   * Input:
   *   - chunkIndex: The position of the chunk (0-indexed integer).
   * Output:
   *   - An array of storage node configuration objects (e.g. [{ id: 'node-1', url: '...'}, { id: 'node-2', url: '...' }]).
   * High-Level Workflow:
   *   1. Validate that we have active storage nodes configured.
   *   2. Determine how many copies we can physically store (we cannot store more copies than we have physical nodes).
   *   3. Loop through the replication count (0 to replicationCount - 1).
   *   4. Calculate the target node index for each copy using the offset modulo formula.
   *   5. Retrieve the node configuration and push it to the output array.
   */
  getReplicasForChunk: (chunkIndex) => {
    if (!storageNodes || storageNodes.length === 0) {
      throw new Error('No storage nodes configured. Cannot distribute replicas.');
    }

    // Safeguard: We cannot replicate a chunk to more nodes than physically exist in the cluster.
    // E.g., if REPLICATION_FACTOR = 4 but we only have 3 storage nodes, we limit the replicas to 3.
    const replicationCount = Math.min(config.REPLICATION_FACTOR, storageNodes.length);

    const selectedReplicas = [];

    for (let replicaOffset = 0; replicaOffset < replicationCount; replicaOffset++) {
      // Calculate index cyclically, shifting by replicaOffset
      const selectedNodeIndex = (chunkIndex + replicaOffset) % storageNodes.length;
      
      const targetNode = storageNodes[selectedNodeIndex];
      selectedReplicas.push(targetNode);
    }

    return selectedReplicas;
  }
};

export default replicaSelectionService;
