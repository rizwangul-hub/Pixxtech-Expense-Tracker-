import mongoose from 'mongoose';
import Account from '../models/Account.js';
import { apiError } from '../utils/apiResponse.js';

/**
 * Validate Transfer payload and verify account states
 */
export const validateTransfer = async (req, res, next) => {
  try {
    const { fromAccountId, toAccountId, amount, date, detail, description } = req.body;
    const errors = {};

    if (!fromAccountId || !mongoose.Types.ObjectId.isValid(fromAccountId)) {
      errors.fromAccountId = 'A valid Source (From) Account is required.';
    }

    if (!toAccountId || !mongoose.Types.ObjectId.isValid(toAccountId)) {
      errors.toAccountId = 'A valid Destination (To) Account is required.';
    }

    if (fromAccountId && toAccountId && fromAccountId.toString() === toAccountId.toString()) {
      errors.toAccountId = 'Source and Destination accounts cannot be identical.';
    }

    const numericAmount = Number(amount);
    if (amount === undefined || amount === null || isNaN(numericAmount) || numericAmount <= 0) {
      errors.amount = 'Transfer amount must be strictly greater than 0.';
    }

    if (date && isNaN(new Date(date).getTime())) {
      errors.date = 'Valid transfer date is required.';
    }

    const narration = (description || detail || '').trim();
    if (!narration) {
      errors.description = 'Transfer description / detail is required.';
    }

    if (Object.keys(errors).length > 0) {
      return apiError(res, 'Transfer validation failed.', 400, errors);
    }

    // Verify both accounts exist and are active
    const [sourceAccount, destAccount] = await Promise.all([
      Account.findById(fromAccountId),
      Account.findById(toAccountId),
    ]);

    if (!sourceAccount) {
      return apiError(res, 'Source Account not found in database.', 404, {
        fromAccountId: 'Account not found.',
      });
    }

    if (!destAccount) {
      return apiError(res, 'Destination Account not found in database.', 404, {
        toAccountId: 'Account not found.',
      });
    }

    if (!sourceAccount.isActive) {
      return apiError(
        res,
        `Source Account "${sourceAccount.name}" is inactive and cannot disburse funds.`,
        400,
        { fromAccountId: 'Account is inactive.' }
      );
    }

    if (!destAccount.isActive) {
      return apiError(
        res,
        `Destination Account "${destAccount.name}" is inactive and cannot receive funds.`,
        400,
        { toAccountId: 'Account is inactive.' }
      );
    }

    req.sourceAccount = sourceAccount;
    req.destAccount = destAccount;
    req.transferAmount = Math.round((numericAmount + Number.EPSILON) * 100) / 100;
    req.transferNarration = narration;

    next();
  } catch (error) {
    console.error('[Validate Transfer Middleware Error]:', error);
    return apiError(res, 'Validation error during transfer verification.', 500);
  }
};

export default validateTransfer;
