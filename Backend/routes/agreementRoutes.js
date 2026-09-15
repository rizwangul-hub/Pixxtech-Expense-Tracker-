import express from 'express';
import {
  getAgreements,
  getAgreementById,
  createAgreement,
  updateAgreement,
  toggleAgreementStatus,
  getNextNumber,
} from '../controllers/agreementController.js';
import { protect, requireRole } from '../middleware/auth.js';
import { validateAgreement } from '../middleware/validateTenancy.js';

const router = express.Router();

// All agreement routes require authentication
router.use(protect);

// Utility route for proposed agreement number
router.get('/next-number', getNextNumber);

// Collection routes
router.get('/', getAgreements);
router.post('/', requireRole('ADMIN'), validateAgreement, createAgreement);

// Single agreement routes
router.get('/:id', getAgreementById);
router.put('/:id', requireRole('ADMIN'), validateAgreement, updateAgreement);
router.patch('/:id/status', requireRole('ADMIN'), toggleAgreementStatus);

export default router;
