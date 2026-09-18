import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getMonthlyPayroll,
  savePayroll,
  downloadSalarySheetExcel,
  generateSalarySlipPDF,
  generateMonthlySalarySheetPDF,
  getEmployeeLedger,
  paySingleSalary,
  payBulkSalary,
  reverseSalaryPayment,
  getSalaryReconciliation,
} from '../controllers/payrollController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getMonthlyPayroll);
router.post('/save', savePayroll);
router.get('/excel', downloadSalarySheetExcel);
router.get('/monthly-sheet-pdf', generateMonthlySalarySheetPDF);
router.get('/employee-ledger/:employeeId', getEmployeeLedger);
router.get('/slip/:employeeId/pdf', generateSalarySlipPDF);

router.post('/pay-single', paySingleSalary);
router.post('/pay-bulk', payBulkSalary);
router.post('/reverse', reverseSalaryPayment);
router.get('/reconciliation', getSalaryReconciliation);

export default router;
