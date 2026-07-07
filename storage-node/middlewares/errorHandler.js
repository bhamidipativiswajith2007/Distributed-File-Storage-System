/**
 * @file storage-node/middlewares/errorHandler.js
 * @description Global error handler middleware for the Storage Node.
 * 
 * Concept: Express Error-Handling Middleware
 * Express distinguishes error handlers from regular middlewares by checking the number of parameters.
 * If a middleware function defines exactly FOUR parameters (error, request, response, next),
 * Express knows it is an error handler. Whenever an error is thrown in any controller or route
 * (either synchronously or caught in a try/catch and passed to next(error)), Express bypasses
 * all other route handlers and directs the request straight here.
 */

/**
 * Purpose: Catch all errors thrown in the Storage Node and return a clean JSON response.
 * Input:
 *   - error: The Error object thrown by the application.
 *   - request: The Express request object.
 *   - response: The Express response object.
 *   - next: The Express next middleware callback.
 * Output: Standardized JSON error response sent to the client.
 * High-Level Workflow:
 *   1. Log the full error stack to the server console for developers to debug.
 *   2. Determine the HTTP status code (default to 500 Internal Server Error if not specified).
 *   3. Respond to the client with a JSON object containing the error message.
 */
export const errorHandler = (error, request, response, next) => {
  // Log the complete error trace to the server logs
  console.error(`[Storage Node Error] ${error.stack || error.message}`);
  
  // Use the error's custom status code if it exists, otherwise fall back to 500 (Internal Server Error)
  const statusCode = error.statusCode || 500;
  
  // Send a JSON response to prevent the server from hanging or leaking raw stack traces to the client
  response.status(statusCode).json({
    success: false,
    error: error.message || 'Internal Server Error'
  });
};
