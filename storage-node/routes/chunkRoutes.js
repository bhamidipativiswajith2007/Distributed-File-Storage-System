/**
 * @file storage-node/routes/chunkRoutes.js
 * @description Express router configuration mapping chunk endpoints to controller functions.
 */

import express from 'express';
import {
  uploadChunk,
  downloadChunk,
  deleteChunk,
  getHealth
} from '../controllers/chunkController.js';

const router = express.Router();

// Health check endpoint for checking storage node availability
router.get('/health', getHealth);

// PUT expects binary stream body to write chunk file on disk
router.put('/chunks/:chunkId', uploadChunk);

// GET streams the binary chunk file back to the requester
router.get('/chunks/:chunkId', downloadChunk);

// DELETE unlinks the chunk file from disk
router.delete('/chunks/:chunkId', deleteChunk);

export default router;
