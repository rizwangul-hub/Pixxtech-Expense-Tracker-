import express from 'express';
import {
  recordVoucher,
  getMyEntries,
  suggestVoucherNumber,
  updatePendingVoucher,
} from '../controllers/transactionController.js';
import { getAllTransactions } from '../controllers/voucherController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All transaction routes require authentication
router.use(protect);

router.get('/', getAllTransactions);
router.post('/voucher', recordVoucher);
router.get('/my-entries', getMyEntries);
router.get('/suggest-vn', suggestVoucherNumber);
router.put('/:id', updatePendingVoucher);

export default router;
