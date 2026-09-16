import express from 'express';
import {
  getAllTransactions,
  getVoucherById,
  getVoucherByNumber,
  createVoucher,
  suggestNextVn,
  reverseVoucher,
  syncLegacyVouchers,
  getVoucherPrintDetail,
  downloadSingleVoucherPDF,
} from '../controllers/voucherController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All voucher routes require authentication
router.use(protect);

// 1. Central Ledger Transactions & Suggestions
router.get('/transactions', getAllTransactions);
router.get('/suggest-vn', suggestNextVn);
router.get('/print-detail/:id', getVoucherPrintDetail);
router.get('/download-pdf/:id', downloadSingleVoucherPDF);
router.get('/number/:voucherNo', getVoucherByNumber);
router.get('/:id', getVoucherById);

// 2. Create Voucher (DATA_ENTRY, ADMIN_PUBLISHER, ADMIN)
router.post(
  '/',
  authorize('DATA_ENTRY', 'ADMIN_PUBLISHER', 'ADMIN'),
  createVoucher
);

// 3. Reversal Safety & Legacy Synchronization (ADMIN_PUBLISHER, ADMIN only)
router.patch(
  '/:id/reverse',
  authorize('ADMIN_PUBLISHER', 'ADMIN'),
  reverseVoucher
);

router.post(
  '/sync-legacy',
  authorize('ADMIN_PUBLISHER', 'ADMIN'),
  syncLegacyVouchers
);

export default router;
