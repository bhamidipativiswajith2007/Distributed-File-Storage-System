/**
 * @file metadata-service/routes/clusterRoutes.js
 * @description API routes for inspecting and dynamically managing the Consistent Hashing Ring.
 * 
 * Concepts Used:
 * - Dynamic Cluster Membership: Allows adding and removing storage nodes at runtime without downtime.
 * - Ring Inspection & Observability: Exposes token distribution and key routing lookups for diagnostics.
 */

import express from 'express';
import { replicaSelectionService } from '../services/replicaSelectionService.js';
import { config } from '../config/index.js';

const router = express.Router();

/**
 * GET /cluster/ring-status
 * Purpose: Inspect the current state of the Consistent Hashing Ring.
 */
router.get('/ring-status', (req, res) => {
  const status = replicaSelectionService.getRingStatus();
  return res.status(200).json({
    status: 'success',
    replicationFactor: config.REPLICATION_FACTOR,
    ring: status
  });
});

/**
 * GET /cluster/ring-lookup?key=<chunkIdOrKey>
 * Purpose: Determine which storage nodes own a given chunk ID or key.
 */
router.get('/ring-lookup', (req, res) => {
  const { key } = req.query;
  if (!key) {
    return res.status(400).json({ error: 'Query parameter "key" is required.' });
  }

  const replicas = replicaSelectionService.getReplicasForChunk(key);
  return res.status(200).json({
    key,
    primaryNode: replicas[0] || null,
    replicas: replicas.map(node => ({ id: node.id, url: node.url }))
  });
});

/**
 * POST /cluster/nodes
 * Purpose: Dynamically register a new storage node into the Hash Ring.
 * Body: { id: "node-4", url: "http://storage-node-4:5004" }
 */
router.post('/nodes', (req, res) => {
  const { id, url } = req.body;
  if (!id || !url) {
    return res.status(400).json({ error: 'Both "id" and "url" are required.' });
  }

  replicaSelectionService.addStorageNode({ id, url });
  return res.status(201).json({
    status: 'success',
    message: `Node ${id} added to the Consistent Hash Ring.`,
    ring: replicaSelectionService.getRingStatus()
  });
});

/**
 * DELETE /cluster/nodes/:nodeId
 * Purpose: Dynamically remove a storage node from the Hash Ring.
 */
router.delete('/nodes/:nodeId', (req, res) => {
  const { nodeId } = req.params;
  replicaSelectionService.removeStorageNode(nodeId);
  return res.status(200).json({
    status: 'success',
    message: `Node ${nodeId} removed from the Consistent Hash Ring.`,
    ring: replicaSelectionService.getRingStatus()
  });
});

export default router;
