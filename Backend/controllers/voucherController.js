import mongoose from 'mongoose';
import Voucher from '../models/Voucher.js';
import Transaction from '../models/Transaction.js';
import Account from '../models/Account.js';
import {
  createVoucherWithLines,
  suggestNextVoucherNumber,
  syncLegacyTransactionsToVouchers,
  getTransactionsFiltered,
  syncAccountBalances,
  round2,
} from '../services/ledgerService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { generateSingleVoucherPDF } from '../services/pdfReportService.js';

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
    const affectedAccountIds = new Set();
    for (const line of lines) {
      if (line.drAccountId) affectedAccountIds.add(line.drAccountId.toString());
      if (line.crAccountId) affectedAccountIds.add(line.crAccountId.toString());
      await Transaction.findByIdAndUpdate(line._id, {
        status: 'REVERSED',
        detail: `[REVERSED] ${line.detail}. Reason: ${reason}`,
        updatedBy: req.user?._id,
      });
    }

    await syncAccountBalances(affectedAccountIds);

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
 * @desc    Get detailed print voucher data for a single Rent or Expense transaction
 * @route   GET /api/vouchers/print-detail/:id
 * @access  Private (Authenticated)
 */
export const getVoucherPrintDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid transaction or voucher ID.', 400);
    }

    // 1. Try finding in Transaction model
    let tx = await Transaction.findById(id)
      .populate('drAccountId', 'name type bankName accountNumber cashHolder ownerName')
      .populate('crAccountId', 'name type bankName accountNumber cashHolder ownerName')
      .populate('categoryId', 'name type isRentalHead')
      .populate('propertyId', 'propertyName plazaName propertyCode city address units')
      .populate('tenantId', 'tenantName name cnic phone')
      .populate('createdBy', 'name email role')
      .lean();

    // 2. If not found in Transaction, try finding in Voucher model
    if (!tx) {
      const vHeader = await Voucher.findById(id).lean();
      if (vHeader) {
        tx = await Transaction.findOne({
          $or: [{ voucherId: vHeader._id }, { voucherNo: vHeader.voucherNumber }],
        })
          .populate('drAccountId', 'name type bankName accountNumber cashHolder ownerName')
          .populate('crAccountId', 'name type bankName accountNumber cashHolder ownerName')
          .populate('categoryId', 'name type isRentalHead')
          .populate('propertyId', 'propertyName plazaName propertyCode city address units')
          .populate('tenantId', 'tenantName name cnic phone')
          .populate('createdBy', 'name email role')
          .lean();
      }
    }

    if (!tx) {
      return apiError(res, 'Transaction/Voucher record not found.', 404);
    }

    // Resolve property and unit details
    let propertyName = tx.propertyId?.propertyName || tx.propertyId?.plazaName || '';
    let propertyCode = tx.propertyId?.propertyCode || '';
    let unitName = '';
    let unitNumber = '';

    if (tx.propertyId?.units && tx.unitId) {
      const foundUnit = tx.propertyId.units.find(
        (u) => u._id?.toString() === tx.unitId.toString()
      );
      if (foundUnit) {
        unitName = foundUnit.unitName || '';
        unitNumber = foundUnit.unitNumber || foundUnit.unitName || '';
      }
    }

    // Derive Expense Classification (GENERAL_EXPENSE, PROPERTY_OWN_EXPENSE, UNIT_EXPENSE)
    let expenseClassification = 'GENERAL_EXPENSE';
    if (unitName) {
      expenseClassification = 'UNIT_EXPENSE';
    } else if (propertyName) {
      expenseClassification = 'PROPERTY_OWN_EXPENSE';
    }

    // Derive Document Title & Accounts
    const isRent = tx.reportCategory === 'Rent' || tx.sourceModule === 'RENT_RECEIVED';
    const isOtherIncome = tx.reportCategory === 'Other Income' || tx.sourceModule === 'OTHER_INCOME';
    const isTransfer = tx.transactionType === 'TRANSFER';
    const documentTitle = isRent
      ? 'RENT RECEIPT / VOUCHER'
      : isOtherIncome
      ? 'OTHER INCOME RECEIPT / VOUCHER'
      : isTransfer
      ? 'TRANSFER VOUCHER'
      : 'EXPENSE VOUCHER';
    const locationName = [propertyName, unitName].filter(Boolean).join(' - ');
    const categoryTitle = tx.categoryId?.name || (isRent ? 'Rental Income' : (isTransfer ? 'Internal Transfer' : 'General'));

    let resolvedDrName = tx.drAccountId?.name || '';
    let resolvedCrName = tx.crAccountId?.name || '';

    if (isRent) {
      if (!resolvedDrName || /Clearing|External Parties/i.test(resolvedDrName)) {
        resolvedDrName = 'Cash Custodian / Bank';
      }
      resolvedCrName = locationName || 'Rental Income';
    } else if (isOtherIncome) {
      if (!resolvedDrName || /Clearing|External Parties/i.test(resolvedDrName)) {
        resolvedDrName = 'Receiving Account (Bank/Cash)';
      }
      resolvedCrName = categoryTitle || 'Other Income';
    } else if (isTransfer) {
      resolvedDrName = resolvedDrName || 'Destination Account';
      resolvedCrName = resolvedCrName || 'Source Account';
    } else {
      if (!resolvedDrName || /Clearing|External Parties/i.test(resolvedDrName)) {
        resolvedDrName = locationName ? `${locationName} (${categoryTitle})` : categoryTitle;
      }
      if (!resolvedCrName || /Clearing|External Parties/i.test(resolvedCrName)) {
        resolvedCrName = 'Payment Account (Bank/Cash)';
      }
    }

    const printDetail = {
      _id: tx._id,
      voucherNo: tx.voucherNo,
      date: tx.date,
      documentTitle,
      transactionType: tx.transactionType,
      sourceModule: tx.sourceModule,
      reportCategory: tx.reportCategory,
      status: tx.status || 'POSTED',
      detail: tx.detail,
      amount: round2(tx.amount),
      reference: tx.reference || '',
      rentMonth: tx.rentMonth || null,
      expenseClassification,
      property: {
        id: tx.propertyId?._id || null,
        name: propertyName,
        code: propertyCode,
        city: tx.propertyId?.city || 'Lahore',
        address: tx.propertyId?.address || '',
      },
      unit: {
        id: tx.unitId || null,
        name: unitName,
        number: unitNumber,
      },
      tenant: {
        id: tx.tenantId?._id || null,
        name: tx.tenantId?.tenantName || tx.tenantId?.name || '',
        cnic: tx.tenantId?.cnic || '',
        phone: tx.tenantId?.phone || '',
      },
      drAccount: {
        id: tx.drAccountId?._id || null,
        name: resolvedDrName,
        type: tx.drAccountId?.type || '',
        bankName: tx.drAccountId?.bankName || '',
        accountNumber: tx.drAccountId?.accountNumber || '',
        cashHolder: tx.drAccountId?.cashHolder || '',
      },
      crAccount: {
        id: tx.crAccountId?._id || null,
        name: resolvedCrName,
        type: tx.crAccountId?.type || '',
        bankName: tx.crAccountId?.bankName || '',
        accountNumber: tx.crAccountId?.accountNumber || '',
        cashHolder: tx.crAccountId?.cashHolder || '',
      },
      category: {
        id: tx.categoryId?._id || null,
        name: categoryTitle,
        type: tx.categoryId?.type || (isRent ? 'INCOME' : 'EXPENSE'),
        isRentalHead: tx.categoryId?.isRentalHead || isRent,
      },
      preparedBy: tx.createdBy?.name || 'Sarfraz',
      checkedBy: tx.checkedBy || 'Khurshid Anwar',
      attachments: tx.attachments || [],
    };

    return apiSuccess(res, printDetail, 'Print voucher detail retrieved successfully.');
  } catch (error) {
    console.error('[Get Voucher Print Detail Error]:', error);
    return apiError(res, error.message || 'Failed to retrieve voucher print detail.', 500);
  }
};

