import User from '../models/User.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * @desc    Get all users (Admin only)
 * @route   GET /api/users
 * @access  Private (Admin)
 */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    return apiSuccess(res, users, `Found ${users.length} users.`);
  } catch (error) {
    console.error('[Get Users Error]:', error);
    return apiError(res, 'Failed to retrieve system users.', 500);
  }
};

/**
 * @desc    Create a new user (Admin only)
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
      role,
      isActive: true,
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

    targetUser.isActive = !targetUser.isActive;
    await targetUser.save();

    return apiSuccess(
      res,
      {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        isActive: targetUser.isActive,
      },
      `User account '${targetUser.name}' has been ${targetUser.isActive ? 'activated' : 'deactivated'}.`
    );
  } catch (error) {
    console.error('[Toggle User Status Error]:', error);
    return apiError(res, 'Failed to update user status.', 500);
  }
};

export default {
  getUsers,
  createUser,
  toggleUserStatus,
};
