/**
 * @file common/constants.js
 * @description Shared constant values used across multiple services in the monorepo.
 * 
 * Why this file exists:
 * In a microservices or multi-component project, duplicate magic numbers (like chunk size or file limits)
 * lead to configuration drift and bugs. Keeping them in a shared "common" module guarantees consistency.
 * 
 * ES Modules Concept:
 * We use `export const` to share these values. Other files in the project can import them 
 * using `import { COMMON_CONSTANTS } from '../common/constants.js'`.
 */
export const COMMON_CONSTANTS = {
  // Default size of each file chunk (4MB). 
  // Chunks must be small enough to easily transfer over network requests,
  // yet large enough to avoid generating thousands of individual requests for moderate-sized files.
  DEFAULT_CHUNK_SIZE: 4194304, 

  // Default maximum allowed size for uploaded files (500MB).
  // This acts as a safeguard against Denial of Service (DoS) attacks where a client tries to crash
  // our server by uploading a multi-gigabyte file that runs out of memory or disk space.
  DEFAULT_MAX_FILE_SIZE: 524288000 
};
