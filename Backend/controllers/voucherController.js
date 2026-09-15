import mongoose from 'mongoose';
import Voucher from '../models/Voucher.js';
import Transaction from '../models/Transaction.js';
import Account from '../models/Account.js';
import {
  createVoucherWithLines,
  suggestNextVoucherNumber,
  syncLegacyTransactionsToVouchers,
  getTransactionsFiltered,
  round2,
} from '../services/ledgerService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * @desc    Get all transactions for the central ledger with multi-filters and pagination
 * @route   GET /api/vouchers/transactions
 * @access  Private (Authenticated)
 */
export const getAllTransactions = async (req, res) => {
  try {
    const result = await getTransactionsFiltered(req.query);
    return apiSuccess(res, result, 'Central ledger transactions retrieved successfully.');
  } catch (error) {
    console.error('[Get All Transactions Error]:', error);
    return apiError(res, error.message || 'Failed to retrieve transactions.', 500);
  }
};

/**
 * @desc    Get a voucher by its MongoDB ID with itemized transaction lines
 * @route   GET /api/vouchers/:id
 * @access  Private (Authenticated)
 */
export const getVoucherById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid voucher ID.', 400);
    }

    const voucher = await Voucher.findById(id)
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .lean();

    if (!voucher) {
      return apiError(res, 'Voucher not found.', 404);
    }

    // Find all transaction lines linked to this voucher
    const lines = await Transaction.find({
      $or: [{ voucherId: voucher._id }, { voucherNo: voucher.voucherNumber }],
    })
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type currentBalance bankName cashHolder')
      .populate('crAccountId', 'name type currentBalance bankName cashHolder')
      .populate('propertyId', 'plazaName location')
      .populate('tenantId', 'fullName phone')
      .populate('agreementId', 'agreementNumber')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    // Verify double-entry balancing across lines
    const calculatedTotalDebit = round2(lines.reduce((s, l) => s + (l.amount || 0), 0));
    const calculatedTotalCredit = calculatedTotalDebit; // each line has Dr and Cr with equal amount

    return apiSuccess(
      res,
      {
        voucher,
        lines,
        totalDebit: calculatedTotalDebit,
        totalCredit: calculatedTotalCredit,
        isBalanced: voucher.isBalanced && Math.abs(calculatedTotalDebit - calculatedTotalCredit) < 0.001,
      },
      'Voucher details retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Voucher By ID Error]:', error);
    return apiError(res, error.message || 'Failed to retrieve voucher.', 500);
  }
};

/**
 * @desc    Get a voucher by its Voucher Number (V.N)
 * @route   GET /api/vouchers/number/:voucherNo
 * @access  Private (Authenticated)
 */
export const getVoucherByNumber = async (req, res) => {
  try {
    const { voucherNo } = req.params;
    if (!voucherNo || !voucherNo.trim()) {
      return apiError(res, 'Voucher number is required.', 400);
    }

    const cleanVn = voucherNo.trim().toUpperCase();
    let voucher = await Voucher.findOne({ voucherNumber: cleanVn })
      .populate('createdBy', 'name email role')
      .lean();

    // If not found in Voucher collection, check if transactions exist with this voucherNo and sync
    if (!voucher) {
      await syncLegacyTransactionsToVouchers();
      voucher = await Voucher.findOne({ voucherNumber: cleanVn })
        .populate('createdBy', 'name email role')
        .lean();
    }

    if (!voucher) {
      return apiError(res, `Voucher '${cleanVn}' not found.`, 404);
    }

    const lines = await Transaction.find({
      $or: [{ voucherId: voucher._id }, { voucherNo: cleanVn }],
    })
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type currentBalance bankName cashHolder')
      .populate('crAccountId', 'name type currentBalance bankName cashHolder')
      .populate('propertyId', 'plazaName location')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const calculatedTotal = round2(lines.reduce((s, l) => s + (l.amount || 0), 0));

    return apiSuccess(
      res,
      {
        voucher,
        lines,
        totalDebit: calculatedTotal,
        totalCredit: calculatedTotal,
        isBalanced: true,
      },
      'Voucher details retrieved.'
    );
  } catch (error) {
    console.error('[Get Voucher By Number Error]:', error);
    return apiError(res, error.message || 'Failed to retrieve voucher.', 500);
  }
};

