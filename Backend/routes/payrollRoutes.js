import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getMonthlyPayroll,
  savePayroll,
  downloadSalarySheetExcel,
  generateSalarySlipPDF,
  generateSalarySheetPDF,
} from '../controllers/payrollController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getMonthlyPayroll);
router.post('/save', savePayroll);
router.get('/excel', downloadSalarySheetExcel);
router.get('/pdf', generateSalarySheetPDF);
router.get('/slip/:employeeId/pdf', generateSalarySlipPDF);

export default router;
