import express from 'express';
import {
  getAgreements,
  getAgreementById,
  createAgreement,
  updateAgreement,
  toggleAgreementStatus,
  deleteAgreement,
  getNextNumber,
} from '../controllers/agreementController.js';
import { protect, requireRole } from '../middleware/auth.js';
import { validateAgreement } from '../middleware/validateTenancy.js';

const router = express.Router();

// All agreement routes require authentication
router.use(protect);

// Utility route for proposed agreement number
router.get('/next-number', getNextNumber);

// Collection routes - ADMIN, VERIFIER, and DATA_ENTRY can create, view, update, and delete agreements
router.get('/', getAgreements);
router.post('/', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), validateAgreement, createAgreement);

// Single agreement routes
router.get('/:id', getAgreementById);
router.put('/:id', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), validateAgreement, updateAgreement);
router.patch('/:id/status', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), toggleAgreementStatus);
router.delete('/:id', requireRole('ADMIN', 'VERIFIER', 'DATA_ENTRY'), deleteAgreement);

export default router;
