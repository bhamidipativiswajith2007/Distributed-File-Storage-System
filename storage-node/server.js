/**
 * @file storage-node/server.js
 * @description Main entry point for the Storage Node Express application.
 * 
 * Express Boilerplate Concept:
 * - `express()` creates an instance of the Express framework application.
 * - `express.json()` middleware parses incoming HTTP request bodies with JSON content.
 * - `app.use()` mounts routing path handlers and middlewares.
 * - `app.listen()` binds the application to a specific port and listens for incoming connections.
 */

import express from 'express';
import { config } from './config/index.js';
import chunkRoutes from './routes/chunkRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// Middleware to parse JSON payloads. 
// Note: PUT requests containing binary data will bypass this parser and be read as a stream in the controller.
app.use(express.json());

// Mount the chunk router at root
app.use('/', chunkRoutes);

// Register the global error handler middleware.
// Must be registered AFTER all other routers and middlewares so it can catch their errors.
app.use(errorHandler);

// Start listening for HTTP request events
app.listen(config.PORT, () => {
  console.log(`[Storage Node] Running on port ${config.PORT}`);
});
