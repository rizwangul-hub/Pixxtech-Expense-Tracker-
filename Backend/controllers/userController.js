import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { recordAuditLog, generateAuditLogsCsv, formatKarachiDateTime } from '../services/auditService.js';

/**
 * Determine live online presence state
 */
export const computeUserPresence = (user) => {
  if (user.isDeleted) return 'DELETED';
  if (!user.isActive) return 'DISABLED';

  const now = Date.now();
  const lastActiveMs = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
  const lastLoginMs = user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0;

  // Active within the last 5 minutes
  if (lastActiveMs && now - lastActiveMs <= 5 * 60 * 1000) {
    return 'ONLINE';
  }

  // Token expires in 7 days; if last login was > 7 days ago, session is expired
  if (lastLoginMs && now - lastLoginMs > 7 * 24 * 60 * 60 * 1000) {
    return 'EXPIRED';
  }

  return 'OFFLINE';
};

/**
 * @desc    Get all users with presence, login metrics, and activity counts (Admin only)
 * @route   GET /api/users
 * @access  Private (Admin)
 */
export const getUsers = async (req, res) => {
  try {
    const {
      search = '',
      role = 'ALL',
      status = 'ALL',
      includeDeleted = 'true',
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const query = {};

    // Search by name or email
    if (search.trim()) {
      const q = search.trim();
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    // Role filter
    if (role && role !== 'ALL') {
      if (role === 'ADMIN') {
        query.role = { $in: ['ADMIN', 'ADMIN_PUBLISHER'] };
      } else if (role === 'VERIFIER') {
        query.role = { $in: ['VERIFIER', 'VERIFICATION_MANAGER'] };
      } else {
        query.role = role;
      }
    }

    // Status filter
    if (status === 'ACTIVE') {
      query.isActive = true;
      query.isDeleted = { $ne: true };
    } else if (status === 'DISABLED') {
      query.isActive = false;
      query.isDeleted = { $ne: true };
    } else if (status === 'DELETED') {
      query.isDeleted = true;
    } else if (includeDeleted !== 'true') {
      query.isDeleted = { $ne: true };
    }

    const sortOptions = {};
    const orderNum = sortOrder === 'asc' ? 1 : -1;
    sortOptions[sortBy] = orderNum;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = limit === 'all' ? 0 : Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const totalUsersCount = await User.countDocuments(query);

    let queryExec = User.find(query).select('-password').sort(sortOptions);
    if (limitNum > 0) {
      queryExec = queryExec.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const rawUsers = await queryExec.lean();

    // Batch count recorded activities in AuditLog for these users
    const userIds = rawUsers.map((u) => u._id);
    const activityCounts = await AuditLog.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);

    const activityCountMap = new Map();
    activityCounts.forEach((ac) => {
      activityCountMap.set(String(ac._id), ac.count);
    });

    // Decorate users with presence and computed fields
    const users = rawUsers.map((u) => {
      const presence = computeUserPresence(u);
      const totalActivities = activityCountMap.get(String(u._id)) || 0;
      return {
        ...u,
        id: u._id,
        presence,
        totalActivities,
        loginCount: u.loginCount || 0,
        createdAtFormatted: formatKarachiDateTime(u.createdAt),
        lastLoginAtFormatted: formatKarachiDateTime(u.lastLoginAt),
        lastLogoutAtFormatted: formatKarachiDateTime(u.lastLogoutAt),
        lastActiveAtFormatted: formatKarachiDateTime(u.lastActiveAt),
      };
    });

    // Summary metrics across system
    const [totalActive, totalDeleted, totalAll, recentLoginsCount, totalActivitiesCount] = await Promise.all([
      User.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
      User.countDocuments({ isDeleted: true }),
      User.countDocuments({}),
      User.countDocuments({
        lastLoginAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        isDeleted: { $ne: true },
      }),
      AuditLog.countDocuments({}),
    ]);

    // Count currently online users
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineUsersCount = await User.countDocuments({
      lastActiveAt: { $gte: fiveMinutesAgo },
      isActive: true,
      isDeleted: { $ne: true },
    });

    return apiSuccess(
      res,
      {
        users,
        pagination: {
          total: totalUsersCount,
          page: pageNum,
          limit: limitNum,
          pages: limitNum > 0 ? Math.ceil(totalUsersCount / limitNum) : 1,
        },
        summary: {
          totalUsers: totalAll,
          activeUsers: totalActive,
          deletedUsers: totalDeleted,
          onlineUsers: onlineUsersCount,
          recentLogins: recentLoginsCount,
          totalActivities: totalActivitiesCount,
        },
      },
      `Found ${users.length} users.`
    );
  } catch (error) {
    console.error('[Get Users Error]:', error);
    return apiError(res, 'Failed to retrieve system users.', 500);
  }
};

/**
 * @desc    Create a new user account (Admin only)
 * @route   POST /api/users
 * @access  Private (Admin)
 */
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return apiError(res, 'A user with this email address already exists.', 409, {
        email: 'Email address is already in use.',
      });
    }

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: role || 'DATA_ENTRY',
      isActive: true,
      loginCount: 0,
      tokenVersion: 0,
      isDeleted: false,
    });

    // Record audit log for account creation
    await recordAuditLog({
      req,
      userId: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'USER',
      recordType: 'User',
      recordId: newUser._id,
      status: 'SUCCESS',
      description: `Administrator ${req.user.name} created user account '${newUser.name}' (${newUser.email}) with role ${newUser.role}.`,
      metadata: { createdUserId: newUser._id, createdUserName: newUser.name, role: newUser.role },
    });

    const userResponse = {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      isActive: newUser.isActive,
      lastLoginAt: newUser.lastLoginAt,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
      presence: 'OFFLINE',
      totalActivities: 0,
      loginCount: 0,
    };

    return apiSuccess(res, userResponse, `User '${newUser.name}' created successfully with role ${newUser.role}.`, 201);
  } catch (error) {
    console.error('[Create User Error]:', error);
    return apiError(res, 'Failed to create user account.', 500);
  }
};

