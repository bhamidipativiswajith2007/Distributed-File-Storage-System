/**
 * @file storage-node/config/index.js
 * @description Centralized configuration loader for the Storage Node.
 * 
 * Why this file exists:
 * The Storage Node operates independently from the Metadata Service. It has its own config file
 * to load values like its active port and where it stores the binary chunk files on disk.
 * 
 * Concept: Port-partitioned Storage Directories
 * To run multiple instances of the storage node from the same codebase without them overwriting
 * or mixing each other's files, we automatically append the node's PORT to the storage directory.
 * E.g., Node 1 (port 5001) stores chunks in data/chunks/5001/, while Node 2 (port 5002) stores in data/chunks/5002/.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Reconstruct __dirname since global variables are unavailable in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables relative to the storage-node root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const activePort = parseInt(process.env.PORT, 10) || 5001;

export const config = {
  PORT: activePort,
  
  // Storage directory partitioned by port to keep nodes isolated
  CHUNKS_DIR: path.resolve(__dirname, `../data/chunks/${activePort}`)
};
