import express from 'express';
import { register, login } from '../controllers/authController.js';

const router = express.Router();

// POST /auth/register - Create a new account
router.post('/register', register);

// POST /auth/login - Log into an existing account
router.post('/login', login);

export default router;
