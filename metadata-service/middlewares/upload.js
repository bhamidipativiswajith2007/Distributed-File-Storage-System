/**
 * @file metadata-service/middlewares/upload.js
 * @description Multer configuration middleware for parsing file uploads.
 * 
 * Concept: Why Multer & Disk Storage?
 * 1. Why Multer: Standard Express request parsers (like express.json()) cannot parse file data. 
 *    HTTP file uploads use the `multipart/form-data` encoding, which formats the request body as a stream of text 
 *    and binary blocks separated by "boundary" markers. Multer parses this complex stream for us.
 * 2. Why Disk Storage over Memory Storage: By default, if we use memory storage, Multer buffers the ENTIRE 
 *    uploaded file into RAM. A 500MB upload would instantly consume 500MB of RAM. If multiple users do this, 
 *    the server crashes with an Out of Memory (OOM) error. Using `diskStorage` streams the incoming bytes 
 *    directly to a temporary file on disk, keeping our server memory footprint negligible.
 */

import multer from 'multer';
import fs from 'fs';
import { config } from '../config/index.js';

// Ensure the temporary upload directory exists before registering the middleware.
// If missing, we create it recursively.
if (!fs.existsSync(config.TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(config.TEMP_UPLOAD_DIR, { recursive: true });
}

// Define storage location and file naming scheme
const diskStorageConfig = multer.diskStorage({
  // Destination: Where to write the temporary file on disk
  destination: (request, file, callback) => {
    callback(null, config.TEMP_UPLOAD_DIR);
  },
  // Filename: Generate a unique file name to avoid collisions when two users upload files at the same time
  filename: (request, file, callback) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    callback(null, `${file.fieldname}-${uniqueSuffix}`);
  }
});

// Configure and export the Multer middleware instance
export const uploadMiddleware = multer({
  storage: diskStorageConfig,
  limits: {
    // Enforce file size limit at the middleware level. 
    // If the file exceeds this limit, Multer immediately throws a 'LIMIT_FILE_SIZE' error.
    fileSize: config.MAX_FILE_SIZE
  }
}).single('file'); // Expect a single file in the form-data parameter named "file"
