import express from 'express';
import { getAllAuditLogs, exportAllAuditLogsCsv } from '../controllers/userController.js';
import { protect, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Enforce authentication and Admin role on all audit log routes
router.use(protect, requireRole('ADMIN'));

router.get('/', getAllAuditLogs);
router.get('/export', exportAllAuditLogsCsv);

export default router;
