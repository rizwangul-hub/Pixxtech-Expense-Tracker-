import express from 'express';
import {
  getPendingEntries,
  getVerificationSummary,
  getMySubmissions,
  getPendingEntryById,
  updatePendingEntry,
  verifyEntry,
  rejectEntry,
  deletePendingEntry,
  createPendingEntry,
} from '../controllers/verificationController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Verification Manager & Admin Endpoints (Khurshid Anwar & Fahad)
router.get('/pending', authorize('VERIFICATION_MANAGER', 'VERIFIER', 'ADMIN', 'ADMIN_PUBLISHER'), getPendingEntries);
router.get('/summary', authorize('VERIFICATION_MANAGER', 'VERIFIER', 'ADMIN', 'ADMIN_PUBLISHER'), getVerificationSummary);

// Data Entry Submissions Query & Creation (Sarfraz)
router.get('/my-submissions', getMySubmissions);
router.post('/submit', authorize('DATA_ENTRY', 'VERIFIER', 'VERIFICATION_MANAGER', 'ADMIN', 'ADMIN_PUBLISHER'), createPendingEntry);

// Single Entry Details & Actions (Khurshid Anwar / Verifier)
router.get('/:id', getPendingEntryById);
router.put('/:id', authorize('DATA_ENTRY', 'VERIFICATION_MANAGER', 'VERIFIER', 'ADMIN', 'ADMIN_PUBLISHER'), updatePendingEntry);
router.post('/:id/verify', authorize('VERIFICATION_MANAGER', 'VERIFIER', 'ADMIN', 'ADMIN_PUBLISHER'), verifyEntry);
router.post('/:id/reject', authorize('VERIFICATION_MANAGER', 'VERIFIER', 'ADMIN', 'ADMIN_PUBLISHER'), rejectEntry);
router.delete('/:id', authorize('DATA_ENTRY', 'VERIFICATION_MANAGER', 'VERIFIER', 'ADMIN', 'ADMIN_PUBLISHER'), deletePendingEntry);

export default router;
