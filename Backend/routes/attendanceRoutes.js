import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getDailyAttendance,
  markAttendance,
  bulkMarkAttendance,
  getMonthlyAttendanceSummary,
} from '../controllers/attendanceController.js';

const router = express.Router();

router.use(authenticate);

router.get('/daily', getDailyAttendance);
router.post('/mark', markAttendance);
router.post('/bulk-mark', bulkMarkAttendance);
router.get('/monthly-summary', getMonthlyAttendanceSummary);

export default router;
