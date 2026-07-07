/**
 * @file metadata-service/models/Chunk.js
 * @description Mongoose Schema defining the MongoDB model for chunk metadata mapping.
 * 
 * Concept: Replicas Storage Array
 * In Phase 3, we support storing multiple copies of each chunk.
 * To do this, we replace the single `nodeId` field with a `replicas` array of Strings.
 * This array contains the nodeIds (e.g. ["node-1", "node-2"]) of every storage node hosting
 * a physical copy of the chunk.
 */

import mongoose from 'mongoose';

/**
 * Chunk Schema
 * Represents the mapping metadata for an individual slice of a file, tracking all replicas.
 * 
 * Fields:
 * - chunkId: The unique UUID of the chunk file saved on the designated Storage Nodes.
 * - fileId: Reference to the parent File's unique UUID.
 * - chunkIndex: The position of this chunk in the file (0-indexed). Used for reassembly.
 * - checksum: The SHA-256 hash of the chunk's binary data (used to verify file integrity on download).
 * - replicas: Array of nodeIds (e.g. ["node-1", "node-2"]) representing all nodes storing a copy of the chunk.
 */
const ChunkSchema = new mongoose.Schema(
  {
    chunkId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    fileId: {
      type: String,
      required: true,
      index: true
    },
    chunkIndex: {
      type: Number,
      required: true
    },
    checksum: {
      type: String,
      required: true
    },
    replicas: {
      type: [String],
      required: true,
      // Ensure the array contains at least one node location mapping
      validate: {
        validator: (array) => Array.isArray(array) && array.length > 0,
        message: 'A chunk must be mapped to at least one replica node.'
      }
    }
  },
  {
    versionKey: false // Hide the "__v" field
  }
);

// Compound index: Optimizes the query Chunk.find({ fileId }).sort({ chunkIndex: 1 })
ChunkSchema.index({ fileId: 1, chunkIndex: 1 });

export const Chunk = mongoose.model('Chunk', ChunkSchema);
export default Chunk;
