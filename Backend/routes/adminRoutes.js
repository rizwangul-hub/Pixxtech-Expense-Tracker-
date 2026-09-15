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

// Enforce authentication & ADMIN_PUBLISHER authorization on all admin routes
router.use(protect);
router.use(authorize('ADMIN_PUBLISHER'));

router.get('/financial-at-a-glance', getFinancialAtAGlance);
router.get('/master-ledger', getMasterLedger);
router.patch('/transactions/:id/verify', verifyTransaction);
router.put('/transactions/:id', updateTransactionMaster);
router.delete('/transactions/:id', deleteTransaction);
router.get('/rental-income-summary', getRentalIncomeSummary);
router.get('/reconcile/account-statement/:accountId', getAccountReconciliation);
router.get('/head-wise-summary', getHeadWiseSummary);

export default router;
