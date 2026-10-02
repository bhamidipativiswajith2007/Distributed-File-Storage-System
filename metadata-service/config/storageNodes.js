/**
 * @file metadata-service/config/storageNodes.js
 * @description Configuration file listing active Storage Nodes in the cluster.
 * 
 * Concept: Configuration-driven Service Discovery
 * In Phase 2, we define storage nodes statically inside a configuration array.
 * In future phases, we will upgrade this to use dynamic heartbeats and a database registry.
 * By keeping the node list in this single config file, we can easily change ports or add new nodes
 * without modifying our core upload/download business logic.
 */

export const storageNodes = [
  {
    id: 'node-1',
    url: process.env.NODE_1_URL || 'http://localhost:5001'
  },
  {
    id: 'node-2',
    url: process.env.NODE_2_URL || 'http://localhost:5002'
  },
  {
    id: 'node-3',
    url: process.env.NODE_3_URL || 'http://localhost:5003'
  }
];

export default storageNodes;
