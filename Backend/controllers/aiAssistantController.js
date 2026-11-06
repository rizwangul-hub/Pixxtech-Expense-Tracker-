import { getAiConfiguration } from '../services/ai/assistantSecurity.js';
import { askFinanceAssistant } from '../services/ai/aiProvider.js';

/**
 * Handle AI Finance Assistant Chat Queries
 * POST /api/ai/chat
 */
export const handleFinanceChat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    const user = req.user;

    const result = await askFinanceAssistant(message, history, user);

    return res.status(200).json({
      success: true,
      message: result.message,
      toolCalls: result.toolCalls || [],
      engine: result.engine || 'ai-assistant',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AI Finance Assistant Error]:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to retrieve financial records. Please retry.',
    });
  }
};

/**
 * Get AI Assistant Status
 * GET /api/ai/status
 */
export const getAiStatus = (req, res) => {
  const { provider, model, enabled, configured } = getAiConfiguration();
  return res.status(200).json({ success: true, enabled, provider, model, hasApiKey: configured, mode: enabled && configured ? 'cloud-ai' : 'unavailable' });
};
