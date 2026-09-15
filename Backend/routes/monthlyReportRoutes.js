import express from 'express';
import {
  getMonthlyReports,
  getMonthlyReportByMonth,
  generateMonthlyReport,
  updateReportStatus,
  validateMonthReconciliation,
} from '../controllers/monthlyReportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// View list of reports history (accessible to authenticated users)
router.get('/', getMonthlyReports);
router.get('/:month', getMonthlyReportByMonth);

// Generation, reconciliation validation, and publishing (restricted to ADMIN_PUBLISHER)
router.post('/generate', authorize('ADMIN_PUBLISHER'), generateMonthlyReport);
router.get('/:month/validate', authorize('ADMIN_PUBLISHER'), validateMonthReconciliation);
router.patch('/:month/status', authorize('ADMIN_PUBLISHER'), updateReportStatus);

export default router;
