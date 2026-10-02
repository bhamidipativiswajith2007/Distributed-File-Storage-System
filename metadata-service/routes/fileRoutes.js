/**
 * @file metadata-service/routes/fileRoutes.js
 * @description Express routing configuration for file upload, list, download, and delete operations.
 */

import express from 'express';
import { uploadMiddleware } from '../middlewares/upload.js';
import { requireAuth } from '../middlewares/auth.js';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  getFiles
} from '../controllers/fileController.js';

const router = express.Router();

// Upload a file. MUST be logged in. Uses Multer first, then uploadFile controller
router.post('/files/upload', requireAuth, uploadMiddleware, uploadFile);

// Retrieve listing of files (Only returns files owned by the logged-in user)
router.get('/files', requireAuth, getFiles);

// Download file. Verifies ownership and chunk integrity
router.get('/files/:fileId/download', requireAuth, downloadFile);

// Delete file. Verifies ownership before cluster-wide deletion
router.delete('/files/:fileId', requireAuth, deleteFile);

export default router;
