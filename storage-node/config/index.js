/**
 * @file storage-node/config/index.js
 * @description Centralized configuration loader for the Storage Node.
 * 
 * Why this file exists:
 * The Storage Node operates independently from the Metadata Service. It has its own config file
 * to load values like its active port and where it stores the binary chunk files on disk.
 * 
 * Node.js & ES Modules Concepts Used:
 * - `import.meta.url` & `fileURLToPath`: Reconstructs the absolute directory path (`__dirname`) in ES Modules.
 * - `dotenv.config`: Loads environmental configurations from `storage-node/.env`.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Reconstruct __dirname since global variables are unavailable in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables relative to the storage-node root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  // Port on which this storage node runs (defaults to 5001).
  PORT: parseInt(process.env.PORT, 10) || 5001,
  
  // The absolute path to the directory where chunk binary files (.bin) are saved.
  // We resolve it to storage-node/data/chunks.
  CHUNKS_DIR: path.resolve(__dirname, '../data/chunks')
};
