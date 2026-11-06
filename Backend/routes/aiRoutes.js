import express from 'express';
import { protect, requirePermission, PERMISSIONS } from '../middleware/auth.js';
import { enhanceNarrationWithGemini } from '../services/aiService.js';
import {
  handleFinanceChat,
  getAiStatus,
  handleConfirmAction,
  handleCancelAction,
  handleDownloadPdfReport,
} from '../controllers/aiAssistantController.js';
import { aiRateLimiter, validateAiQuestion } from '../middleware/aiRateLimit.js';

const router = express.Router();

router.use(protect);

// Status check endpoint
router.get(
  '/status',
  requirePermission(PERMISSIONS.VIEW_FINANCIALS),
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
  getAiStatus
);

// AI Finance Assistant Chat (Read queries, PDF report requests, and Operation Proposals)
router.post(
  '/chat',
  requirePermission(PERMISSIONS.VIEW_FINANCIALS),
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
  validateAiQuestion,
  aiRateLimiter(10, 60000),
  handleFinanceChat
);

// Download Generated AI PDF Report
router.get(
  '/download-report/:token',
  requirePermission(PERMISSIONS.VIEW_FINANCIALS),
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
  handleDownloadPdfReport
);

// Confirm Staged Operation (Requires ENTER_DATA permission)
router.post(
  '/confirm-action',
  requirePermission(PERMISSIONS.ENTER_DATA),
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
  handleConfirmAction
);

// Cancel Staged Operation
router.post(
  '/cancel-action',
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
  handleCancelAction
);

// Existing AI Narration Enhancement
router.post('/enhance-narration', async (req, res) => {
  try {
    const { text = '', context = {} } = req.body;
    const result = await enhanceNarrationWithGemini(text, context);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[AI Narration Route Error]:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to enhance narration with AI.',
      error: err.message,
    });
  }
});

export default router;
