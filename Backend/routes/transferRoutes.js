import express from 'express';
import {
  executeTransfer,
  getTransfers,
  getTransferById,
} from '../controllers/transferController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateTransfer } from '../middleware/validateTransfer.js';

const router = express.Router();

router.use(protect);

router.get('/', getTransfers);
router.get('/:id', getTransferById);
router.post('/', validateTransfer, executeTransfer);

export default router;
