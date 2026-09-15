import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * User Schema
 * Manages system authentication credentials and Role-Based Access Control (RBAC).
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address',
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false, // Hidden by default from queries
    },
    role: {
      type: String,
      enum: {
        values: ['ADMIN', 'DATA_ENTRY', 'ADMIN_PUBLISHER', 'VERIFIER', 'VERIFICATION_MANAGER'],
        message: 'Role must be ADMIN, DATA_ENTRY, ADMIN_PUBLISHER, VERIFIER, or VERIFICATION_MANAGER',
      },
      default: 'DATA_ENTRY',
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving if modified
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with stored hashed password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if user has administrative privileges
userSchema.methods.isAdmin = function () {
  return this.role === 'ADMIN' || this.role === 'ADMIN_PUBLISHER';
};

// Check if user has verification privileges (Khurshid Anwar)
userSchema.methods.isVerifier = function () {
  return this.role === 'VERIFIER' || this.role === 'VERIFICATION_MANAGER';
};

export const User = mongoose.model('User', userSchema);
export default User;
