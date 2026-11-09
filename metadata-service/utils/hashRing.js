/**
 * @file metadata-service/utils/hashRing.js
 * @description Production-grade Consistent Hashing Ring with Virtual Nodes and Binary Search.
 * 
 * Concepts Used:
 * - 32-bit Integer Keyspace: MD5 hash is truncated to a 32-bit unsigned integer (0 to 4,294,967,295).
 * - Virtual Nodes (vnodes): Each physical node is hashed V times (default 150) to smooth out statistical variance and prevent hotspots.
 * - Binary Search (Bisect Right): Finding the owner of a key takes O(log(N * V)) time.
 * - Ring Wrap-Around: If a key's hash exceeds the largest token on the ring, it wraps clockwise to the first node (token 0).
 * - Distinct Physical Replicas: When selecting R replicas, we walk clockwise and skip virtual nodes belonging to already-selected physical nodes.
 */

import crypto from 'crypto';

export class HashRing {
  /**
   * @param {Array<Object>} nodes - Array of physical node objects, e.g. [{ id: 'node-1', url: '...' }]
   * @param {number} vnodesPerNode - Number of virtual nodes per physical node (default: 150)
   */
  constructor(nodes = [], vnodesPerNode = 150) {
    this.vnodesPerNode = vnodesPerNode;
    // Map: token (number) -> physical node object
    this.ring = new Map();
    // Sorted array of 32-bit integer tokens
    this.sortedTokens = [];
    // Map: physical nodeId -> node object
    this.physicalNodes = new Map();

    nodes.forEach(node => this.addNode(node));
  }

  /**
   * Hashes any string key into an unsigned 32-bit integer (0 to 2^32 - 1).
   * @param {string} key 
   * @returns {number}
   */
  hash(key) {
    return crypto
      .createHash('md5')
      .update(String(key))
      .digest()
      .readUInt32BE(0);
  }

  /**
   * Add a physical node and its virtual nodes to the hash ring.
   * @param {Object} node - { id: string, url: string, ... }
   */
  addNode(node) {
    if (!node || !node.id) {
      throw new Error('Node must have a valid id');
    }

    if (this.physicalNodes.has(node.id)) {
      return; // Node already exists in ring
    }

    this.physicalNodes.set(node.id, node);

    // Generate virtual nodes
    for (let i = 0; i < this.vnodesPerNode; i++) {
      const vnodeKey = `${node.id}#vnode-${i}`;
      const token = this.hash(vnodeKey);
      this.ring.set(token, node);
      this.sortedTokens.push(token);
    }

    // Keep tokens sorted in ascending order for binary search
    this.sortedTokens.sort((a, b) => a - b);
  }

  /**
   * Remove a physical node and all its virtual nodes from the hash ring.
   * @param {string} nodeId 
   */
  removeNode(nodeId) {
    if (!this.physicalNodes.has(nodeId)) {
      return;
    }

    this.physicalNodes.delete(nodeId);

    // Filter out tokens belonging to this node
    this.sortedTokens = this.sortedTokens.filter(token => {
      const node = this.ring.get(token);
      if (node && node.id === nodeId) {
        this.ring.delete(token);
        return false;
      }
      return true;
    });
  }

  /**
   * Binary search (bisect_right) to find the first token >= keyToken.
   * If keyToken is larger than all tokens in the ring, wrap around to index 0.
   * @param {number} keyToken 
   * @returns {number} Index in this.sortedTokens
   */
  _findTokenIndex(keyToken) {
    if (this.sortedTokens.length === 0) return -1;

    let low = 0;
    let high = this.sortedTokens.length - 1;

    // If keyToken is greater than the largest token, wrap around to the first token
    if (keyToken > this.sortedTokens[high]) {
      return 0;
    }

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.sortedTokens[mid] >= keyToken) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return low;
  }

  /**
   * Get the primary storage node responsible for a given key.
   * @param {string} key 
   * @returns {Object|null} Node object
   */
  getNode(key) {
    const nodes = this.getNodes(key, 1);
    return nodes.length > 0 ? nodes[0] : null;
  }

  /**
   * Get target storage nodes for a key with replication.
   * Walks clockwise along the ring to find distinct physical nodes.
   * @param {string} key - Chunk ID or key identifier
   * @param {number} count - Number of distinct physical replicas desired
   * @returns {Array<Object>} Array of unique physical node objects
   */
  getNodes(key, count = 1) {
    if (this.sortedTokens.length === 0) {
      return [];
    }

    const keyToken = this.hash(key);
    let startIndex = this._findTokenIndex(keyToken);
    if (startIndex === -1) return [];

    const selectedNodes = [];
    const seenNodeIds = new Set();
    const maxNodesToSelect = Math.min(count, this.physicalNodes.size);

    for (let i = 0; i < this.sortedTokens.length; i++) {
      const currIndex = (startIndex + i) % this.sortedTokens.length;
      const token = this.sortedTokens[currIndex];
      const physicalNode = this.ring.get(token);

      if (physicalNode && !seenNodeIds.has(physicalNode.id)) {
        seenNodeIds.add(physicalNode.id);
        selectedNodes.push(physicalNode);

        if (selectedNodes.length === maxNodesToSelect) {
          break;
        }
      }
    }

    return selectedNodes;
  }

  /**
   * Return high-level ring statistics and health.
   */
  getStatus() {
    const nodeDistribution = {};
    for (const token of this.sortedTokens) {
      const node = this.ring.get(token);
      if (node) {
        nodeDistribution[node.id] = (nodeDistribution[node.id] || 0) + 1;
      }
    }

    return {
      totalPhysicalNodes: this.physicalNodes.size,
      totalVirtualNodes: this.sortedTokens.length,
      vnodesPerNode: this.vnodesPerNode,
      physicalNodes: Array.from(this.physicalNodes.values()).map(n => ({ id: n.id, url: n.url })),
      distribution: nodeDistribution
    };
  }
}

export default HashRing;
