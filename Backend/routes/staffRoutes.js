import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  recordLoan,
} from '../controllers/staffController.js';

const router = express.Router();

router.use(authenticate);

router.get('/employees', getEmployees);
router.get('/employees/:id', getEmployeeById);
router.post('/employees', createEmployee);
router.put('/employees/:id', updateEmployee);
router.post('/employees/:id/loan', recordLoan);

export default router;
