/**
 * Frontend Role-Based Access Control (RBAC) Helpers
 * Pixx Technologies Property Finance & Expense Management System
 */

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  VERIFIER: 'VERIFIER',
  VERIFICATION_MANAGER: 'VERIFICATION_MANAGER',
  DATA_ENTRY: 'DATA_ENTRY',
  ADMIN_PUBLISHER: 'ADMIN_PUBLISHER', // Legacy compatibility
});

export const PERMISSIONS = Object.freeze({
  MANAGE_USERS: 'MANAGE_USERS',
  VIEW_FINANCIALS: 'VIEW_FINANCIALS',
  ENTER_DATA: 'ENTER_DATA',
  APPROVE_RECORDS: 'APPROVE_RECORDS',
  EXPORT_REPORTS: 'EXPORT_REPORTS',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
  MANAGE_MASTER_DATA: 'MANAGE_MASTER_DATA',
});

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
 * Check if a user has admin privileges (Fahad / Manager)
 * @param {Object} user
 * @returns {boolean}
 */
export const isAdmin = (user) => {
  if (!user || !user.role) return false;
  return user.role === ROLES.ADMIN || user.role === ROLES.ADMIN_PUBLISHER;
};

/**
 * Check if a user has verification privileges (Khurshid Anwar)
 * @param {Object} user
 * @returns {boolean}
 */
export const isVerifier = (user) => {
  if (!user || !user.role) return false;
  return user.role === ROLES.VERIFIER || user.role === ROLES.VERIFICATION_MANAGER;
};

/**
 * Check if a user is data entry role (Sarfraz)
 * @param {Object} user
 * @returns {boolean}
 */
export const isDataEntry = (user) => {
  if (!user || !user.role) return false;
  return user.role === ROLES.DATA_ENTRY;
};

/**
 * Check if a user can create/edit master data like properties, bank accounts, cash custodians (Fahad & Khurshid)
 * @param {Object} user
 * @returns {boolean}
 */
export const canManageMasterData = (user) => {
  return isAdmin(user) || isVerifier(user);
};

/**
 * Check if a user can directly record operational transactions without verification (Khurshid)
 * @param {Object} user
 * @returns {boolean}
 */
export const canDirectEntry = (user) => {
  return isVerifier(user);
};

/**
 * Check if user is forbidden from operational rent and expense entry (Fahad)
 * @param {Object} user
 * @returns {boolean}
 */
export const isOperationalEntryBlocked = (user) => {
  return isAdmin(user);
};

/**
 * Check if a user has a specific granular permission
 * @param {Object} user
 * @param {string} permission
 * @returns {boolean}
 */
export const hasPermission = (user, permission) => {
  if (!user || !user.role) return false;
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  return permissions.includes(permission);
};

export default {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  isAdmin,
  isVerifier,
  isDataEntry,
  canManageMasterData,
  canDirectEntry,
  isOperationalEntryBlocked,
  hasPermission,
};
