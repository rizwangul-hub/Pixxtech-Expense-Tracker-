import express from 'express';
import {
  getUnitById,
  updateUnit,
  toggleUnitStatus,
} from '../controllers/propertyController.js';
import { protect, requireRole } from '../middleware/auth.js';
import { validateUnit } from '../middleware/validateProperty.js';

const router = express.Router();

// All unit routes require authentication
router.use(protect);

router.get('/:id', getUnitById);
router.put('/:id', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), validateUnit, updateUnit);
router.patch('/:id/status', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), toggleUnitStatus);

export default router;
