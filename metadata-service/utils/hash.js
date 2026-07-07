/**
 * @file metadata-service/utils/hash.js
 * @description Cryptographic helper utility to calculate SHA-256 checksums.
 * 
 * Concept: Why SHA-256 Checksums?
 * In a distributed file system, file data travels over network connections and gets stored 
 * as raw bytes on physical hard drives. Chunks can get corrupted due to network packet loss, 
 * disk rot (hardware degradation), or accidental modification.
 * 
 * SHA-256 is a cryptographic hash function. When you feed a chunk buffer into it, it generates 
 * a unique, fixed-length 64-character hexadecimal signature (hash). Even if a single bit of the 
 * chunk changes, the resulting hash will be completely different. By storing this hash during upload 
 * and recalculating it during download, we verify the absolute integrity of our data.
 * that is, we can detect if a chunk has been corrupted or tampered with.
 * if a chunk fails its checksum validation during download, we can immediately terminate the connection to prevent the client from saving corrupted data.
 */

import crypto from 'crypto';

/**
 * Purpose: Compute the SHA-256 hexadecimal hash of a binary buffer.
 * Input:
 *   - dataBuffer: A Node.js Buffer containing chunk binary data.
 * Output: A 64-character hexadecimal SHA-256 string.
 * High-Level Workflow:
 *   1. Initialize a hash generator for the "sha256" algorithm using Node's crypto library.
 *   2. Update the hash state with the data from the buffer.
 *   3. Digest (finalize) the hash and return it in hexadecimal format.
 */
export const calculateChecksum = (dataBuffer) => {
  return crypto.createHash('sha256').update(dataBuffer).digest('hex');
};
