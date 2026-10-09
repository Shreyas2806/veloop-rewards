/**
 * auth.service.js — Business logic for user authentication.
 *
 * Controllers stay thin: they delegate all meaningful work here.
 *
 * Responsibilities:
 *  - registerUser()  — create a new user
 *  - loginUser()     — verify credentials, issue JWT
 *  - generateToken() — sign a JWT with minimal payload
 *  - getUserById()   — fetch a safe user object by ID
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ─── Token generation ─────────────────────────────────────────────────────────

/**
 * generateToken
 *
 * Signs a JWT containing only the user's MongoDB _id.
 * Secret and expiry come exclusively from environment variables.
 *
 * @param {string} userId — MongoDB ObjectId string
 * @returns {string} signed JWT
 */
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign({ userId }, secret, { expiresIn });
};

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * registerUser
 *
 * 1. Check for duplicate email.
 * 2. Create the User document (password is hashed by the pre-save hook).
 * 3. Return a safe user object — no password, no hash.
 *
 * Throws an error with a statusCode property so the central error handler
 * can map it to the correct HTTP status.
 *
 * @param {{ name: string, email: string, password: string }} data
 * @returns {{ id, name, email }}
 */
const registerUser = async ({ name, email, password }) => {
  // email is already normalized by express-validator's normalizeEmail()
  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('User already exists');
    err.statusCode = 409;
    throw err;
  }

  const user = await User.create({ name, email, password });

  // toJSON transform strips password and __v and adds `id`
  return {
    id: user._id,
    name: user.name,
    email: user.email,
  };
};

/**
 * loginUser
 *
 * 1. Find the user by email (explicitly selecting the hashed password).
 * 2. Compare the supplied plain-text password with the stored hash.
 * 3. Return a JWT and safe user data on success.
 *
 * Both "unknown email" and "wrong password" produce the same generic error
 * so callers cannot determine which field was incorrect.
 *
 * @param {{ email: string, password: string }} data
 * @returns {{ token: string, user: { id, name, email } }}
 */
const loginUser = async ({ email, password }) => {
  // password is excluded by default (select: false), re-include it here
  const user = await User.findOne({ email }).select('+password');

  const genericError = new Error('Invalid email or password');
  genericError.statusCode = 401;

  if (!user) throw genericError;

  const passwordMatch = await user.comparePassword(password);
  if (!passwordMatch) throw genericError;

  const token = generateToken(user._id.toString());

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  };
};

/**
 * getUserById
 *
 * Fetches a user by their MongoDB _id.
 * Returns only safe, non-sensitive fields.
 * Used by the auth middleware and the /me endpoint.
 *
 * @param {string} userId
 * @returns {{ id, name, email } | null}
 */
const getUserById = async (userId) => {
  const user = await User.findById(userId).select('-password');
  if (!user) return null;

  return {
    id: user._id,
    name: user.name,
    email: user.email,
  };
};

module.exports = { registerUser, loginUser, generateToken, getUserById };
