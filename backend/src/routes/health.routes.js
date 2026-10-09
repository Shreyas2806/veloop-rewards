/**
 * health.routes.js — Health-check endpoint.
 *
 * GET /api/health
 * Returns a simple JSON response confirming the API is up.
 * Useful for uptime monitors, load balancers, and CI checks.
 */

const express = require('express');

const router = express.Router();

/**
 * @route   GET /api/health
 * @desc    API health check
 * @access  Public
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'VELoop API is running',
  });
});

module.exports = router;
