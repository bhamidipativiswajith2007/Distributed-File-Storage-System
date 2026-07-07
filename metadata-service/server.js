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
import { config } from './config/index.js';
import fileRoutes from './routes/fileRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// Parse JSON request payloads
app.use(express.json());

// Mount files routes at the root
app.use('/', fileRoutes);

// Register global error handler middleware (must be registered last)
app.use(errorHandler);

/**
 * Purpose: Establish connection to MongoDB and start Express server listener.
 * Output: Logs status messages to the console or exits process on failure.
 * High-Level Workflow:
 *   1. Connect to MongoDB using the configured URI string.
 *   2. If successful, log connection message and start listening for HTTP requests.
 *   3. If connection fails, log the error and terminate the process.
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