/**
 * @desc    Toggle user active status (Admin only)
 * @route   PATCH /api/users/:id/status
 * @access  Private (Admin)
 */
export const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deactivation
    if (req.user._id.toString() === id) {
      return apiError(res, 'Security restriction: You cannot deactivate your own administrative account.', 400);
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return apiError(res, 'User not found.', 404);
    }

    if (targetUser.isDeleted) {
      return apiError(res, 'Cannot activate or deactivate a deleted account.', 400);
    }

    // Prevent deactivating the last active administrator
    if (targetUser.isActive && (targetUser.role === 'ADMIN' || targetUser.role === 'ADMIN_PUBLISHER')) {
      const remainingAdmins = await User.countDocuments({
        role: { $in: ['ADMIN', 'ADMIN_PUBLISHER'] },
        _id: { $ne: targetUser._id },
        isActive: true,
        isDeleted: { $ne: true },
      });
      if (remainingAdmins === 0) {
        return apiError(res, 'Security restriction: Cannot deactivate the last active system administrator.', 400);
      }
    }

    targetUser.isActive = !targetUser.isActive;
    // Invalidate existing sessions immediately if deactivating
    if (!targetUser.isActive) {
      targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
    }
    await targetUser.save({ validateBeforeSave: false });

    // Record audit log
    await recordAuditLog({
      req,
      userId: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'STATUS_CHANGE',
      module: 'USER',
      recordType: 'User',
      recordId: targetUser._id,
      status: 'SUCCESS',
      description: `Administrator ${req.user.name} ${targetUser.isActive ? 'activated' : 'deactivated'} user account '${targetUser.name}' (${targetUser.email}).`,
      metadata: { targetUserId: targetUser._id, newStatus: targetUser.isActive ? 'ACTIVE' : 'INACTIVE' },
    });

    return apiSuccess(
      res,
      {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        isActive: targetUser.isActive,
        presence: computeUserPresence(targetUser),
      },
      `User account '${targetUser.name}' has been ${targetUser.isActive ? 'activated' : 'deactivated'}.`
    );
  } catch (error) {
    console.error('[Toggle User Status Error]:', error);
    return apiError(res, 'Failed to update user status.', 500);
  }
};

