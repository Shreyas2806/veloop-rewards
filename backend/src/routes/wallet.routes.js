/**
 * wallet.routes.js — Route definitions for the Wallet module.
 *
 * Mounted in server.js as:  app.use('/api/wallet', walletRoutes)
 *
 * Both routes require JWT authentication — protect is applied at router level.
 *
 * Protected routes:
 *   GET /api/wallet/gems           — current Gem balance
 *   GET /api/wallet/transactions   — transaction history (newest first)
 */

const express = require('express');

const { protect } = require('../middleware/auth.middleware');
const { getWalletBalance, getTransactionHistory } = require('../controllers/wallet.controller');

const router = express.Router();

// All wallet routes require a valid JWT
router.use(protect);

/**
 * @route   GET /api/wallet/gems
 * @desc    Return the authenticated user's Gem balance from MongoDB.
 *          Balance is NEVER accepted from client state.
 * @access  Protected
 */
router.get('/gems', getWalletBalance);

/**
 * @route   GET /api/wallet/transactions
 * @desc    Return the authenticated user's GemTransaction history.
 *          Only the logged-in user's transactions are returned.
 * @access  Protected
 * @query   ?limit=50&skip=0  (optional pagination)
 */
router.get('/transactions', getTransactionHistory);

module.exports = router;
