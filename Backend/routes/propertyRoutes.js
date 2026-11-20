import express from 'express';
import {
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  togglePropertyStatus,
  getPropertyUnits,
  addUnit,
} from '../controllers/propertyController.js';
import { protect, requireRole } from '../middleware/auth.js';
import { validateProperty, validateUnit } from '../middleware/validateProperty.js';

const router = express.Router();

// All property routes require authentication
router.use(protect);

// Collection routes
router.get('/', getProperties);
router.post('/', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), validateProperty, createProperty);

// Single property routes
router.get('/:id', getPropertyById);
router.put('/:id', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), validateProperty, updateProperty);
router.patch('/:id/status', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), togglePropertyStatus);

// Property units routes
router.get('/:id/units', getPropertyUnits);
router.post('/:id/units', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), validateUnit, addUnit);

export default router;