/**
 * @desc    Secure password reset by Administrator
 * @route   POST /api/users/:id/reset-password
 * @access  Private (Admin)
 */
export const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword, requirePasswordChange = true } = req.body;

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return apiError(res, 'User not found.', 404);
    }

    if (targetUser.isDeleted) {
      return apiError(res, 'Cannot reset password for a deleted user account.', 400);
    }

    // Generate secure temporary password if not provided
    const passwordToSet = newPassword && newPassword.trim().length >= 6
      ? newPassword.trim()
      : crypto.randomBytes(4).toString('hex') + 'P@1'; // 11 characters e.g. "a1b2c3d4P@1"

    if (newPassword && newPassword.trim().length < 6) {
      return apiError(res, 'Password must be at least 6 characters long.', 400);
    }

    // Set new password (pre-save hook hashes with bcrypt)
    targetUser.password = passwordToSet;
    targetUser.mustChangePassword = Boolean(requirePasswordChange);
    // Invalidate all previous JWT sessions by bumping tokenVersion
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
    await targetUser.save();

    // Record audit log without logging password or secrets
    await recordAuditLog({
      req,
      userId: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'PASSWORD_RESET',
      module: 'USER',
      recordType: 'User',
      recordId: targetUser._id,
      status: 'SUCCESS',
      description: `Password for user '${targetUser.name}' (${targetUser.email}) was reset by Administrator ${req.user.name}. All existing sessions were revoked.`,
      metadata: { targetUserId: targetUser._id, mustChangePassword: targetUser.mustChangePassword },
    });

    return apiSuccess(
      res,
      {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        temporaryPassword: passwordToSet,
        mustChangePassword: targetUser.mustChangePassword,
      },
      `Password for '${targetUser.name}' has been successfully reset and existing sessions were revoked.`
    );
  } catch (error) {
    console.error('[Reset Password Error]:', error);
    return apiError(res, 'Failed to reset user password.', 500);
  }
};

/**
 * @desc    Soft Delete User Account (Preserves historical accounting records & audit trails)
 * @route   DELETE /api/users/:id
 * @access  Private (Admin)
 */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (req.user._id.toString() === id) {
      return apiError(res, 'Security restriction: You cannot delete your own administrative account.', 400);
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return apiError(res, 'User not found.', 404);
    }

    if (targetUser.isDeleted) {
      return apiError(res, 'This user account is already deleted.', 400);
    }

    // Prevent deleting the last active administrator
    if (targetUser.role === 'ADMIN' || targetUser.role === 'ADMIN_PUBLISHER') {
      const remainingAdmins = await User.countDocuments({
        role: { $in: ['ADMIN', 'ADMIN_PUBLISHER'] },
        _id: { $ne: targetUser._id },
        isDeleted: { $ne: true },
        isActive: true,
      });
      if (remainingAdmins === 0) {
        return apiError(res, 'Security restriction: Cannot delete the last active system administrator.', 400);
      }
    }

    // Perform soft deletion
    const now = new Date();
    targetUser.isDeleted = true;
    targetUser.isActive = false;
    targetUser.deletedAt = now;
    targetUser.deletedBy = req.user._id;
    targetUser.deletedByName = req.user.name;
    // Invalidate sessions immediately
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
    await targetUser.save({ validateBeforeSave: false });

    // Record audit log
    await recordAuditLog({
      req,
      userId: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'DELETE',
      module: 'USER',
      recordType: 'User',
      recordId: targetUser._id,
      status: 'SUCCESS',
      description: `Administrator ${req.user.name} deleted user account '${targetUser.name}' (${targetUser.email}). Historical accounting records and audit logs are preserved.`,
      metadata: { deletedUserId: targetUser._id, deletedUserName: targetUser.name },
    });

    return apiSuccess(
      res,
      {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        isDeleted: true,
        deletedAt: now,
      },
      `User account '${targetUser.name}' has been deleted. Historical accounting records remain preserved.`
    );
  } catch (error) {
    console.error('[Delete User Error]:', error);
    return apiError(res, 'Failed to delete user account.', 500);
  }
};

