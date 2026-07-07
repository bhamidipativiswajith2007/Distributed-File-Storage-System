/**
 * @file metadata-service/config/index.js
 * @description Centralized configuration loader for the Metadata Service.
 * 
 * Why this file exists:
 * Reading process.env directly inside controllers or services leads to code that is hard to test and maintain.
 * Centralizing all environment variables here allows us to:
 * 1. Define sensible defaults if variables are missing.
 * 2. Sanitize and parse strings to actual numbers or booleans.
 * 3. Act as a single point of failure (if an environment variable is invalid, we fail fast during server boot).
 * 
 * Node.js & ES Modules Concepts Used:
 * - `import.meta.url`: Contains the absolute URL of the current module file.
 * - `fileURLToPath`: Converts a file URL (e.g. file:///d:/...) to a standard file path.
 * - `path.resolve` & `path.dirname`: Manipulates paths safely across different Operating Systems (Windows uses backslashes "\", Linux/macOS use forward slashes "/").
 * - In ES Modules, global variables like `__dirname` and `__filename` do NOT exist. We must reconstruct them manually.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Recreate __dirname for path resolution in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load env variables from the root of the metadata-service folder (.env)
// We locate the .env relative to this config file to avoid running issues depending on where "node server.js" is launched from.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  // Port where the metadata service Express server will listen.
  PORT: parseInt(process.env.PORT, 10) || 5000,

  // MongoDB connection string. MongoDB stores the files metadata and chunk hashes.
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/distributed_storage',

  // The base address of the Storage Node. Used by Axios to upload and download chunk binaries.
  STORAGE_NODE_URL: process.env.STORAGE_NODE_URL || 'http://localhost:5001',

  // Chunk size in bytes (defaults to 4MB). 
  // We use parseInt because process.env variables are always strings, but our chunker logic requires a Number.
  CHUNK_SIZE: parseInt(process.env.CHUNK_SIZE, 10) || 4194304,

  // Max allowed upload size (defaults to 500MB). Used to reject large payloads before processing.
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 524288000,

  // Directory path where Multer will store incoming files temporarily on disk before chunking.
  // Using path.resolve guarantees that the path is absolute and clean.
  TEMP_UPLOAD_DIR: path.resolve(__dirname, '../temp/uploads')
};
