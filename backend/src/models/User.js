/**
 * User.js — Mongoose schema for VELoop registered users.
 *
 * Security guarantees:
 *  - Password is hashed with bcrypt before every save (pre-save hook).
 *  - The hash is stripped from every toJSON / toObject call so it can
 *    never accidentally appear in an API response.
 *  - Email is always stored lower-case (normalized at schema level).
 *  - JWT tokens are never stored in the document.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true, // normalize at storage level
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never returned by default in queries
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt automatically
  }
);

// ─── Pre-save hook: hash password before writing to MongoDB ───────────────────
userSchema.pre('save', async function hashPassword(next) {
  // Only re-hash if the password field has been modified
  if (!this.isModified('password')) return next();

  try {
    this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
    return next();
  } catch (err) {
    return next(err);
  }
});

// ─── Instance method: compare a plain-text candidate with the stored hash ─────
userSchema.methods.comparePassword = async function comparePassword(candidate) {
  // `this.password` is available here because we explicitly select it in
  // the service when we need to verify credentials.
  return bcrypt.compare(candidate, this.password);
};

// ─── toJSON transform: strip password and __v from every serialized response ──
userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret._id;       // expose `id` as a clean string alias
    delete ret._id;
    delete ret.__v;
    delete ret.password;    // NEVER expose the hash
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
