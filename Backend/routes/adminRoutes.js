import express from 'express';
import {
  getFinancialAtAGlance,
  getMasterLedger,
  verifyTransaction,
  updateTransactionMaster,
  deleteTransaction,
  getRentalIncomeSummary,
  getAccountReconciliation,
  getHeadWiseSummary,
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Enforce authentication on all admin routes
router.use(protect);

// Read-only ledger & report endpoints (accessible by ADMIN, VERIFIER, and DATA_ENTRY so Sarfraz can view all ledgers & reports)
router.get('/financial-at-a-glance', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getFinancialAtAGlance);
router.get('/master-ledger', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getMasterLedger);
router.get('/rental-income-summary', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getRentalIncomeSummary);
router.get('/reconcile/account-statement/:accountId', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getAccountReconciliation);
router.get('/head-wise-summary', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getHeadWiseSummary);

// Mutation endpoints restricted to ADMIN_PUBLISHER
router.patch('/transactions/:id/verify', authorize('ADMIN_PUBLISHER'), verifyTransaction);
router.put('/transactions/:id', authorize('ADMIN_PUBLISHER'), updateTransactionMaster);
router.delete('/transactions/:id', authorize('ADMIN_PUBLISHER'), deleteTransaction);

export default router;
