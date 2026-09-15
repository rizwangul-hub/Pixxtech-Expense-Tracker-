import express from 'express';
import {
  downloadFundsReportPDF,
  getMonthlyFinancialSummary,
  getAccountLedgerReport,
  getExpenseSummaryReport,
  getPropertyExpenseReport,
  getAllTransactionsReport,
  getReconciliationReport,
  exportExcel,
  exportCSV,
} from '../controllers/reportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Reports require authentication and financial-view access.
// Include the supported administrator and verification roles explicitly so
// role names remain compatible with both current and legacy user records.
router.use(protect);
router.use(authorize('ADMIN', 'ADMIN_PUBLISHER', 'VERIFIER', 'VERIFICATION_MANAGER'));

// ── Phase 7 (existing) — PDF Funds Report ──────────────────────────────────
router.get('/funds-management-pdf', downloadFundsReportPDF);

// ── Phase 9 (existing) — Monthly Financial Summary ─────────────────────────
router.get('/monthly-financial-summary', getMonthlyFinancialSummary);

// ── Phase 10 — New Report Endpoints ────────────────────────────────────────

// Account Ledger (Bank or Cash) with date range
router.get('/account-ledger/:accountId', getAccountLedgerReport);

// Head-wise Expense Summary with optional property filter
router.get('/expense-summary', getExpenseSummaryReport);

// Property-wise Expense Report
router.get('/property-expense', getPropertyExpenseReport);

// All Transactions with full filter set
router.get('/all-transactions', getAllTransactionsReport);

// Reconciliation — ledger vs live balance check
router.get('/reconciliation', getReconciliationReport);

// Excel Export — ?type=account-ledger|expense-summary|property-expense|all-transactions|rental-income
router.get('/export/excel', exportExcel);

// CSV Export — ?type=account-ledger|expense-summary|all-transactions
router.get('/export/csv', exportCSV);

export default router;
