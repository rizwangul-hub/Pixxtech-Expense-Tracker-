import express from 'express';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth.js';
import {
  getMonthlyBankStatements,
  uploadBankStatement,
  deleteBankStatement,
  getBankStatementFileStream,
} from '../controllers/bankStatementController.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB per statement file
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|pdf/i.test(file.mimetype) ||
      /\.(pdf|jpg|jpeg|png|webp)$/i.test(file.originalname);
    if (!allowed) {
      return cb(new Error('Invalid file type. Only PDF and Image files (PNG, JPG, WEBP) are supported.'));
    }
    cb(null, true);
  },
});

router.use(protect);

// Get statements for a month
router.get('/:month', getMonthlyBankStatements);

// Stream a file for preview
router.get('/:id/files/:fileId', getBankStatementFileStream);

// Upload statement(s) for an account
router.post(
  '/:month/upload',
  authorize('ADMIN', 'ADMIN_PUBLISHER', 'DATA_ENTRY'),
  upload.array('statementFiles', 10),
  uploadBankStatement
);

// Delete statement / file
router.delete(
  '/:id',
  authorize('ADMIN', 'ADMIN_PUBLISHER'),
  deleteBankStatement
);

export default router;
