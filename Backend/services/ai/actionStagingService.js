import crypto from 'node:crypto';

// In-memory proposal store for two-step confirmation
const stagedActions = new Map();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ACTION_TTL_MS = 15 * 60 * 1000; // 15 minutes

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [actionId, action] of stagedActions.entries()) {
    if (action.expiresAt < now) {
      stagedActions.delete(actionId);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

/**
 * Stage an accounting action awaiting user confirmation
 */
export const stageAction = ({ userId, actionType, summary, payload }) => {
  if (!userId || !actionType || !payload) {
    throw new Error('userId, actionType, and payload are required to stage an action.');
  }

  const actionId = `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = Date.now();
  const expiresAt = now + ACTION_TTL_MS;

  const action = {
    actionId,
    userId: String(userId),
    actionType,
    summary,
    payload,
    createdAt: now,
    expiresAt,
  };

  // Remove any older pending proposal for this user to keep state clean
  for (const [id, act] of stagedActions.entries()) {
    if (act.userId === String(userId)) {
      stagedActions.delete(id);
    }
  }

  stagedActions.set(actionId, action);

  return {
    actionId,
    actionType,
    summary,
    expiresAt,
  };
};

/**
 * Get an active proposal by ID and user
 */
export const getAction = (actionId, userId) => {
  if (!actionId || !stagedActions.has(actionId)) return null;
  const action = stagedActions.get(actionId);
  if (action.expiresAt < Date.now()) {
    stagedActions.delete(actionId);
    return null;
  }
  if (userId && action.userId !== String(userId)) {
    return null;
  }
  return action;
};

/**
 * Atomically consume an action so it cannot be executed twice (idempotency)
 */
export const consumeAction = (actionId, userId) => {
  const action = getAction(actionId, userId);
  if (!action) return null;
  stagedActions.delete(actionId);
  return action;
};

/**
 * Cancel a staged action
 */
export const cancelAction = (actionId, userId) => {
  const action = getAction(actionId, userId);
  if (!action) return false;
  stagedActions.delete(actionId);
  return true;
};

/**
 * Find the latest active staged proposal for a user (e.g. when typing "confirm" or "cancel")
 */
export const getLatestUserAction = (userId) => {
  if (!userId) return null;
  const uId = String(userId);
  const now = Date.now();
  let latest = null;

  for (const [actionId, action] of stagedActions.entries()) {
    if (action.userId === uId) {
      if (action.expiresAt < now) {
        stagedActions.delete(actionId);
      } else if (!latest || action.createdAt > latest.createdAt) {
        latest = action;
      }
    }
  }

  return latest;
};

/**
 * Clear all actions (primarily for testing)
 */
export const clearStagedActions = () => {
  stagedActions.clear();
};
