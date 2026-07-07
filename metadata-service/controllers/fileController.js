/**
 * @file metadata-service/controllers/fileController.js
 * @description Controller mapping HTTP endpoints to business services for file uploads, downloads, list, and delete.
 * 
 * Concepts Used:
 * - Active Stream Termination: Standard web servers send a `200 OK` status and headers before they write data. 
 *   If chunk 3 fails its SHA-256 integrity check, the status code has already been sent to the client as `200 OK`. 
 *   We cannot change it to `500`. To handle this, we immediately destroy the underlying TCP socket (`response.destroy()`). 
 *   This signals a network transmission failure to the client's browser, preventing them from saving a corrupted file.
 */

import { fileService } from '../services/fileService.js';

/**
 * Purpose: Receive uploaded file metadata and handle errors.
 * Input:
 *   - request: Express request containing req.file metadata.
 *   - response: Express response object.
 *   - next: Callback to error middleware.
 * Output: JSON response returning 201 Created and the new fileId.
 */
export const uploadFile = async (request, response, next) => {
  try {
    if (!request.file) {
      return response.status(400).json({
        success: false,
        error: 'No file uploaded. Ensure multipart/form-data field name is "file".'
      });
    }

    console.log(`[FileController] Received file: ${request.file.originalname} (Size: ${request.file.size} bytes)`);

    // Delegate chunking and database persistence to the file service
    const fileId = await fileService.uploadFile(request.file.path, request.file.originalname);

    return response.status(201).json({
      success: true,
      fileId
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Purpose: Stream file chunks back to client with checksum validation.
 * Input:
 *   - request: Express request containing fileId in URL parameters (GET /files/:fileId/download).
 *   - response: Express response stream.
 *   - next: Callback to error middleware.
 */
export const downloadFile = async (request, response, next) => {
  try {
    const { fileId } = request.params;
    await fileService.downloadFile(fileId, response);
  } catch (error) {
    // If headers have already been sent to the client, we cannot modify the HTTP status code
    if (response.headersSent) {
      console.error(`[FileController] Error during active download stream: ${error.message}`);
      // Destroy the client connection socket to abort the download and prevent sending corrupted data
      response.destroy();
    } else {
      next(error); // Send to global error middleware for a clean 500 JSON response
    }
  }
};

/**
 * Purpose: Delete a file and its chunks from the system.
 * Input:
 *   - request: Express request containing fileId in URL parameters (DELETE /files/:fileId).
 *   - response: Express response.
 *   - next: Callback to error middleware.
 */
export const deleteFile = async (request, response, next) => {
  try {
    const { fileId } = request.params;
    await fileService.deleteFile(fileId);
    
    return response.status(200).json({
      success: true,
      message: 'File and all related chunks deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Purpose: List all file metadata records in the system.
 * Input: Express request and response objects.
 */
export const getFiles = async (request, response, next) => {
  try {
    const files = await fileService.listFiles();
    return response.status(200).json(files);
  } catch (error) {
    next(error);
  }
};
