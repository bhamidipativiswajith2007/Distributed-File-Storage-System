import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/index.js';

/**
 * Register a new user
 */
export const register = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Username is already taken' });
    }

    // Create and save new user (password is automatically hashed by the Mongoose pre-save hook)
    const newUser = new User({ username, password });
    await newUser.save();

    // Generate JWT token
    const token = jwt.sign({ userId: newUser._id, username: newUser.username }, config.JWT_SECRET, {
      expiresIn: '24h'
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      username: newUser.username
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login an existing user
 */
export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    // Find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id, username: user.username }, config.JWT_SECRET, {
      expiresIn: '24h'
    });

    res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token,
      username: user.username
    });
  } catch (error) {
    next(error);
  }
};