/**
 * @desc    Get detailed audit activity history for a specific user (Admin only)
 * @route   GET /api/users/:id/activity
 * @access  Private (Admin)
 */
export const getUserActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      startDate,
      endDate,
      module,
      action,
      status,
      category,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const targetUser = await User.findById(id).select('-password').lean();
    if (!targetUser) {
      return apiError(res, 'User not found.', 404);
    }

    const query = { userId: new mongoose.Types.ObjectId(id) };

    // Date range filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    // Module filter
    if (module && module !== 'ALL') {
      query.module = module;
    }

    // Action filter
    if (action && action !== 'ALL') {
      query.action = action;
    }

    // Status filter
    if (status && status !== 'ALL') {
      query.status = status;
    }

    // High-level category mapping
    if (category && category !== 'ALL') {
      if (category === 'AUTH') {
        query.module = 'AUTH';
      } else if (category === 'FINANCIAL') {
        query.module = { $in: ['EXPENSE', 'RENT', 'OTHER_INCOME', 'TRANSACTION', 'VOUCHER', 'ACCOUNT'] };
      } else if (category === 'OPERATIONAL') {
        query.module = { $in: ['PROPERTY', 'STAFF', 'PAYROLL'] };
      } else if (category === 'USER_MANAGEMENT') {
        query.module = 'USER';
      } else if (category === 'BACKUP') {
        query.module = 'BACKUP';
      }
    }

    // Text search in description or recordId
    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { description: { $regex: q, $options: 'i' } },
        { recordId: { $regex: q, $options: 'i' } },
        { action: { $regex: q, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const totalLogs = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const formattedLogs = logs.map((log) => ({
      ...log,
      id: log._id,
      timestampFormatted: formatKarachiDateTime(log.timestamp || log.createdAt),
    }));

    return apiSuccess(
      res,
      {
        user: {
          ...targetUser,
          id: targetUser._id,
          presence: computeUserPresence(targetUser),
          totalActivities: await AuditLog.countDocuments({ userId: targetUser._id }),
          createdAtFormatted: formatKarachiDateTime(targetUser.createdAt),
          lastLoginAtFormatted: formatKarachiDateTime(targetUser.lastLoginAt),
          lastLogoutAtFormatted: formatKarachiDateTime(targetUser.lastLogoutAt),
          lastActiveAtFormatted: formatKarachiDateTime(targetUser.lastActiveAt),
        },
        activities: formattedLogs,
        pagination: {
          total: totalLogs,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalLogs / limitNum),
        },
      },
      `Retrieved ${formattedLogs.length} activity records.`
    );
  } catch (error) {
    console.error('[Get User Activity Error]:', error);
    return apiError(res, 'Failed to retrieve user activity records.', 500);
  }
};

/**
 * @desc    Export specific user's activity history to CSV (Admin only)
 * @route   GET /api/users/:id/activity/export
 * @access  Private (Admin)
 */
