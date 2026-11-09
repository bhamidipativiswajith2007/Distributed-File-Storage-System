/**
 * @file metadata-service/server.js
 * @description Main entry point for the Metadata Service Express application.
 * 
 * Concepts Used:
 * - Mongoose Database Connection: Mongoose simplifies MongoDB connections. We connect before starting
 *   the Express HTTP server. If the database connection fails, the server fails fast and exits, which 
 *   prevents running the server in an un-queriable broken state.
 */

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { config } from './config/index.js';
import authRoutes from './routes/authRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import clusterRoutes from './routes/clusterRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// Enable CORS for frontend connectivity
app.use(cors());

// Parse JSON request payloads
app.use(express.json());

// Mount Authentication routes
app.use('/auth', authRoutes);

// Mount Cluster & Consistent Hash Ring diagnostics routes
app.use('/cluster', clusterRoutes);

// Mount files routes at the root
app.use('/', fileRoutes);

// Register global error handler middleware (must be registered last)
app.use(errorHandler);

/**
 * Purpose: Establish connection to MongoDB and start Express server listener.
 * Output: Logs status messages to the console or exits process on failure.
 */
const initializeDatabaseAndStartServer = async () => {
  try {
    console.log(`[Metadata Service] Connecting to MongoDB at ${config.MONGO_URI}...`);
    await mongoose.connect(config.MONGO_URI);
    console.log('[Metadata Service] Connected to MongoDB successfully.');

    app.listen(config.PORT, () => {
      console.log(`[Metadata Service] Running on port ${config.PORT}`);
    });
  } catch (error) {
    console.error('[Metadata Service] Database connection failed:', error.message);
    process.exit(1); // Exit process with failure code 1
  }
};

initializeDatabaseAndStartServer();