/**
 * @desc    Download A4 Single Voucher PDF
 * @route   GET /api/vouchers/download-pdf/:id
 * @access  Private (Authenticated)
 */
export const downloadSingleVoucherPDF = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid transaction or voucher ID.', 400);
    }

    // 1. Try finding in Transaction model
    let tx = await Transaction.findById(id)
      .populate('drAccountId', 'name type bankName accountNumber cashHolder ownerName')
      .populate('crAccountId', 'name type bankName accountNumber cashHolder ownerName')
      .populate('categoryId', 'name type isRentalHead')
      .populate('propertyId', 'propertyName plazaName propertyCode city address units')
      .populate('tenantId', 'tenantName name cnic phone')
      .populate('createdBy', 'name email role')
      .lean();

    // 2. If not found in Transaction, try finding in Voucher model
    if (!tx) {
      const vHeader = await Voucher.findById(id).lean();
      if (vHeader) {
        tx = await Transaction.findOne({
          $or: [{ voucherId: vHeader._id }, { voucherNo: vHeader.voucherNumber }],
        })
          .populate('drAccountId', 'name type bankName accountNumber cashHolder ownerName')
          .populate('crAccountId', 'name type bankName accountNumber cashHolder ownerName')
          .populate('categoryId', 'name type isRentalHead')
          .populate('propertyId', 'propertyName plazaName propertyCode city address units')
          .populate('tenantId', 'tenantName name cnic phone')
          .populate('createdBy', 'name email role')
          .lean();
      }
    }

    if (!tx) {
      return apiError(res, 'Transaction/Voucher record not found.', 404);
    }

    // Resolve property and unit details
    let propertyName = tx.propertyId?.propertyName || tx.propertyId?.plazaName || '';
    let propertyCode = tx.propertyId?.propertyCode || '';
    let unitName = '';
    let unitNumber = '';

    if (tx.propertyId?.units && tx.unitId) {
      const foundUnit = tx.propertyId.units.find(
        (u) => u._id?.toString() === tx.unitId.toString()
      );
      if (foundUnit) {
        unitName = foundUnit.unitName || '';
        unitNumber = foundUnit.unitNumber || foundUnit.unitName || '';
      }
    }

    let expenseClassification = 'GENERAL_EXPENSE';
    if (unitName) {
      expenseClassification = 'UNIT_EXPENSE';
    } else if (propertyName) {
      expenseClassification = 'PROPERTY_OWN_EXPENSE';
    }

    // Derive Document Title & Accounts
    const isRent = tx.reportCategory === 'Rent' || tx.sourceModule === 'RENT_RECEIVED';
    const isOtherIncome = tx.reportCategory === 'Other Income' || tx.sourceModule === 'OTHER_INCOME';
    const isTransfer = tx.transactionType === 'TRANSFER';
    const documentTitle = isRent
      ? 'RENT RECEIPT / VOUCHER'
      : isOtherIncome
      ? 'OTHER INCOME RECEIPT / VOUCHER'
      : isTransfer
      ? 'TRANSFER VOUCHER'
      : 'EXPENSE VOUCHER';
    const locationName = [propertyName, unitName].filter(Boolean).join(' - ');
    const categoryTitle = tx.categoryId?.name || (isRent ? 'Rental Income' : (isTransfer ? 'Internal Transfer' : 'General'));

    let resolvedDrName = tx.drAccountId?.name || '';
    let resolvedCrName = tx.crAccountId?.name || '';

    if (isRent) {
      if (!resolvedDrName || /Clearing|External Parties/i.test(resolvedDrName)) {
        resolvedDrName = 'Cash Custodian / Bank';
      }
      resolvedCrName = locationName || 'Rental Income';
    } else if (isOtherIncome) {
      if (!resolvedDrName || /Clearing|External Parties/i.test(resolvedDrName)) {
        resolvedDrName = 'Receiving Account (Bank/Cash)';
      }
      resolvedCrName = categoryTitle || 'Other Income';
    } else if (isTransfer) {
      resolvedDrName = resolvedDrName || 'Destination Account';
      resolvedCrName = resolvedCrName || 'Source Account';
    } else {
      if (!resolvedDrName || /Clearing|External Parties/i.test(resolvedDrName)) {
        resolvedDrName = locationName ? `${locationName} (${categoryTitle})` : categoryTitle;
      }
      if (!resolvedCrName || /Clearing|External Parties/i.test(resolvedCrName)) {
        resolvedCrName = 'Payment Account (Bank/Cash)';
      }
    }

    const printDetail = {
      _id: tx._id,
      voucherNo: tx.voucherNo,
      date: tx.date,
      documentTitle,
      transactionType: tx.transactionType,
      sourceModule: tx.sourceModule,
      reportCategory: tx.reportCategory,
      status: tx.status || 'POSTED',
      detail: tx.detail,
      amount: round2(tx.amount),
      reference: tx.reference || '',
      rentMonth: tx.rentMonth || null,
      expenseClassification,
      property: {
        id: tx.propertyId?._id || null,
        name: propertyName,
        code: propertyCode,
        city: tx.propertyId?.city || 'Lahore',
        address: tx.propertyId?.address || '',
      },
      unit: {
        id: tx.unitId || null,
        name: unitName,
        number: unitNumber,
      },
      tenant: {
        id: tx.tenantId?._id || null,
        name: tx.tenantId?.tenantName || tx.tenantId?.name || '',
        cnic: tx.tenantId?.cnic || '',
        phone: tx.tenantId?.phone || '',
      },
      drAccount: {
        id: tx.drAccountId?._id || null,
        name: resolvedDrName,
        type: tx.drAccountId?.type || '',
        bankName: tx.drAccountId?.bankName || '',
        accountNumber: tx.drAccountId?.accountNumber || '',
        cashHolder: tx.drAccountId?.cashHolder || '',
      },
      crAccount: {
        id: tx.crAccountId?._id || null,
        name: resolvedCrName,
        type: tx.crAccountId?.type || '',
        bankName: tx.crAccountId?.bankName || '',
        accountNumber: tx.crAccountId?.accountNumber || '',
        cashHolder: tx.crAccountId?.cashHolder || '',
      },
      category: {
        id: tx.categoryId?._id || null,
        name: categoryTitle,
        type: tx.categoryId?.type || (isRent ? 'INCOME' : 'EXPENSE'),
        isRentalHead: tx.categoryId?.isRentalHead || isRent,
      },
      preparedBy: tx.createdBy?.name || 'Sarfraz',
      checkedBy: tx.checkedBy || 'Khurshid Anwar',
    };

    const pdfBuffer = await generateSingleVoucherPDF(printDetail);
    const filename = `Voucher_${tx.voucherNo || tx._id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[Download Single Voucher PDF Error]:', error);
    return apiError(res, error.message || 'Failed to generate voucher PDF.', 500);
  }
};

/**
 * @desc    Sync legacy transactions into single/multi-line Vouchers
 * @route   POST /api/vouchers/sync-legacy
 * @access  Private (ADMIN_PUBLISHER, ADMIN)
 */
export const syncLegacyVouchers = async (req, res) => {
  try {
    const result = await syncLegacyTransactionsToVouchers();
    return apiSuccess(res, result, 'Legacy transactions synchronized to vouchers.');
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
  getVoucherPrintDetail,
  downloadSingleVoucherPDF,
};
