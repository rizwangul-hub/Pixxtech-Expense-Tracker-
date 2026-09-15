import express from 'express';
import {
  getIncomeHeads,
  createIncomeHead,
  updateIncomeHead,
  recordOtherIncome,
  getAllOtherIncome,
  getOtherIncomeById,
  getMonthlyOtherIncomeSummary,
  reverseOtherIncome,
} from '../controllers/otherIncomeController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All Other Income routes require authentication
router.use(protect);

// 1. Configurable Other Income Heads
router.get('/heads', getIncomeHeads);
router.post('/heads', authorize('ADMIN_PUBLISHER', 'ADMIN'), createIncomeHead);
router.put('/heads/:id', authorize('ADMIN_PUBLISHER', 'ADMIN'), updateIncomeHead);

// 2. Financial Summaries
router.get('/monthly-summary', getMonthlyOtherIncomeSummary);
router.get('/summary', getMonthlyOtherIncomeSummary);

// 3. Other Income Receipts Recording & Retrieval
router.get('/', getAllOtherIncome);
router.post(
  '/',
  authorize('DATA_ENTRY', 'ADMIN_PUBLISHER', 'ADMIN'),
  recordOtherIncome
);
router.get('/:id', getOtherIncomeById);

// 4. Non-Destructive Soft Reversal (Admin Only)
router.post(
  '/:id/reverse',
  authorize('ADMIN_PUBLISHER', 'ADMIN'),
  reverseOtherIncome
);
router.patch(
  '/:id/reverse',
  authorize('ADMIN_PUBLISHER', 'ADMIN'),
  reverseOtherIncome
);

export default router;
