import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Middleware to protect private routes via JWT authentication.
 */
export const protect = async (req, res, next) => {
  let token = null;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authorization token provided.',
    });
  }

  try {
    const secret = process.env.JWT_SECRET || 'pixx_tech_super_secret_jwt_key_2026_finance';
    const decoded = jwt.verify(token, secret);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session. User belonging to this token no longer exists.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account has been deactivated.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed. Invalid or expired token.',
      error: error.message,
    });
  }
};

/**
 * Supported Roles in Pixx Technologies Property Finance System
 */
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  VERIFIER: 'VERIFIER',
  VERIFICATION_MANAGER: 'VERIFICATION_MANAGER',
  DATA_ENTRY: 'DATA_ENTRY',
  ADMIN_PUBLISHER: 'ADMIN_PUBLISHER', // Kept for backward compatibility
});

/**
 * Granular Permissions Architecture
 */
export const PERMISSIONS = Object.freeze({
  MANAGE_USERS: 'MANAGE_USERS',
  VIEW_FINANCIALS: 'VIEW_FINANCIALS',
  ENTER_DATA: 'ENTER_DATA',
  APPROVE_RECORDS: 'APPROVE_RECORDS',
  EXPORT_REPORTS: 'EXPORT_REPORTS',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
  MANAGE_MASTER_DATA: 'MANAGE_MASTER_DATA',
});

/**
 * Role-Permission Mapping Matrix
 * - ADMIN (Fahad): Executive monitoring, master data creation (banks, cash accounts, properties), reports, but cannot add operational rent/expense.
 * - VERIFIER / VERIFICATION_MANAGER (Khurshid Anwar): Full monitoring, master data creation, pending entry review/edit/verify/reject/delete, and direct data entry.
 * - DATA_ENTRY (Sarfraz): Data entry (creates temporary pending entries awaiting verification).
 */
export const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_FINANCIALS,
    PERMISSIONS.ENTER_DATA,
    PERMISSIONS.APPROVE_RECORDS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.MANAGE_MASTER_DATA,
  ],
  ADMIN_PUBLISHER: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_FINANCIALS,
    PERMISSIONS.ENTER_DATA,
    PERMISSIONS.APPROVE_RECORDS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.MANAGE_MASTER_DATA,
  ],
  VERIFIER: [
    PERMISSIONS.VIEW_FINANCIALS,
    PERMISSIONS.ENTER_DATA,
    PERMISSIONS.APPROVE_RECORDS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.MANAGE_MASTER_DATA,
  ],
  VERIFICATION_MANAGER: [
    PERMISSIONS.VIEW_FINANCIALS,
    PERMISSIONS.ENTER_DATA,
    PERMISSIONS.APPROVE_RECORDS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.MANAGE_MASTER_DATA,
  ],
  DATA_ENTRY: [
    PERMISSIONS.ENTER_DATA,
  ],
});

/**
 * Helper to check if a user has a specific permission
 * @param {Object} user - User object with .role
 * @param {string} permission - Permission key from PERMISSIONS
 * @returns {boolean}
 */
export const hasPermission = (user, permission) => {
  if (!user || !user.role) return false;
  const userPermissions = ROLE_PERMISSIONS[user.role] || [];
  return userPermissions.includes(permission);
};

/**
 * Middleware alias for protect
 */
export const requireAuth = protect;

/**
 * Normalize role comparison (treats ADMIN and ADMIN_PUBLISHER equivalently; VERIFIER and VERIFICATION_MANAGER equivalently)
 */
const normalizeRole = (role) => {
  if (role === 'ADMIN_PUBLISHER') return 'ADMIN';
  if (role === 'VERIFICATION_MANAGER') return 'VERIFIER';
  return role;
};

/**
 * Middleware to enforce Role-Based Access Control (RBAC).
 * Supports both ADMIN and DATA_ENTRY, maintaining backward compatibility for ADMIN_PUBLISHER.
 * @param  {...string} roles - Permitted roles (e.g. 'ADMIN', 'DATA_ENTRY')
 */
export const authorize = (...roles) => {
  const normalizedAllowed = roles.map(normalizeRole);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Authentication required.',
      });
    }

    const userNormalized = normalizeRole(req.user.role);
    if (!normalizedAllowed.includes(userNormalized) && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user.role}' is not authorized to access this resource.`,
      });
    }
    next();
  };
};

/**
 * Middleware alias for authorize
 */
export const requireRole = authorize;

/**
 * Middleware to enforce specific granular permission
 * @param {string} permission - Required permission string
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user, permission)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Missing required permission: '${permission}'.`,
      });
    }
    next();
  };
};

export default {
  protect,
  requireAuth,
  authorize,
  requireRole,
  requirePermission,
  hasPermission,
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
};
