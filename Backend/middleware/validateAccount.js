import { apiError } from '../utils/apiResponse.js';

/**
 * Validate Account creation and update payload
 */
export const validateAccount = (req, res, next) => {
  const isUpdate = req.method === 'PUT' || req.method === 'PATCH';
  const {
    name,
    accountName,
    type,
    accountType,
    bankName,
    cashHolder,
    openingBalance,
  } = req.body;

  const errors = {};
  const effectiveName = (accountName || name || '').trim();
  const effectiveType = accountType || type;

  if (!isUpdate || accountName !== undefined || name !== undefined) {
    if (!effectiveName) {
      errors.accountName = 'Account name is required.';
    }
  }

  if (!isUpdate || accountType !== undefined || type !== undefined) {
    if (!effectiveType || !['BANK', 'CASH'].includes(effectiveType)) {
      errors.accountType = 'Account type must be either BANK or CASH.';
    }
  }

  // Type-specific requirements
  if (effectiveType === 'CASH') {
    if (!isUpdate || cashHolder !== undefined) {
      if (!cashHolder || !cashHolder.trim()) {
        errors.cashHolder = 'Cash Holder name is required for Cash accounts.';
      }
    }
  }

  if (effectiveType === 'BANK') {
    if (!isUpdate || bankName !== undefined) {
      if (!bankName || !bankName.trim()) {
        errors.bankName = 'Bank name is required for Bank accounts.';
      }
    }
  }

  // Numeric balance validation
  if (openingBalance !== undefined) {
    if (isNaN(Number(openingBalance))) {
      errors.openingBalance = 'Opening balance must be a valid numeric amount.';
    }
  }

  if (Object.keys(errors).length > 0) {
    return apiError(res, 'Account validation failed.', 400, errors);
  }

  next();
};

export default validateAccount;
