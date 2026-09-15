import express from 'express';
import {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  toggleTenantStatus,
} from '../controllers/tenantController.js';
import { protect, requireRole } from '../middleware/auth.js';
import { validateTenant } from '../middleware/validateTenancy.js';

const router = express.Router();

// All tenant routes require authentication
router.use(protect);

// Collection routes
router.get('/', getTenants);
router.post('/', requireRole('ADMIN'), validateTenant, createTenant);

// Single tenant routes
router.get('/:id', getTenantById);
router.put('/:id', requireRole('ADMIN'), validateTenant, updateTenant);
router.patch('/:id/status', requireRole('ADMIN'), toggleTenantStatus);

export default router;
