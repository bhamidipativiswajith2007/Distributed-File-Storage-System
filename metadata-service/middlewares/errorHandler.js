/**
 * @file metadata-service/middlewares/errorHandler.js
 * @description Global error handler middleware for the Metadata Service.
 * 
 * Concepts Used:
 * - Express Error Handling: Catches application errors and format them into clean client responses.
 * - Multer Error Filtering: Intercepts specific file upload limit errors (like files exceeding MAX_FILE_SIZE)
 *   and returns a clear, user-friendly 400 Bad Request response.
 */

import { config } from '../config/index.js';

/**
 * Purpose: Catch and respond to errors thrown in the Metadata Service.
 * Input:
 *   - error: The error object.
 *   - request: Express request object.
 *   - response: Express response object.
 *   - next: Callback to next middleware.
 * Output: Standardized JSON response based on error type.
 * High-Level Workflow:
 *   1. Check if the error was thrown by Multer due to file size limits.
 *   2. Check if the error is generic Multer parsing errors.
 *   3. Fall back to standard server status codes (500 or custom code).
 *   4. Return a structured JSON message containing the error details.
 */
export const errorHandler = (error, request, response, next) => {
  // Log the complete stack trace to the console for backend debugging
  console.error(`[Metadata Service Error] ${error.stack || error.message}`);

  // Handle Multer-specific file size limits
  if (error.code === 'LIMIT_FILE_SIZE') {
    const maxFileSizeInMb = (config.MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
    return response.status(400).json({
      success: false,
      error: `File upload rejected: exceeds maximum allowed size of ${maxFileSizeInMb}MB.`
    });
  }

  // Handle other Multer parsing errors (e.g. invalid form fields)
  if (error.name === 'MulterError') {
    return response.status(400).json({
      success: false,
      error: `Upload error: ${error.message}`
    });
  }

  // Fall back to the error's custom status code or default to 500 (Internal Server Error)
  const statusCode = error.statusCode || 500;
  response.status(statusCode).json({
    success: false,
    error: error.message || 'Internal Server Error'
  });
};
