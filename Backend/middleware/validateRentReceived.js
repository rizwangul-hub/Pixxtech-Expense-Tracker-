import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Property from '../models/Property.js';
import Account from '../models/Account.js';
import RentDue from '../models/RentDue.js';
import { apiError } from '../utils/apiResponse.js';

/**
 * Middleware: Validate Rent Received payload and verify entity relationships
 */
export const validateRentReceived = async (req, res, next) => {
  try {
    const {
      tenantId,
      agreementId,
      propertyId,
      unitId,
      rentDueId,
      rentMonth,
      amount,
      receiptDate,
      receivingAccountId,
      paymentMethod = 'CASH',
      referenceNumber,
    } = req.body;

    const errors = {};

    // 1. Validate ObjectIds
    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      errors.tenantId = 'A valid Tenant ID is required.';
    }
    if (!agreementId || !mongoose.Types.ObjectId.isValid(agreementId)) {
      errors.agreementId = 'A valid Rental Agreement ID is required.';
    }
    if (!receivingAccountId || !mongoose.Types.ObjectId.isValid(receivingAccountId)) {
      errors.receivingAccountId = 'A valid Receiving Account ID is required.';
    }
    if (rentDueId && !mongoose.Types.ObjectId.isValid(rentDueId)) {
      errors.rentDueId = 'Invalid Rent Due ID.';
    }

    // 2. Validate Amount
    const numericAmount = Number(amount);
    if (amount === undefined || amount === null || isNaN(numericAmount) || numericAmount <= 0) {
      errors.amount = 'Receipt amount must be strictly greater than 0.';
    }

    // 3. Validate Month
    if (!rentMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(rentMonth.trim())) {
      errors.rentMonth = 'Rent month must be in YYYY-MM format (e.g. 2026-08).';
    }

    // 4. Validate Receipt Date
    if (receiptDate && isNaN(new Date(receiptDate).getTime())) {
      errors.receiptDate = 'Valid receipt date is required.';
    }

    // 5. Validate Payment Method
    const validMethods = ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER'];
    if (paymentMethod && !validMethods.includes(paymentMethod)) {
      errors.paymentMethod = `Payment method must be one of: ${validMethods.join(', ')}`;
    }

    if (Object.keys(errors).length > 0) {
      return apiError(res, 'Rent receipt validation failed.', 400, errors);
    }

    // 6. Database Relationship Verifications
    const [tenant, agreement, receivingAccount] = await Promise.all([
      Tenant.findById(tenantId),
      RentalAgreement.findById(agreementId),
      Account.findById(receivingAccountId),
    ]);

    if (!tenant) {
      return apiError(res, 'Tenant not found in database.', 404, {
        tenantId: 'Tenant record does not exist.',
      });
    }

    if (!tenant.isActive) {
      return apiError(res, `Tenant "${tenant.fullName}" is marked inactive.`, 400, {
        tenantId: 'Tenant is inactive.',
      });
    }

    if (!agreement) {
      return apiError(res, 'Rental Agreement not found.', 404, {
        agreementId: 'Rental agreement does not exist.',
      });
    }

    // Verify Agreement belongs to Tenant
    if (agreement.tenantId.toString() !== tenantId.toString()) {
      return apiError(
        res,
        'Agreement does not belong to the selected tenant.',
        400,
        { agreementId: 'Agreement / Tenant mismatch.' }
      );
    }

    // Verify Property and Unit match Agreement
    if (propertyId && agreement.propertyId.toString() !== propertyId.toString()) {
      return apiError(
        res,
        'Selected property does not match the rental agreement.',
        400,
        { propertyId: 'Property / Agreement mismatch.' }
      );
    }

    if (unitId && agreement.unitId.toString() !== unitId.toString()) {
      return apiError(
        res,
        'Selected unit does not match the rental agreement.',
        400,
        { unitId: 'Unit / Agreement mismatch.' }
      );
    }

    if (!receivingAccount) {
      return apiError(res, 'Receiving Account not found.', 404, {
        receivingAccountId: 'Receiving account does not exist.',
      });
    }

    if (!receivingAccount.isActive) {
      return apiError(
        res,
        `Receiving Account "${receivingAccount.name}" is inactive and cannot receive funds.`,
        400,
        { receivingAccountId: 'Receiving account is inactive.' }
      );
    }

    // 7. Payment Method & Account Type Compatibility
    const normalizedMethod = paymentMethod.toUpperCase();
    if (normalizedMethod === 'BANK_TRANSFER' && receivingAccount.type !== 'BANK') {
      return apiError(
        res,
        `Payment method "BANK_TRANSFER" requires a Bank Account. "${receivingAccount.name}" is a Cash account.`,
        400,
        { receivingAccountId: 'Account must be of type BANK for bank transfers.' }
      );
    }

    if (normalizedMethod === 'CASH' && receivingAccount.type !== 'CASH') {
      return apiError(
        res,
        `Payment method "CASH" requires a Cash Custodian Account. "${receivingAccount.name}" is a Bank account.`,
        400,
        { receivingAccountId: 'Account must be of type CASH for cash payments.' }
      );
    }

    // Attach verified records to req
    req.verifiedTenant = tenant;
    req.verifiedAgreement = agreement;
    req.verifiedAccount = receivingAccount;
    req.cleanAmount = Math.round((numericAmount + Number.EPSILON) * 100) / 100;
    req.cleanRentMonth = rentMonth.trim();

    next();
  } catch (error) {
    console.error('[Validate Rent Received Middleware Error]:', error);
    return apiError(res, 'Error during rent receipt validation.', 500);
  }
};

export default validateRentReceived;
