/**
 * @file metadata-service/config/index.js
 * @description Centralized configuration loader for the Metadata Service.
 * 
 * Concepts Used:
 * - Environment Variable Management: Reads and sanitizes parameters from the environment.
 * - ESM Path Resolution: Manual reconstruction of `__dirname` using `import.meta.url`.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for path resolution in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables relative to the config file path
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  // Port where the metadata service Express server will listen.
  PORT: parseInt(process.env.PORT, 10) || 5000,

  // MongoDB connection string.
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/distributed_storage',

  // The base address of the Storage Node (default, still used as fallback).
  STORAGE_NODE_URL: process.env.STORAGE_NODE_URL || 'http://localhost:5001',

  // Chunk size in bytes (defaults to 4MB). 
  CHUNK_SIZE: parseInt(process.env.CHUNK_SIZE, 10) || 4194304,

  // Max allowed upload size (defaults to 500MB).
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 524288000,

  // Directory path where Multer will store incoming files temporarily on disk.
  TEMP_UPLOAD_DIR: path.resolve(__dirname, '../temp/uploads'),

  // The number of different storage nodes where each chunk copy will be saved.
  // We use parseInt because environment variables are loaded as strings.
  REPLICATION_FACTOR: parseInt(process.env.REPLICATION_FACTOR, 10) || 2
};
