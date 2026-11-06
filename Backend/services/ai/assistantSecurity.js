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
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['message', 'history'].includes(k))) throw new AiError('Invalid assistant request.');
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1500) throw new AiError('Question must contain 1–1500 characters.');
  if (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 6 || body.history.some(h => !h || h.role !== 'user' || typeof h.content !== 'string' || h.content.length > 1500 || Object.keys(h).some(k => !['role', 'content'].includes(k))))) throw new AiError('Invalid conversation history.');
}
export function getAiConfiguration(env = process.env) {
  const provider = (env.AI_PROVIDER || 'gemini').toLowerCase();
  const key = provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
  const enabled = env.AI_ENABLED === 'true';
  const configured = ['gemini', 'openai'].includes(provider) && Boolean(key) && /^[a-zA-Z0-9._-]{1,120}$/.test(env.AI_MODEL || '');
  return { provider, key, model: env.AI_MODEL || '', enabled, configured };
}
