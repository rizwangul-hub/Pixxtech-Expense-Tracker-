import express from 'express';
import {
  getMonthlyReports,
  getMonthlyReportByMonth,
  generateMonthlyReport,
  resetMonthlyReport,
  updateReportStatus,
  validateMonthReconciliation,
} from '../controllers/monthlyReportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// View list of reports history (accessible to authenticated users)
router.get('/', getMonthlyReports);
router.get('/:month', getMonthlyReportByMonth);

// Generation, reset, reconciliation validation, and publishing (restricted to ADMIN, ADMIN_PUBLISHER)
router.post('/generate', authorize('ADMIN', 'ADMIN_PUBLISHER'), generateMonthlyReport);
router.post('/:month/reset', authorize('ADMIN', 'ADMIN_PUBLISHER'), resetMonthlyReport);
router.get('/:month/validate', authorize('ADMIN', 'ADMIN_PUBLISHER'), validateMonthReconciliation);
router.patch('/:month/status', authorize('ADMIN', 'ADMIN_PUBLISHER'), updateReportStatus);

export default router;
