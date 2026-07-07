/**
 * @file metadata-service/models/File.js
 * @description Mongoose Schema defining the MongoDB model for file metadata.
 * 
 * Concept: Database vs Physical Storage Segregation
 * In a distributed file system, we never store file binary data (bytes) directly in MongoDB.
 * Databases are designed for structured queries and indexing, not for heavy binary blobs.
 * Storing large files in databases causes massive memory overhead, slow query performance,
 * and bloating. Instead, MongoDB stores only file METADATA (name, size, creation date) and a unique ID.
 */

import mongoose from 'mongoose';

/**
 * File Schema
 * Represents the top-level metadata of an uploaded file.
 * 
 * Fields:
 * - fileId: A unique UUID generated on upload to identify this file across the entire system.
 * - fileName: The original name of the file (e.g. "profile.jpg").
 * - fileSize: Total size of the file in bytes.
 * - totalChunks: How many slices (chunks) the file was split into.
 * - createdAt: Timestamp of when the upload occurred.
 */
const FileSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      unique: true,
      index: true // Indexing makes searches (e.g. downloads/deletes) extremely fast
    },
    fileName: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    totalChunks: {
      type: Number,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    // Disables the auto-generated "__v" version key field that Mongoose adds by default.
    // We don't need document versioning for this simple metadata tracking.
    versionKey: false 
  }
);

export const File = mongoose.model('File', FileSchema);
export default File;
