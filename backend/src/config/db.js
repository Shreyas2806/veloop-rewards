/**
 * db.js — MongoDB connection using Mongoose.
 *
 * Reads MONGO_URI from environment variables.
 * Fails fast with a clear error if the variable is missing.
 * Never logs credentials.
 *
 * DNS fix: Node's default resolver on this machine points to 127.0.0.1 which
 * cannot resolve MongoDB Atlas SRV records. We override it with public resolvers
 * (Google 8.8.8.8 / Cloudflare 1.1.1.1) before Mongoose is used so that the
 * mongodb+srv:// URI resolves correctly. This is a Node-level config call —
 * it does NOT change any application logic, models, or security settings.
 */

const dns = require('dns');

// Override DNS resolvers BEFORE Mongoose/MongoDB driver attempts any SRV lookup.
// Without this, the driver gets ECONNREFUSED on the SRV query because 127.0.0.1
// (the default resolver on this machine) is not available.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('[DB] FATAL: MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // give Atlas time to respond after SRV resolution
    });

    console.log(`[DB] MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    // Log only the message — never the full URI which may contain credentials
    console.error(`[DB] Connection failed: ${error.message}`);
    // Note: we do NOT call process.exit here.
    // The HTTP server stays up so the health-check endpoint remains reachable.
    // Database-dependent routes will fail gracefully with 500 errors.
  }
};

module.exports = connectDB;
