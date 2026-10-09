import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getMonthlyPayroll,
  savePayroll,
  downloadSalarySheetExcel,
  generateSalarySlipPDF,
  generateMonthlySalarySheetPDF,
  getPendingSalaryBossReport,
  generatePendingSalaryBossReportPDF,
  getEmployeeLedger,
  paySingleSalary,
  payBulkSalary,
  reverseSalaryPayment,
  getSalaryReconciliation,
} from '../controllers/payrollController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getMonthlyPayroll);
router.post('/save', authorize('ADMIN', 'DATA_ENTRY'), savePayroll);
router.get('/excel', downloadSalarySheetExcel);
router.get('/monthly-sheet-pdf', generateMonthlySalarySheetPDF);
router.get('/boss-pending-report', getPendingSalaryBossReport);
router.post('/boss-pending-report', getPendingSalaryBossReport);
router.get('/boss-pending-report-pdf', generatePendingSalaryBossReportPDF);
router.post('/boss-pending-report-pdf', generatePendingSalaryBossReportPDF);
router.get('/employee-ledger/:employeeId', getEmployeeLedger);
router.get('/slip/:employeeId/pdf', generateSalarySlipPDF);

router.post('/pay-single', paySingleSalary);
router.post('/pay-bulk', payBulkSalary);
router.post('/reverse', reverseSalaryPayment);
router.get('/reconciliation', getSalaryReconciliation);

export default router;