export const exportUserActivityCsv = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, module, action, status, category, search } = req.query;

    const targetUser = await User.findById(id).select('name email').lean();
    if (!targetUser) {
      return apiError(res, 'User not found.', 404);
    }

    const query = { userId: new mongoose.Types.ObjectId(id) };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) query.timestamp.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    if (module && module !== 'ALL') query.module = module;
    if (action && action !== 'ALL') query.action = action;
    if (status && status !== 'ALL') query.status = status;

    if (category && category !== 'ALL') {
      if (category === 'AUTH') query.module = 'AUTH';
      else if (category === 'FINANCIAL') query.module = { $in: ['EXPENSE', 'RENT', 'OTHER_INCOME', 'TRANSACTION', 'VOUCHER', 'ACCOUNT'] };
      else if (category === 'OPERATIONAL') query.module = { $in: ['PROPERTY', 'STAFF', 'PAYROLL'] };
      else if (category === 'USER_MANAGEMENT') query.module = 'USER';
      else if (category === 'BACKUP') query.module = 'BACKUP';
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { description: { $regex: q, $options: 'i' } },
        { recordId: { $regex: q, $options: 'i' } },
        { action: { $regex: q, $options: 'i' } },
      ];
    }

    // Limit CSV export to maximum 5,000 records to prevent memory pressure
    const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(5000).lean();

    const csvData = generateAuditLogsCsv(logs);
    const safeUserName = targetUser.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `User_Activity_${safeUserName}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvData);
  } catch (error) {
    console.error('[Export User Activity CSV Error]:', error);
    return apiError(res, 'Failed to export user activity to CSV.', 500);
  }
};

/**
 * @desc    Get all system audit logs with filtering and pagination (Admin only)
 * @route   GET /api/audit-logs
 * @access  Private (Admin)
 */
export const getAllAuditLogs = async (req, res) => {
  try {
    const {
      userId,
      startDate,
      endDate,
      module,
      action,
      status,
      category,
      search,
      page = 1,
      limit = 30,
    } = req.query;

    const query = {};

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.userId = new mongoose.Types.ObjectId(userId);
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) query.timestamp.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    if (module && module !== 'ALL') query.module = module;
    if (action && action !== 'ALL') query.action = action;
    if (status && status !== 'ALL') query.status = status;

    if (category && category !== 'ALL') {
      if (category === 'AUTH') query.module = 'AUTH';
      else if (category === 'FINANCIAL') query.module = { $in: ['EXPENSE', 'RENT', 'OTHER_INCOME', 'TRANSACTION', 'VOUCHER', 'ACCOUNT'] };
      else if (category === 'OPERATIONAL') query.module = { $in: ['PROPERTY', 'STAFF', 'PAYROLL'] };
      else if (category === 'USER_MANAGEMENT') query.module = 'USER';
      else if (category === 'BACKUP') query.module = 'BACKUP';
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { userName: { $regex: q, $options: 'i' } },
        { userEmail: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { recordId: { $regex: q, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));

    const totalLogs = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const formattedLogs = logs.map((log) => ({
      ...log,
      id: log._id,
      timestampFormatted: formatKarachiDateTime(log.timestamp || log.createdAt),
    }));

    return apiSuccess(
      res,
      {
        logs: formattedLogs,
        pagination: {
          total: totalLogs,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalLogs / limitNum),
        },
      },
      `Found ${formattedLogs.length} audit logs.`
    );
  } catch (error) {
    console.error('[Get All Audit Logs Error]:', error);
    return apiError(res, 'Failed to retrieve system audit logs.', 500);
  }
};

/**
 * @desc    Export all system audit logs to CSV (Admin only)
 * @route   GET /api/audit-logs/export
 * @access  Private (Admin)
 */
export const exportAllAuditLogsCsv = async (req, res) => {
  try {
    const { userId, startDate, endDate, module, action, status, category, search } = req.query;

    const query = {};

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.userId = new mongoose.Types.ObjectId(userId);
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) query.timestamp.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    if (module && module !== 'ALL') query.module = module;
    if (action && action !== 'ALL') query.action = action;
    if (status && status !== 'ALL') query.status = status;

    if (category && category !== 'ALL') {
      if (category === 'AUTH') query.module = 'AUTH';
      else if (category === 'FINANCIAL') query.module = { $in: ['EXPENSE', 'RENT', 'OTHER_INCOME', 'TRANSACTION', 'VOUCHER', 'ACCOUNT'] };
      else if (category === 'OPERATIONAL') query.module = { $in: ['PROPERTY', 'STAFF', 'PAYROLL'] };
      else if (category === 'USER_MANAGEMENT') query.module = 'USER';
      else if (category === 'BACKUP') query.module = 'BACKUP';
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { userName: { $regex: q, $options: 'i' } },
        { userEmail: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { recordId: { $regex: q, $options: 'i' } },
      ];
    }

    const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(10000).lean();
    const csvData = generateAuditLogsCsv(logs);
    const filename = `System_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvData);
  } catch (error) {
    console.error('[Export All Audit Logs CSV Error]:', error);
    return apiError(res, 'Failed to export audit logs to CSV.', 500);
  }
};

export default {
  getUsers,
  createUser,
  toggleUserStatus,
  resetPassword,
  deleteUser,
  getUserActivity,
  exportUserActivityCsv,
  getAllAuditLogs,
  exportAllAuditLogsCsv,
  computeUserPresence,
};
