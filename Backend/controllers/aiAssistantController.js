import { getAiConfiguration, AiError } from '../services/ai/assistantSecurity.js';
import { askFinanceAssistant } from '../services/ai/aiProvider.js';
import { readConversation, signConversation } from '../services/ai/conversationContext.js';
import { resolveActionProposal } from '../services/ai/transactionIntentResolver.js';
import { stageAction, consumeAction, cancelAction, getLatestUserAction } from '../services/ai/actionStagingService.js';
import { executeConfirmedAction } from '../services/ai/financialOperationsExecutor.js';
import { isPdfReportRequest, generateAiPdfReport, getPdfReport } from '../services/ai/aiPdfReportService.js';
import { hasPermission, PERMISSIONS } from '../middleware/auth.js';

/**
 * Handle AI Finance Assistant Chat Queries, Transaction Operations, & PDF Reports
 * POST /api/ai/chat
 */
export const handleFinanceChat = async (req, res) => {
  try {
    const config = getAiConfiguration();
    if (!config.enabled) {
      throw new AiError('AI Finance Assistant is disabled.', 503);
    }

    const { message, history = [] } = req.body;
    const user = req.user;

    const trimmedMsg = (message || '').trim();
    const lowerMsg = trimmedMsg.toLowerCase();

    // 1. Conversational confirmation check ("confirm", "yes", "save", "haan", etc.)
    const isConfirmIntent = /^(confirm|yes|proceed|save|haan|theek hai|yes please|do it|record it)\b/i.test(lowerMsg);
    if (isConfirmIntent) {
      const latestAction = getLatestUserAction(user._id);
      if (latestAction) {
        if (!hasPermission(user, PERMISSIONS.ENTER_DATA)) {
          throw new AiError('You do not have permission to enter financial data or transactions.', 403);
        }
        const consumed = consumeAction(latestAction.actionId, user._id);
        if (consumed) {
          const execResult = await executeConfirmedAction(consumed, user);
          return res.status(200).json({
            success: true,
            actionType: consumed.actionType,
            message: execResult.message,
            voucherNo: execResult.voucherNo,
            record: execResult.record,
            isPending: execResult.isPending,
            confirmed: true,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // 2. Conversational cancellation check ("cancel", "no", "discard", "nahi", etc.)
    const isCancelIntent = /^(cancel|no|discard|stop|nahi|rehne do|cancel it)\b/i.test(lowerMsg);
    if (isCancelIntent) {
      const latestAction = getLatestUserAction(user._id);
      if (latestAction) {
        cancelAction(latestAction.actionId, user._id);
        return res.status(200).json({
          success: true,
          message: 'The staged transaction has been cancelled. No changes were made.',
          cancelled: true,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 3. Natural Language PDF Report Requests (e.g. "Give me Bank Al Falah ledger in PDF")
    if (isPdfReportRequest(trimmedMsg)) {
      let pdfResult;
      try {
        pdfResult = await generateAiPdfReport(trimmedMsg, user);
      } catch (error) {
        console.error('[AI PDF Report Error]:', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
        });
        throw new AiError(
          'PDF report generation is temporarily unavailable. Please retry.',
          503,
          'AI_PDF_GENERATION_FAILED'
        );
      }
      if (pdfResult?.isClarification) {
        return res.status(200).json({
          success: true,
          message: pdfResult.message,
          isClarification: true,
          timestamp: new Date().toISOString(),
        });
      }

      if (pdfResult?.success) {
        return res.status(200).json({
          success: true,
          message: pdfResult.message,
          pdfReport: pdfResult.pdfReport,
          engine: 'pdf-generation-service',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 4. Check for accounting transaction operation intent only when the
    // wording is an explicit command. "Give me ... ledger" is a read request,
    // not a disbursement, and must not trigger the resolver's extra model reads.
    const readRequestPrefix = /^(?:please\s+)?(?:show|tell|give|provide|list|send)\s+me\b/i.test(lowerMsg);
    const explicitOperationIntent = !readRequestPrefix && /\b(record|create|add|enter|transfer|send|give|delete|remove|reverse|cancel|settle|update|edit|change)\b/i.test(lowerMsg);
    if (explicitOperationIntent) {
      const proposal = await resolveActionProposal(trimmedMsg, user);
      if (proposal?.isProposal) {
        if (!hasPermission(user, PERMISSIONS.ENTER_DATA)) {
          return res.status(403).json({
            success: false,
            code: 'FORBIDDEN',
            message: 'You do not have permission to create or edit financial transactions.',
          });
        }

        const staged = stageAction({
          userId: user._id,
          actionType: proposal.actionType,
          summary: proposal.summary,
          payload: proposal.payload,
        });

        return res.status(200).json({
          success: true,
          message: proposal.confirmationPrompt,
          pendingAction: staged,
          timestamp: new Date().toISOString(),
        });
      }

      if (proposal?.isClarification) {
        return res.status(200).json({
          success: true,
          message: proposal.message,
          isClarification: true,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 5. Fallback to normal financial query assistant
    const conversation = readConversation(req.body, user);
    const result = await askFinanceAssistant(message, history, user, {
      conversationState: conversation,
      action: req.body.action,
    });
    const next = result.conversationState || conversation;
    const contextToken = signConversation(user, next.conversationId, next.plans || [], next.entities || {}, next.matches || []);

    return res.status(200).json({
      success: true,
      message: result.message,
      toolCalls: result.toolCalls || [],
      engine: result.engine || 'ai-assistant',
      conversationId: next.conversationId,
      contextToken,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    const code = error?.code || 'AI_REQUEST_FAILED';
    console.error('[AI Finance Assistant Error]:', {
      name: error?.name,
      status,
      code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(status).json({
      success: false,
      message: error?.status ? error.message : 'Failed to process financial request. Please retry.',
      code,
    });
  }
};

/**
 * Download Generated PDF Report Endpoint
 * GET /api/ai/download-report/:token
 */
export const handleDownloadPdfReport = async (req, res) => {
  try {
    const token = req.params.token || req.query.token;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Report download token is required.' });
    }

    const report = getPdfReport(token);
    if (!report || !report.buffer) {
      return res.status(404).json({
        success: false,
        message: 'PDF report has expired or was not found. Please request the report again in the assistant chat.',
      });
    }

    const safeFilename = (report.fileName || 'Report.pdf')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/__+/g, '_');

    res.setHeader('Content-Type', report.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', report.buffer.length);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).send(report.buffer);
  } catch (error) {
    console.error('[Download PDF Report Error]:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to download PDF report.',
      code: 'AI_PDF_DOWNLOAD_FAILED',
    });
  }
};

/**
 * Explicit Confirm Staged Action Endpoint
 * POST /api/ai/confirm-action
 */
export const handleConfirmAction = async (req, res) => {
  try {
    const { actionId } = req.body;
    const user = req.user;

    if (!actionId) {
      return res.status(400).json({ success: false, message: 'Action ID is required.' });
    }

    if (!hasPermission(user, PERMISSIONS.ENTER_DATA)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to enter financial data.' });
    }

    const action = consumeAction(actionId, user._id);
    if (!action) {
      return res.status(404).json({
        success: false,
        message: 'Proposal not found, already executed, or expired. Please submit the transaction instruction again.',
      });
    }

    const result = await executeConfirmedAction(action, user);

    return res.status(200).json({
      success: true,
      actionType: action.actionType,
      message: result.message,
      voucherNo: result.voucherNo,
      record: result.record,
      isPending: result.isPending,
      confirmed: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Confirm Action Error]:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to execute confirmed action.',
      code: error.code || 'ACTION_EXECUTION_FAILED',
    });
  }
};

/**
 * Explicit Cancel Staged Action Endpoint
 * POST /api/ai/cancel-action
 */
export const handleCancelAction = async (req, res) => {
  try {
    const { actionId } = req.body;
    const user = req.user;

    if (!actionId) {
      return res.status(400).json({ success: false, message: 'Action ID is required.' });
    }

    const cancelled = cancelAction(actionId, user._id);
    return res.status(200).json({
      success: true,
      message: cancelled ? 'Transaction cancelled successfully.' : 'No active transaction found to cancel.',
      cancelled,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel transaction.',
      error: error.message,
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
