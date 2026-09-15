import express from 'express';
import { getUsers, createUser, toggleUserStatus } from '../controllers/userController.js';
import { protect, requireRole } from '../middleware/auth.js';
import { validateCreateUser } from '../middleware/validate.js';

const router = express.Router();

// Enforce authentication and Admin role on all user management routes
router.use(protect, requireRole('ADMIN'));

router.get('/', getUsers);
router.post('/', validateCreateUser, createUser);
router.patch('/:id/status', toggleUserStatus);

export default router;
