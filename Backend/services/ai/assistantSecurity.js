import { hasPermission, PERMISSIONS } from '../../middleware/auth.js';
export class AiError extends Error {
  constructor(message, status = 400, code = 'AI_ERROR') {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.code = code;
  }
}
export function assertFinancialAccess(user) {
  if (!user?._id) throw new AiError('Authentication required.', 401);
  if (user.isDeleted || user.isActive === false || !hasPermission(user, PERMISSIONS.VIEW_FINANCIALS)) throw new AiError('Financial report access is required.', 403);
}
export function validateQuestion(body) {
  const allowed = ['message', 'history', 'conversationId', 'contextToken', 'action'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k))) throw new AiError('Invalid assistant request.');
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1500) throw new AiError('Question must contain 1–1500 characters.');
  if (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 6 || body.history.some(h => !h || h.role !== 'user' || typeof h.content !== 'string' || h.content.length > 1500 || Object.keys(h).some(k => !['role', 'content'].includes(k))))) throw new AiError('Invalid conversation history.');
  if (body.conversationId !== undefined && (typeof body.conversationId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(body.conversationId))) throw new AiError('Invalid conversation identifier.');
  if (body.contextToken !== undefined && (typeof body.contextToken !== 'string' || body.contextToken.length > 8000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.contextToken))) throw new AiError('Invalid conversation context.');
  if (body.action !== undefined) {
    if (!body.action || typeof body.action !== 'object' || Array.isArray(body.action) || JSON.stringify(body.action).length > 3000) throw new AiError('Invalid conversation action.');
    const actionKeys = ['type', 'reportIndex', 'page', 'filters', 'id', 'entityType'];
    if (Object.keys(body.action).some(k => !actionKeys.includes(k)) || !['page', 'filter', 'select'].includes(body.action.type)) throw new AiError('Invalid conversation action.');
    if (body.action.page !== undefined && (!Number.isInteger(body.action.page) || body.action.page < 1 || body.action.page > 100000)) throw new AiError('Invalid conversation page.');
    if (body.action.reportIndex !== undefined && (!Number.isInteger(body.action.reportIndex) || body.action.reportIndex < 0 || body.action.reportIndex > 7)) throw new AiError('Invalid conversation report.');
    if (body.action.filters !== undefined && (!body.action.filters || typeof body.action.filters !== 'object' || Array.isArray(body.action.filters))) throw new AiError('Invalid conversation filters.');
    if (body.action.type === 'select' && (typeof body.action.id !== 'string' || !/^[a-f0-9]{24}$/i.test(body.action.id) || typeof body.action.entityType !== 'string')) throw new AiError('Invalid conversation selection.');
  }
}
export function getAiConfiguration(env = process.env) {
  const provider = (env.AI_PROVIDER || 'gemini').toLowerCase();
  const key = provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
  const enabled = env.AI_ENABLED === 'true';
  const configured = ['gemini', 'openai'].includes(provider) && Boolean(key) && /^[a-zA-Z0-9._-]{1,120}$/.test(env.AI_MODEL || '');
  return { provider, key, model: env.AI_MODEL || '', enabled, configured };
}
