/**
 * @file metadata-service/services/replicaSelectionService.js
 * @description Service orchestrating node selection for chunk replication using a Consistent Hashing Ring.
 * 
 * Concepts Used:
 * - Consistent Hashing vs. Modulo: Modulo hashing reshuffles ~75-90% of data when cluster size changes.
 *   Our Consistent Hash Ring with 150 virtual nodes per physical node maps chunks to ring positions,
 *   ensuring that adding or removing a node only impacts ~1/N of keys.
 * - Dynamic Cluster Topography: Allows runtime addition and removal of storage nodes without server restarts.
 */

import { storageNodes } from '../config/storageNodes.js';
import { config } from '../config/index.js';
import { HashRing } from '../utils/hashRing.js';

// Initialize the Hash Ring with configured storage nodes and 150 virtual nodes each
const hashRing = new HashRing(storageNodes, 150);

export const replicaSelectionService = {
  /**
   * Purpose: Select a set of distinct storage nodes to store replicas of a chunk via the Consistent Hash Ring.
   * Input:
   *   - chunkKeyOrIndex: Unique chunk identifier (UUID or `${fileId}_chunk_${chunkIndex}`) or legacy numeric chunkIndex.
   * Output:
   *   - An array of storage node configuration objects (e.g. [{ id: 'node-1', url: '...'}, { id: 'node-2', url: '...' }]).
   */
  getReplicasForChunk: (chunkKeyOrIndex) => {
    const key = typeof chunkKeyOrIndex === 'string' 
      ? chunkKeyOrIndex 
      : `chunk_index_${chunkKeyOrIndex}`;

    const replicationFactor = config.REPLICATION_FACTOR || 2;
    const selectedReplicas = hashRing.getNodes(key, replicationFactor);

    if (selectedReplicas.length === 0) {
      throw new Error('No available storage nodes in the Consistent Hash Ring.');
    }

    return selectedReplicas;
  },

  /**
   * Add a new storage node to the ring dynamically at runtime.
   * @param {Object} node - { id: string, url: string }
   */
  addStorageNode: (node) => {
    hashRing.addNode(node);
    console.log(`[ReplicaSelectionService] Dynamically added node ${node.id} (${node.url}) to the Hash Ring.`);
  },

  /**
   * Remove a storage node from the ring dynamically at runtime.
   * @param {string} nodeId 
   */
  removeStorageNode: (nodeId) => {
    hashRing.removeNode(nodeId);
    console.log(`[ReplicaSelectionService] Dynamically removed node ${nodeId} from the Hash Ring.`);
  },

  /**
   * Get the current ring status, virtual node counts, and key distribution metrics.
   */
  getRingStatus: () => {
    return hashRing.getStatus();
  },

  /**
   * Direct access to underlying HashRing instance (for diagnostics/testing).
   */
  getHashRing: () => hashRing
};

export default replicaSelectionService;
