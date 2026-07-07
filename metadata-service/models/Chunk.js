/**
 * @file metadata-service/models/Chunk.js
 * @description Mongoose Schema defining the MongoDB model for chunk metadata mapping.
 * 
 * Concept: Compound Database Indexes
 * A file is split into multiple ordered chunks. When downloading, we query MongoDB for all chunks
 * belonging to a `fileId` and sort them by `chunkIndex`.
 * 
 * To make this query lightning-fast, we define a "compound index" on { fileId: 1, chunkIndex: 1 }.
 * Instead of scanning the entire collection (table scan), MongoDB uses a pre-sorted tree-like index structure.
 * This guarantees sorting and retrieval happen in O(log N) time rather than O(N).
 */

import mongoose from 'mongoose';

/**
 * Chunk Schema
 * Represents the mapping metadata for an individual slice of a file.
 * 
 * Fields:
 * - chunkId: The unique UUID of the chunk file saved on the Storage Node.
 * - fileId: Reference to the parent File's unique UUID.
 * - chunkIndex: The position of this chunk in the file (0-indexed). Used for reassembly.
 * - checksum: The SHA-256 hash of the chunk's binary data (used to verify file integrity on download).
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
    }
  },
  {
    versionKey: false // Hide the "__v" field
  }
);

// Compound index: Optimizes the frequent query Chunk.find({ fileId }).sort({ chunkIndex: 1 })
// The index stores the data pre-sorted by fileId and then by chunkIndex.
ChunkSchema.index({ fileId: 1, chunkIndex: 1 });

export const Chunk = mongoose.model('Chunk', ChunkSchema);
export default Chunk;
