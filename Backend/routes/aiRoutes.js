import express from 'express';
import { protect } from '../middleware/auth.js';
import { enhanceNarrationWithGemini } from '../services/aiService.js';

const router = express.Router();

router.use(protect);

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
