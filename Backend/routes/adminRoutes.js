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

import multer from 'multer';
import {
  createBackup,
  downloadBackup,
  getBackupHistory,
  validateBackupFile,
  restoreBackupFile,
} from '../controllers/backupController.js';

const uploadZip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for backup archives
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP archive files (.zip) are permitted.'));
    }
  },
});

// Enforce authentication on all admin routes
router.use(protect);

// ============================================================================
// DATABASE BACKUP & RESTORE ENDPOINTS (ADMIN / ADMIN_PUBLISHER ONLY)
// DATA_ENTRY and VERIFIER are strictly forbidden from these endpoints
// ============================================================================
router.post('/backups/create', authorize('ADMIN', 'ADMIN_PUBLISHER'), createBackup);
router.get('/backups/download/:id', authorize('ADMIN', 'ADMIN_PUBLISHER'), downloadBackup);
router.get('/backups/history', authorize('ADMIN', 'ADMIN_PUBLISHER'), getBackupHistory);
router.post('/backups/validate', authorize('ADMIN', 'ADMIN_PUBLISHER'), uploadZip.single('backupFile'), validateBackupFile);
router.post('/backups/restore', authorize('ADMIN', 'ADMIN_PUBLISHER'), uploadZip.single('backupFile'), restoreBackupFile);

// Read-only ledger & report endpoints (accessible by ADMIN, VERIFIER, and DATA_ENTRY so Sarfraz can view all ledgers & reports)
router.get('/financial-at-a-glance', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getFinancialAtAGlance);
router.get('/master-ledger', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getMasterLedger);
router.get('/rental-income-summary', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getRentalIncomeSummary);
router.get('/reconcile/account-statement/:accountId', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getAccountReconciliation);
router.get('/head-wise-summary', authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER'), getHeadWiseSummary);

// Mutation endpoints restricted to ADMIN / ADMIN_PUBLISHER
router.patch('/transactions/:id/verify', authorize('ADMIN', 'ADMIN_PUBLISHER'), verifyTransaction);
router.put('/transactions/:id', authorize('ADMIN', 'ADMIN_PUBLISHER'), updateTransactionMaster);
router.delete('/transactions/:id', authorize('ADMIN', 'ADMIN_PUBLISHER'), deleteTransaction);

export default router;
