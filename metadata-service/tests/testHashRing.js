/**
 * @file metadata-service/tests/testHashRing.js
 * @description Verifies Consistent Hashing behavior, uniform distribution, and minimal key remapping.
 */

import { HashRing } from '../utils/hashRing.js';

const initialNodes = [
  { id: 'node-1', url: 'http://localhost:5001' },
  { id: 'node-2', url: 'http://localhost:5002' },
  { id: 'node-3', url: 'http://localhost:5003' }
];

console.log('=== TEST 1: Initializing Hash Ring with 3 Nodes ===');
const ring = new HashRing(initialNodes, 150);
const status = ring.getStatus();
console.log('Ring Status:', status);

if (status.totalPhysicalNodes !== 3 || status.totalVirtualNodes !== 450) {
  throw new Error('Test 1 failed: expected 3 physical nodes and 450 vnodes');
}

console.log('\n=== TEST 2: Distribution Across 10,000 Keys ===');
const keyAssignments = { 'node-1': 0, 'node-2': 0, 'node-3': 0 };
const NUM_KEYS = 10000;
const sampleKeys = [];

for (let i = 0; i < NUM_KEYS; i++) {
  const key = `chunk_${i}_file_abc`;
  sampleKeys.push(key);
  const primaryNode = ring.getNode(key);
  keyAssignments[primaryNode.id]++;
}

console.log('Distribution across 10,000 keys:', keyAssignments);
// Each node should ideally get ~33% (+/- 6%)
for (const [nodeId, count] of Object.entries(keyAssignments)) {
  const pct = (count / NUM_KEYS) * 100;
  console.log(`${nodeId}: ${count} keys (${pct.toFixed(2)}%)`);
  if (pct < 25 || pct > 42) {
    throw new Error(`Test 2 failed: ${nodeId} has uneven distribution (${pct}%)`);
  }
}

console.log('\n=== TEST 3: Multi-Node Replica Selection (R=2) ===');
for (let i = 0; i < 5; i++) {
  const replicas = ring.getNodes(`chunk_sample_${i}`, 2);
  console.log(`Key chunk_sample_${i} replicas:`, replicas.map(r => r.id));
  if (replicas.length !== 2) throw new Error('Expected 2 replicas');
  if (replicas[0].id === replicas[1].id) throw new Error('Replicas must be distinct physical nodes');
}

console.log('\n=== TEST 4: Adding a 4th Node (Minimal Key Movement) ===');
const oldNodeMap = new Map();
sampleKeys.forEach(key => oldNodeMap.set(key, ring.getNode(key).id));

// Add node-4
ring.addNode({ id: 'node-4', url: 'http://localhost:5004' });
console.log('Added node-4. New Ring Status:', ring.getStatus());

let keysMoved = 0;
let movedToNewNode = 0;
sampleKeys.forEach(key => {
  const newNode = ring.getNode(key).id;
  const oldNode = oldNodeMap.get(key);
  if (newNode !== oldNode) {
    keysMoved++;
    if (newNode === 'node-4') {
      movedToNewNode++;
    }
  }
});

const movedPct = (keysMoved / NUM_KEYS) * 100;
console.log(`Keys moved after adding 4th node: ${keysMoved} / ${NUM_KEYS} (${movedPct.toFixed(2)}%)`);
console.log(`Keys that moved directly to node-4: ${movedToNewNode}`);

// In modulo hashing, ~75% of keys move when going from 3 to 4 nodes.
// In consistent hashing, only ~1/(N+1) = ~25% of keys should move!
if (movedPct > 35) {
  throw new Error(`Test 4 failed: Expected ~25% movement, but ${movedPct}% moved!`);
}

console.log('\n✅ ALL HASH RING TESTS PASSED SUCCESSFULLY!');
