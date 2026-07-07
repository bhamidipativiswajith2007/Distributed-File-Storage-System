/**
 * @file metadata-service/routes/fileRoutes.js
 * @description Express routing configuration for file upload, list, download, and delete operations.
 */

import express from 'express';
import { uploadMiddleware } from '../middlewares/upload.js';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  getFiles
} from '../controllers/fileController.js';

const router = express.Router();

// Upload a file. Uses Multer uploadMiddleware first, then calls uploadFile controller
router.post('/files/upload', uploadMiddleware, uploadFile);

// Retrieve listing of all files metadata
router.get('/files', getFiles);

// Download file. Sequentially downloads chunks and verifies checksums
router.get('/files/:fileId/download', downloadFile);

// Delete file. Deletes chunks from storage node, then removes database records
router.delete('/files/:fileId', deleteFile);

export default router;
