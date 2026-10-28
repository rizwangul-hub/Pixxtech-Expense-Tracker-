import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtSecret } from '../config/jwt.js';
import { recordAuditLog } from '../services/auditService.js';

const SSO_ISSUER = 'https://portal.pixxtech.internal';
const EXPECTED_AUDIENCE = 'pak-expense-tracker';
const ALLOWED_ALGORITHMS = ['HS256'];

// Atomic in-memory replay prevention cache
const redeemedTickets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [jti, expMs] of redeemedTickets.entries()) {
    if (now > expMs) {
      redeemedTickets.delete(jti);
    }
  }
}, 60000).unref();

const getSSOSecret = () => {
  return process.env.SSO_SECRET || process.env.CENTRAL_PORTAL_SECRET || process.env.JWT_SECRET || 'pixxtech_central_portal_sso_secret_2026';
};

/**
 * Generate native 7-day JWT Token helper for Pak Expense Tracker
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
 * @desc    Exchange Central Portal SSO authorization ticket for native session JWT
 * @route   POST /api/auth/sso/exchange
 * @access  Public
 */
export const ssoExchange = async (req, res) => {
  try {
    const { ticket } = req.body;

    if (!ticket) {
      return res.status(400).json({
        success: false,
        message: 'SSO authorization ticket is required.',
      });
    }

    const ssoSecret = getSSOSecret();
    let decoded;

    try {
      decoded = jwt.verify(ticket, ssoSecret, {
        issuer: SSO_ISSUER,
        algorithms: ALLOWED_ALGORITHMS,
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TICKET_EXPIRED',
          message: 'The SSO authorization ticket has expired. Please launch again from Central Portal.',
        });
      }
      return res.status(401).json({
        success: false,
        code: 'TICKET_INVALID',
        message: `Invalid SSO authorization ticket: ${err.message}`,
      });
    }

    // Verify audience
    if (decoded.aud !== EXPECTED_AUDIENCE && decoded.aud !== 'pakistan-expense-tracker') {
      return res.status(403).json({
        success: false,
        code: 'AUDIENCE_MISMATCH',
        message: `SSO ticket audience mismatch. Expected '${EXPECTED_AUDIENCE}', got '${decoded.aud}'.`,
      });
    }

    // Mandatory claims check
    if (!decoded.jti || !decoded.sub || !decoded.email) {
      return res.status(400).json({
        success: false,
        message: 'SSO ticket is missing mandatory identity claims (jti, sub, email).',
      });
    }

    // Atomic replay protection
    if (redeemedTickets.has(decoded.jti)) {
      return res.status(401).json({
        success: false,
        code: 'TICKET_REPLAYED',
        message: 'SSO ticket has already been redeemed (replay detected).',
      });
    }

    const expMs = (decoded.exp || Math.floor(Date.now() / 1000) + 300) * 1000;
    redeemedTickets.set(decoded.jti, expMs);

    const normalizedEmail = decoded.email.toLowerCase().trim();

    // Query user without touching password
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      await recordAuditLog({
        req,
        action: 'SSO_LOGIN_FAILED',
        module: 'AUTH',
        recordType: 'User',
        status: 'FAILURE',
        description: `SSO login failed: User '${normalizedEmail}' not registered in Pakistan Expense Tracker.`,
        metadata: { email: normalizedEmail, centralSub: decoded.sub },
      });

      return res.status(404).json({
        success: false,
        message: `No active account for '${normalizedEmail}' found in Pakistan Expense Tracker. Please contact your administrator for local provisioning.`,
      });
    }

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted in Pakistan Expense Tracker.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account is currently deactivated in Pakistan Expense Tracker.',
      });
    }

    // Update login activity without changing tokenVersion (preserves existing sessions!)
    const now = new Date();
    user.lastLoginAt = now;
    user.lastLogin = now;
    user.lastActiveAt = now;
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save({ validateBeforeSave: false });

    // Generate native application JWT
    const nativeToken = generateToken(user._id, user.tokenVersion || 0);

    // Audit log successful SSO exchange
    await recordAuditLog({
      req,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'SSO_LOGIN_SUCCESS',
      module: 'AUTH',
      recordType: 'User',
      recordId: user._id,
      status: 'SUCCESS',
      description: `${user.name} logged in via Central Portal SSO. (Login #${user.loginCount})`,
      metadata: {
        centralSub: decoded.sub,
        ticketId: decoded.jti,
        mappedRole: decoded.mappedRole,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'SSO login successful.',
      token: nativeToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    console.error('[SSO Exchange Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during SSO ticket exchange.',
      error: error.message,
    });
  }
};
