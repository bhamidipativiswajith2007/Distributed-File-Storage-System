/**
 * @file metadata-service/tests/testReplicaSelection.js
 * @description Verifies integration of replicaSelectionService with Consistent Hashing.
 */

import { replicaSelectionService } from '../services/replicaSelectionService.js';
import { v4 as uuidv4 } from 'uuid';

console.log('=== TEST 1: Ring Status Inspection ===');
const status = replicaSelectionService.getRingStatus();
console.log('Initial Ring Status:', JSON.stringify(status, null, 2));

if (status.totalPhysicalNodes < 3) {
  throw new Error('Expected at least 3 initial physical nodes');
}

console.log('\n=== TEST 2: Deterministic Chunk Replica Placement ===');
const sampleChunkId = uuidv4();
const replicas1 = replicaSelectionService.getReplicasForChunk(sampleChunkId);
const replicas2 = replicaSelectionService.getReplicasForChunk(sampleChunkId);

console.log(`Chunk ${sampleChunkId} -> Replicas run 1:`, replicas1.map(r => r.id));
console.log(`Chunk ${sampleChunkId} -> Replicas run 2:`, replicas2.map(r => r.id));

if (replicas1[0].id !== replicas2[0].id || replicas1[1].id !== replicas2[1].id) {
  throw new Error('Consistent hashing must be deterministic for the same chunkId!');
}

if (replicas1[0].id === replicas1[1].id) {
  throw new Error('Replicas must be placed on distinct physical nodes!');
}

console.log('\n=== TEST 3: Dynamic Node Addition and Removal ===');
replicaSelectionService.addStorageNode({ id: 'node-99', url: 'http://localhost:5099' });
const statusWith99 = replicaSelectionService.getRingStatus();
console.log('Status after adding node-99: total nodes =', statusWith99.totalPhysicalNodes);

if (!statusWith99.physicalNodes.some(n => n.id === 'node-99')) {
  throw new Error('node-99 should be in physical nodes');
}

replicaSelectionService.removeStorageNode('node-99');
const statusAfterRemove = replicaSelectionService.getRingStatus();
console.log('Status after removing node-99: total nodes =', statusAfterRemove.totalPhysicalNodes);

if (statusAfterRemove.physicalNodes.some(n => n.id === 'node-99')) {
  throw new Error('node-99 should have been removed');
}

console.log('\n✅ ALL REPLICA SELECTION INTEGRATION TESTS PASSED!');
