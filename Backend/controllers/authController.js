import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtSecret } from '../config/jwt.js';
import { recordAuditLog } from '../services/auditService.js';

/**
 * Generate 7-day JWT Token helper with tokenVersion for session invalidation
 */
const generateToken = (id, tokenVersion = 0) => {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign({ id, tokenVersion }, secret, {
    expiresIn: '7d',
  });
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res) => {
  try {
    if (!getJwtSecret()) {
      return res.status(503).json({
        success: false,
        message: 'Authentication is unavailable: JWT_SECRET is not configured.',
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Query user and explicitly include password field
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user) {
      await recordAuditLog({
        req,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        recordType: 'User',
        status: 'FAILURE',
        description: `Failed login attempt: User not found for '${normalizedEmail}'.`,
        metadata: { attemptedEmail: normalizedEmail },
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User not found.',
      });
    }

    if (user.isDeleted) {
      await recordAuditLog({
        req,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        recordType: 'User',
        recordId: user._id,
        status: 'FAILURE',
        description: `Login blocked: User account '${user.name}' (${user.email}) has been deleted.`,
      });

      return res.status(403).json({
        success: false,
        message: 'This account has been permanently deactivated or deleted.',
      });
    }

    if (!user.isActive) {
      await recordAuditLog({
        req,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        recordType: 'User',
        recordId: user._id,
        status: 'FAILURE',
        description: `Login blocked: Account '${user.name}' is inactive.`,
      });

      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact administration.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await recordAuditLog({
        req,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        recordType: 'User',
        recordId: user._id,
        status: 'FAILURE',
        description: `Failed login attempt for '${user.name}': Incorrect password provided.`,
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.',
      });
    }

    // Update login timestamps, counters, and activity
    const now = new Date();
    user.lastLoginAt = now;
    user.lastLogin = now;
    user.lastActiveAt = now;
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id, user.tokenVersion || 0);

    // Audit log successful login
    await recordAuditLog({
      req,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'LOGIN_SUCCESS',
      module: 'AUTH',
      recordType: 'User',
      recordId: user._id,
      status: 'SUCCESS',
      description: `${user.name} logged in successfully. (Login #${user.loginCount})`,
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        lastLogoutAt: user.lastLogoutAt,
        lastActiveAt: user.lastActiveAt,
        loginCount: user.loginCount,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
      error: error.message,
    });
  }
};

/**
 * @desc    Log out authenticated user & record audit entry
 * @route   POST /api/auth/logout
 * @access  Private
 */
export const logout = async (req, res) => {
  try {
    if (req.user) {
      const now = new Date();
      req.user.lastLogoutAt = now;
      req.user.lastActiveAt = now;
      await req.user.save({ validateBeforeSave: false });

      await recordAuditLog({
        req,
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'LOGOUT',
        module: 'AUTH',
        recordType: 'User',
        recordId: req.user._id,
        status: 'SUCCESS',
        description: `${req.user.name} logged out of the system.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record logout.',
      error: error.message,
    });
  }
};

/**
 * @desc    Client heartbeat to maintain live presence status
 * @route   POST /api/auth/heartbeat
 * @access  Private
 */
export const heartbeat = async (req, res) => {
  try {
    if (req.user) {
      await User.updateOne({ _id: req.user._id }, { $set: { lastActiveAt: new Date() } });
    }
    return res.status(200).json({
      success: true,
      status: 'online',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Get current authenticated user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res) => {
  try {
    // Refresh last active timestamp
    await User.updateOne({ _id: req.user._id }, { $set: { lastActiveAt: new Date() } });

    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        isActive: req.user.isActive,
        lastLoginAt: req.user.lastLoginAt,
        lastLogoutAt: req.user.lastLogoutAt,
        lastActiveAt: req.user.lastActiveAt,
        loginCount: req.user.loginCount,
        mustChangePassword: req.user.mustChangePassword,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile.',
      error: error.message,
    });
  }
};

export default { login, logout, heartbeat, getMe };
