import express from 'express';
import {
  recordRentReceived,
  getRentReceipts,
  getRentReceiptById,
  getRentReceivedSummary,
  getPropertyRentSummary,
  getAccountRentSummary,
  getTenantActiveLease,
  reverseRentReceipt,
} from '../controllers/rentReceivedController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateRentReceived } from '../middleware/validateRentReceived.js';

const router = express.Router();

router.use(protect);

// Summary & aggregation routes (mounted before :id parameter)
router.get('/summary', getRentReceivedSummary);
router.get('/property-summary', getPropertyRentSummary);
router.get('/account-summary', getAccountRentSummary);
router.get('/tenant-lease/:tenantId', getTenantActiveLease);

// CRUD routes
router.get('/', getRentReceipts);
router.get('/:id', getRentReceiptById);
router.post('/', validateRentReceived, recordRentReceived);
router.patch('/:id/reverse', authorize('ADMIN', 'ADMIN_PUBLISHER'), reverseRentReceipt);

export default router;