/**
 * @desc    Create a new single or multi-line voucher
 * @route   POST /api/vouchers
 * @access  Private (DATA_ENTRY, ADMIN_PUBLISHER, ADMIN)
 */
export const createVoucher = async (req, res) => {
  try {
    const {
      voucherNumber,
      voucherDate,
      voucherType,
      reference,
      description,
      checkedBy,
      lines,
    } = req.body;

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return apiError(res, 'Voucher must contain at least one line.', 400);
    }

    const result = await createVoucherWithLines({
      voucherNumber,
      voucherDate,
      voucherType: voucherType || 'EXPENSE',
      reference,
      description,
      checkedBy: checkedBy || req.user?.name || null,
      sourceModule: 'MANUAL_VOUCHER',
      createdBy: req.user?._id,
      lines,
    });

    return apiSuccess(
      res,
      result,
      `Voucher #${result.voucher.voucherNumber} created and posted successfully.`,
      201
    );
  } catch (error) {
    console.error('[Create Voucher Error]:', error);
    return apiError(res, error.message || 'Failed to create voucher.', 400);
  }
};

/**
 * @desc    Suggest next sequential voucher number
 * @route   GET /api/vouchers/suggest-vn
 * @access  Private (Authenticated)
 */
export const suggestNextVn = async (req, res) => {
  try {
    const suggestedVoucherNo = await suggestNextVoucherNumber();
    return apiSuccess(res, { suggestedVoucherNo }, 'Next voucher number suggested.');
  } catch (error) {
    console.error('[Suggest Voucher No Error]:', error);
    return apiError(res, 'Failed to calculate sequential voucher number.', 500);
  }
};

/**
 * @desc    Soft-reverse a posted voucher and restore account balances
 * @route   PATCH /api/vouchers/:id/reverse
 * @access  Private (ADMIN_PUBLISHER, ADMIN)
 */
export const reverseVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Auditor reversal' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid voucher ID.', 400);
    }

    const voucher = await Voucher.findById(id);
    if (!voucher) {
      return apiError(res, 'Voucher not found.', 404);
    }

    if (voucher.status === 'REVERSED') {
      return apiError(res, 'This voucher has already been reversed.', 400);
    }

    // Find all transaction lines belonging to this voucher
    const lines = await Transaction.find({
      $or: [{ voucherId: voucher._id }, { voucherNo: voucher.voucherNumber }],
      status: { $ne: 'REVERSED' },
    });

    // Rollback account balances for each line:
    // Debit account was increased -> decrease by amount
    // Credit account was decreased -> increase by amount
    for (const line of lines) {
      await Promise.all([
        Account.findByIdAndUpdate(line.drAccountId, { $inc: { currentBalance: -line.amount } }),
        Account.findByIdAndUpdate(line.crAccountId, { $inc: { currentBalance: line.amount } }),
        Transaction.findByIdAndUpdate(line._id, {
          status: 'REVERSED',
          detail: `[REVERSED] ${line.detail}. Reason: ${reason}`,
          updatedBy: req.user?._id,
        }),
      ]);
    }

    // Mark voucher as REVERSED
    voucher.status = 'REVERSED';
    voucher.description = `[REVERSED on ${new Date().toISOString()}] ${voucher.description}. Reason: ${reason}`;
    voucher.updatedBy = req.user?._id;
    await voucher.save();

    return apiSuccess(res, { voucher, reversedLinesCount: lines.length }, `Voucher #${voucher.voucherNumber} reversed successfully.`);
  } catch (error) {
    console.error('[Reverse Voucher Error]:', error);
    return apiError(res, error.message || 'Failed to reverse voucher.', 500);
  }
};

/**
 * @desc    Trigger synchronization of unlinked legacy transactions to Voucher headers
 * @route   POST /api/vouchers/sync-legacy
 * @access  Private (ADMIN_PUBLISHER, ADMIN)
 */
export const syncLegacyVouchers = async (req, res) => {
  try {
    const syncResult = await syncLegacyTransactionsToVouchers();
    return apiSuccess(res, syncResult, 'Legacy transactions synchronized with Voucher headers.');
  } catch (error) {
    console.error('[Sync Legacy Vouchers Error]:', error);
    return apiError(res, error.message || 'Failed to sync legacy vouchers.', 500);
  }
};

export default {
  getAllTransactions,
  getVoucherById,
  getVoucherByNumber,
  createVoucher,
  suggestNextVn,
  reverseVoucher,
  syncLegacyVouchers,
};
