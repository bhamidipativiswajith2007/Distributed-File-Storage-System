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
    url: 'http://localhost:5001'
  },
  {
    id: 'node-2',
    url: 'http://localhost:5002'
  },
  {
    id: 'node-3',
    url: 'http://localhost:5003'
  }
];

export default storageNodes;
