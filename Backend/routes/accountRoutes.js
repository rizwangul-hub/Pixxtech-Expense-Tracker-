import express from 'express';
import {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  toggleAccountStatus,
  getAccountLedger,
  getMonthlySummary,
  getActiveAccountsSummary,
  getCategories,
  createCategory,
  deleteCategory,
  getProperties,
  recalculateAllBalances,
} from '../controllers/accountController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateAccount } from '../middleware/validateAccount.js';

const router = express.Router();

router.use(protect);

// Account Queries & Summaries
router.get('/', getAccounts);
router.get('/monthly-summary', getMonthlySummary);
router.get('/active-summary', getActiveAccountsSummary);
router.get('/categories-list', getCategories);
router.get('/properties-list', getProperties);

// Data-entry & Admin users may add or delete expense heads
router.post('/categories', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER'), createCategory);
router.delete('/categories/:id', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER'), deleteCategory);

// Admin-only: Reconcile account balances from actual transactions (fixes stored vs computed divergence)
router.post('/recalculate-balances', authorize('ADMIN', 'ADMIN_PUBLISHER'), recalculateAllBalances);

// Specific Account Ledger & Detail
router.get('/:id/ledger', getAccountLedger);
router.get('/:id', getAccountById);

// Account Mutations (Admin & Verifier - Fahad & Khurshid Anwar)
router.post('/', authorize('ADMIN', 'ADMIN_PUBLISHER', 'VERIFIER', 'VERIFICATION_MANAGER'), validateAccount, createAccount);
router.put('/:id', authorize('ADMIN', 'ADMIN_PUBLISHER', 'VERIFIER', 'VERIFICATION_MANAGER'), validateAccount, updateAccount);
router.patch('/:id/status', authorize('ADMIN', 'ADMIN_PUBLISHER', 'VERIFIER', 'VERIFICATION_MANAGER'), toggleAccountStatus);

export default router;
