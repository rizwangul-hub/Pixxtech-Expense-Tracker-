import express from 'express';
import {
  getRentDue,
  getRentDueSummary,
  generateMonthlyRentDue,
  getRentDueById,
} from '../controllers/rentDueController.js';
import { protect, requireRole } from '../middleware/auth.js';
import { validateRentDueGeneration } from '../middleware/validateTenancy.js';

const router = express.Router();

// All rent due routes require authentication
router.use(protect);

// Overview / Summary route
router.get('/summary', getRentDueSummary);

// Collection routes
router.get('/', getRentDue);
router.post('/generate', requireRole('ADMIN'), validateRentDueGeneration, generateMonthlyRentDue);

// Single record route
router.get('/:id', getRentDueById);

export default router;
