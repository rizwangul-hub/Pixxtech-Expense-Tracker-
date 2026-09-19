import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getLoanLedger } from '../controllers/loanLedgerController.js';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  recordLoan,
  getLoans,
  getLocations,
  createLocation,
  getDesignations,
  createDesignation,
  getStaffSettings,
  updateStaffSettings,
  getStaffAuditLogs,
  getLeaves,
  createLeave,
  updateLeaveStatus,
  getStaffDashboardStats,
} from '../controllers/staffController.js';

const router = express.Router();

router.use(authenticate);

// Dashboard
router.get('/dashboard', getStaffDashboardStats);

// Employees
router.get('/employees', getEmployees);
router.get('/employees/:id', getEmployeeById);
router.post('/employees', createEmployee);
router.put('/employees/:id', updateEmployee);

// Locations & Designations
router.get('/locations', getLocations);
router.post('/locations', createLocation);
router.get('/designations', getDesignations);
router.post('/designations', createDesignation);

// Settings & Audit Logs
router.get('/settings', getStaffSettings);
router.put('/settings', updateStaffSettings);
router.get('/audit-logs', getStaffAuditLogs);

// Loans & Advances
router.get('/loans', getLoans);
router.post('/loans', recordLoan);
router.post('/employees/:id/loan', recordLoan);

router.get('/loan-ledger', getLoanLedger);
// Leaves
router.get('/leaves', getLeaves);
router.post('/leaves', createLeave);
router.put('/leaves/:id/status', updateLeaveStatus);

export default router;

