import express from 'express';
import { getLedgerEntities, queryLedger, downloadLedgerPDF } from '../controllers/ledgerController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Require authentication for all ledger endpoints
router.use(protect);

// Require permitted financial roles (Admin, Verifier, Data Entry, Manager)
router.use(authorize('ADMIN', 'ADMIN_PUBLISHER', 'VERIFIER', 'VERIFICATION_MANAGER', 'DATA_ENTRY'));

/**
 * GET /api/ledgers/download-pdf
 * @desc Download official A4 PDF Statement for a specific ledger head
 */
router.get('/download-pdf', downloadLedgerPDF);

/**
 * GET /api/ledgers/entities
 * @desc Get searchable list of entities per ledger type
 */
router.get('/entities', getLedgerEntities);

/**
 * GET /api/ledgers/query
 * @desc Query real posted financial transactions for a specific ledger
 */
router.get('/query', queryLedger);

export default router;
