import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/**
 * Authentication Middleware
 * Acts as the "Bouncer" for protected routes.
 * Checks the Authorization header for a valid JWT token.
 */
export const requireAuth = (req, res, next) => {
  // 1. Check if the Authorization header exists
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  // 2. Extract the token (Remove "Bearer " from the string)
  const token = authHeader.split(' ')[1];

  try {
    // 3. Verify the token using our secret key
    const decodedPayload = jwt.verify(token, config.JWT_SECRET);
    
    // 4. Attach the decoded user data (userId, username) to the request object
    // This allows the next functions (like upload or delete) to know exactly who made the request
    req.user = decodedPayload;
    
    // Proceed to the actual route handler
    next();
  } catch (error) {
    // If the token is expired or forged, jwt.verify throws an error
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid or expired token' });
  }
};
