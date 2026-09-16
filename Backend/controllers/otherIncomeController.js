import mongoose from 'mongoose';
import OtherIncome from '../models/OtherIncome.js';
import OtherIncomeHead from '../models/OtherIncomeHead.js';
import Account from '../models/Account.js';
import Property from '../models/Property.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import Voucher from '../models/Voucher.js';
import RentReceived from '../models/RentReceived.js';
import { createTransaction, round2, suggestNextVoucherNumber } from '../services/ledgerService.js';

/**
 * In-memory short-term idempotency cache to prevent double-click / rapid submission duplicates
 */
const recentSubmissions = new Map();
const IDEMPOTENCY_TTL_MS = 15000; // 15 seconds window

const cleanupOldSubmissions = () => {
  const now = Date.now();
  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > IDEMPOTENCY_TTL_MS) {
      recentSubmissions.delete(key);
    }
  }
};

/**
 * Helper to ensure a system clearing account exists for double-entry Other Income credits
 */
export const getOrCreateOtherIncomeClearingAccount = async () => {
  let clearingAccount = await Account.findOne({
    $or: [
      { name: 'External Parties / Operations Clearing' },
      { name: 'External Parties / Other Income Clearing' },
      { isClearing: true },
    ],
  });

  if (!clearingAccount) {
    clearingAccount = await Account.create({
      name: 'External Parties / Operations Clearing',
      accountName: 'External Parties / Operations Clearing',
      type: 'CASH',
      accountType: 'CASH',
      cashHolder: 'Operations Clearing',
      currentBalance: 0,
      openingBalance: 0,
      isClearing: true,
      isActive: true,
      notes: 'System clearing account for counterparty double-entry credits and disbursements',
    });
  }

  return clearingAccount;
};

/**
 * Helper to generate sequential Other Income receipt numbers (e.g., OI-202608-0001)
 */
export const generateOtherIncomeReceiptNumber = async (date) => {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `OI-${year}${month}-`;

  const lastReceipt = await OtherIncome.findOne({
    receiptNumber: { $regex: `^${monthPrefix}` },
  })
    .sort({ receiptNumber: -1 })
    .collation({ locale: 'en', numericOrdering: true });

  let nextSequence = 1;
  if (lastReceipt && lastReceipt.receiptNumber) {
    const parts = lastReceipt.receiptNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      nextSequence = lastSeq + 1;
    }
  }

  return `${monthPrefix}${String(nextSequence).padStart(4, '0')}`;
};

/**
 * @desc    Get all configured Other Income Heads
 * @route   GET /api/other-income/heads
 * @access  Private
 */
export const getIncomeHeads = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const filter = includeInactive === 'true' ? {} : { isActive: true };

    let heads = await OtherIncomeHead.find(filter).sort({ name: 1 }).lean();

    // Default bootstrap heads if none exist in the system yet
    if (heads.length === 0) {
      const defaultHeads = [
        { name: 'Other Receipts', code: 'OIR-REC', description: 'General other receipts and business collections' },
        { name: 'Recovery', code: 'OIR-RCV', description: 'Recoveries from tenants, contractors, or external parties' },
        { name: 'Refund', code: 'OIR-RFD', description: 'Refunds received from utilities, taxes, or vendors' },
        { name: 'Miscellaneous Income', code: 'OIR-MISC', description: 'Miscellaneous business and sundry income' },
      ];

      for (const d of defaultHeads) {
        await OtherIncomeHead.findOneAndUpdate(
          { name: d.name },
          { ...d, isActive: true, createdBy: req.user?._id },
          { upsert: true, new: true }
        );
        await Category.findOneAndUpdate(
          { name: d.name },
          { name: d.name, type: 'INCOME', isRentalHead: false },
          { upsert: true }
        );
      }
      heads = await OtherIncomeHead.find(filter).sort({ name: 1 }).lean();
    }

    res.status(200).json({
      success: true,
      count: heads.length,
      data: heads,
    });
  } catch (error) {
    console.error('getIncomeHeads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Other Income Heads',
      error: error.message,
    });
  }
};

/**
 * @desc    Create a new Other Income Head
 * @route   POST /api/other-income/heads
 * @access  Private (Admin Only)
 */
export const createIncomeHead = async (req, res) => {
  try {
    const { name, code, description, isActive = true } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Income Head name is required.',
      });
    }

    const trimmedName = name.trim();
    const existing = await OtherIncomeHead.findOne({
      name: { $regex: `^${trimmedName}$`, $options: 'i' },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `An Income Head named "${trimmedName}" already exists.`,
      });
    }

    const head = await OtherIncomeHead.create({
      name: trimmedName,
      code: code ? code.trim().toUpperCase() : undefined,
      description: description ? description.trim() : '',
      isActive: Boolean(isActive),
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    // Synchronize with Category model
    await Category.findOneAndUpdate(
      { name: trimmedName },
      { name: trimmedName, type: 'INCOME', isRentalHead: false },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      message: 'Other Income Head created successfully',
      data: head,
    });
  } catch (error) {
    console.error('createIncomeHead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create Other Income Head',
      error: error.message,
    });
  }
};

/**
 * @desc    Update an existing Other Income Head
 * @route   PUT /api/other-income/heads/:id
 * @access  Private (Admin Only)
 */
export const updateIncomeHead = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, isActive } = req.body;

    const head = await OtherIncomeHead.findById(id);
    if (!head) {
      return res.status(404).json({
        success: false,
        message: 'Income Head not found.',
      });
    }

    const oldName = head.name;
    if (name && name.trim()) {
      head.name = name.trim();
    }
    if (code !== undefined) {
      head.code = code ? code.trim().toUpperCase() : '';
    }
    if (description !== undefined) {
      head.description = description ? description.trim() : '';
    }
    if (isActive !== undefined) {
      head.isActive = Boolean(isActive);
    }
    head.updatedBy = req.user?._id;

    await head.save();

    // Synchronize name with Category if updated
    if (oldName !== head.name) {
      await Category.findOneAndUpdate(
        { name: oldName },
        { name: head.name, type: 'INCOME', isRentalHead: false },
        { upsert: true }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Income Head updated successfully',
      data: head,
    });
  } catch (error) {
    console.error('updateIncomeHead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Income Head',
      error: error.message,
    });
  }
};

/**
 * @desc    Record an Other Income Receipt (with Central Voucher & Double-Entry Ledger)
 * @route   POST /api/other-income
 * @access  Private (Data Entry, Admin, Admin Publisher)
 */
export const recordOtherIncome = async (req, res) => {
  try {
    const {
      receiptDate,
      voucherNumber,
      incomeHeadId,
      amount,
      receivingAccountId,
      propertyId,
      unitId,
      receivedFrom = '',
      referenceNumber = '',
      transactionDetail,
      description = '',
      status = 'POSTED',
      checkedBy,
      attachments = [],
    } = req.body;

    // 1. Mandatory Validations
    if (!transactionDetail || !transactionDetail.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Transaction detail is required.',
      });
    }

    const numericAmount = round2(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Receipt amount must be strictly greater than zero.',
      });
    }

    if (!incomeHeadId) {
      return res.status(400).json({
        success: false,
        message: 'Income Head (incomeHeadId) is required.',
      });
    }

    if (!receivingAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Receiving account (receivingAccountId) is required.',
      });
    }

    // 2. Validate Income Head
    const incomeHead = await OtherIncomeHead.findById(incomeHeadId);
    if (!incomeHead) {
      return res.status(404).json({
        success: false,
        message: 'Selected Other Income Head was not found.',
      });
    }
    if (!incomeHead.isActive) {
      return res.status(400).json({
        success: false,
        message: `Income Head "${incomeHead.name}" is inactive.`,
      });
    }

    // 3. Validate Receiving Account (must be active Bank or Cash account, not a clearing account)
    const receivingAccount = await Account.findById(receivingAccountId);
    if (!receivingAccount) {
      return res.status(404).json({
        success: false,
        message: 'Receiving account was not found.',
      });
    }
    if (!receivingAccount.isActive) {
      return res.status(400).json({
        success: false,
        message: `Receiving account "${receivingAccount.name}" is marked inactive.`,
      });
    }
    if (receivingAccount.isClearing) {
      return res.status(400).json({
        success: false,
        message: 'Clearing accounts cannot be used as receiving liquidity accounts.',
      });
    }

    // 4. Validate Property if provided
    let propertyDoc = null;
    if (propertyId) {
      propertyDoc = await Property.findById(propertyId);
      if (!propertyDoc) {
        return res.status(404).json({
          success: false,
          message: 'Specified property was not found.',
        });
      }
    }

    // 5. Duplicate Submission Protection (Backend Idempotency Lock)
    cleanupOldSubmissions();
    const cleanDateStr = receiptDate
      ? new Date(receiptDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const submissionKey = `${receivingAccountId}_${numericAmount}_${incomeHeadId}_${cleanDateStr}_${(receivedFrom || '').trim().toLowerCase()}`;

    if (recentSubmissions.has(submissionKey)) {
      return res.status(409).json({
        success: false,
        message: 'A duplicate Other Income receipt was recently submitted with the same account, amount, and payer. Please check the ledger before resubmitting.',
      });
    }
    recentSubmissions.set(submissionKey, Date.now());

    // 6. Generate Receipt & Voucher Numbers
    const validReceiptDate = receiptDate ? new Date(receiptDate) : new Date();
    const receiptNumber = await generateOtherIncomeReceiptNumber(validReceiptDate);

    let cleanVn = (voucherNumber || '').trim().toUpperCase();
    if (!cleanVn) {
      cleanVn = await suggestNextVoucherNumber();
    }

    // Check if voucher number is already used by a non-other-income voucher
    const existingVoucher = await Voucher.findOne({ voucherNumber: cleanVn });
    if (existingVoucher && existingVoucher.sourceModule !== 'OTHER_INCOME' && existingVoucher.sourceId) {
      // Pick next sequential
      cleanVn = await suggestNextVoucherNumber();
    }

    // 7. Ensure Category exists for this Income Head
    let category = await Category.findOne({ name: incomeHead.name });
    if (!category) {
      category = await Category.create({
        name: incomeHead.name,
        type: 'INCOME',
        isRentalHead: false,
      });
    }

    // 8. Financial Accounting Double-Entry
    // If status is POSTED, create transaction + voucher + update account balance
    let createdTransaction = null;
    let createdVoucherId = null;

    if (status === 'POSTED') {
      const clearingAccount = await getOrCreateOtherIncomeClearingAccount();

      const narration = transactionDetail.trim();

      createdTransaction = await createTransaction({
        date: validReceiptDate,
        voucherNo: cleanVn,
        detail: narration,
        categoryId: category._id,
        drAccountId: receivingAccount._id, // Debit Asset -> increases Bank/Cash balance
        crAccountId: clearingAccount._id,  // Credit Clearing / Revenue
        amount: numericAmount,
        propertyId: propertyId || null,
        unitId: unitId || null,
        transactionType: 'INCOME',
        reportCategory: 'Other Income',
        sourceModule: 'OTHER_INCOME',
        attachments,
        reference: referenceNumber || '',
        checkedBy: checkedBy || req.user?.name || 'Authorized Auditor',
        status: 'POSTED',
        createdBy: req.user?._id,
      });

      createdVoucherId = createdTransaction.voucherId;
    }

    // 9. Save Other Income Document
    const otherIncome = await OtherIncome.create({
      receiptNumber,
      receiptDate: validReceiptDate,
      incomeHeadId: incomeHead._id,
      headName: incomeHead.name,
      category: 'Other Income',
      amount: numericAmount,
      receivingAccountId: receivingAccount._id,
      propertyId: propertyId || null,
      unitId: unitId || null,
      receivedFrom: receivedFrom ? receivedFrom.trim() : '',
      referenceNumber: referenceNumber ? referenceNumber.trim() : '',
      transactionDetail: transactionDetail.trim(),
      description: description ? description.trim() : '',
      status: status === 'DRAFT' ? 'DRAFT' : 'POSTED',
      voucherId: createdVoucherId,
      voucherNo: cleanVn,
      transactionId: createdTransaction ? createdTransaction._id : null,
      checkedBy: checkedBy || req.user?.name || null,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
      attachments,
    });

    // Update Voucher sourceId if newly created
    if (createdVoucherId) {
      await Voucher.findByIdAndUpdate(createdVoucherId, {
        sourceId: otherIncome._id,
        sourceModule: 'OTHER_INCOME',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Other Income receipt recorded successfully with double-entry voucher',
      data: otherIncome,
    });
  } catch (error) {
    console.error('recordOtherIncome error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record Other Income',
      error: error.message,
    });
  }
};

/**
 * @desc    Get all Other Income records with filtering and pagination
 * @route   GET /api/other-income
 * @access  Private
 */
export const getAllOtherIncome = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      month,
      startDate,
      endDate,
      incomeHeadId,
      receivingAccountId,
      propertyId,
      status,
    } = req.query;

    const query = {};

    // Filter by Month (YYYY-MM)
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      const [year, m] = month.split('-').map(Number);
      const startOfMonth = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      query.receiptDate = { $gte: startOfMonth, $lte: endOfMonth };
    } else if (startDate || endDate) {
      query.receiptDate = {};
      if (startDate) query.receiptDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.receiptDate.$lte = end;
      }
    }

    if (incomeHeadId && mongoose.Types.ObjectId.isValid(incomeHeadId)) {
      query.incomeHeadId = incomeHeadId;
    }

    if (receivingAccountId && mongoose.Types.ObjectId.isValid(receivingAccountId)) {
      query.receivingAccountId = receivingAccountId;
    }

    if (propertyId) {
      if (propertyId === 'none') {
        query.propertyId = null;
      } else if (mongoose.Types.ObjectId.isValid(propertyId)) {
        query.propertyId = propertyId;
      }
    }

    if (status && status !== 'all') {
      query.status = status;
    } else if (!status) {
      // Default: exclude REVERSED and VOID from normal view
      query.status = { $in: ['POSTED', 'DRAFT'] };
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { receiptNumber: { $regex: s, $options: 'i' } },
        { voucherNo: { $regex: s, $options: 'i' } },
        { headName: { $regex: s, $options: 'i' } },
        { transactionDetail: { $regex: s, $options: 'i' } },
        { receivedFrom: { $regex: s, $options: 'i' } },
        { referenceNumber: { $regex: s, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [totalRecords, records, allFilteredDocs] = await Promise.all([
      OtherIncome.countDocuments(query),
      OtherIncome.find(query)
        .populate('incomeHeadId', 'name code description isActive')
        .populate('receivingAccountId', 'name type currentBalance bankName cashHolder')
        .populate('propertyId', 'plazaName location')
        .populate('voucherId', 'voucherNumber voucherDate voucherType totalAmount status')
        .populate('createdBy', 'name email role')
        .sort({ receiptDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OtherIncome.find(query, { amount: 1, status: 1 }).lean(),
    ]);

    // Exact summary computations
    let filteredTotal = 0;
    let postedTotal = 0;
    let postedCount = 0;
    let draftCount = 0;

    for (const r of allFilteredDocs) {
      const amt = round2(r.amount || 0);
      filteredTotal = round2(filteredTotal + amt);
      if (r.status === 'POSTED') {
        postedTotal = round2(postedTotal + amt);
        postedCount += 1;
      } else if (r.status === 'DRAFT') {
        draftCount += 1;
      }
    }

    res.status(200).json({
      success: true,
      count: records.length,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limitNum),
      currentPage: pageNum,
      summary: {
        filteredTotal,
        postedTotal,
        postedCount,
        draftCount,
      },
      data: records,
    });
  } catch (error) {
    console.error('getAllOtherIncome error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Other Income records',
      error: error.message,
    });
  }
};

/**
 * @desc    Get Other Income by ID
 * @route   GET /api/other-income/:id
 * @access  Private
 */
export const getOtherIncomeById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Other Income record ID.',
      });
    }

    const record = await OtherIncome.findById(id)
      .populate('incomeHeadId')
      .populate('receivingAccountId')
      .populate('propertyId')
      .populate('voucherId')
      .populate('transactionId')
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .populate('reversedBy', 'name email role')
      .lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Other Income record not found.',
      });
    }

    // Retrieve Dr / Cr account names if transaction exists
    let accountingEntry = null;
    if (record.transactionId) {
      const tx = await Transaction.findById(record.transactionId)
        .populate('drAccountId', 'name type')
        .populate('crAccountId', 'name type')
        .lean();
      if (tx) {
        accountingEntry = {
          drAccount: tx.drAccountId?.name || 'N/A',
          crAccount: tx.crAccountId?.name || 'N/A',
          amount: tx.amount,
          date: tx.date,
          voucherNo: tx.voucherNo,
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...record,
        accountingEntry,
      },
    });
  } catch (error) {
    console.error('getOtherIncomeById error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Other Income detail',
      error: error.message,
    });
  }
};

/**
 * @desc    Get Monthly Summary of Other Income & Total Income (Rental + Other)
 * @route   GET /api/other-income/monthly-summary
 * @access  Private
 */
export const getMonthlyOtherIncomeSummary = async (req, res) => {
  try {
    const { month } = req.query;
    let queryDate = {};

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      const [year, m] = month.split('-').map(Number);
      const startOfMonth = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      queryDate = { $gte: startOfMonth, $lte: endOfMonth };
    } else {
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
      queryDate = { $gte: startOfMonth, $lte: endOfMonth };
    }

    // 1. Total Other Income for the selected month (POSTED only)
    const otherIncomes = await OtherIncome.find({
      receiptDate: queryDate,
      status: 'POSTED',
    })
      .populate('incomeHeadId', 'name')
      .populate('receivingAccountId', 'name type')
      .populate('propertyId', 'plazaName')
      .lean();

    let totalOtherIncome = 0;
    const headMap = new Map();
    const accountMap = new Map();
    let propertyLinkedTotal = 0;
    let generalIncomeTotal = 0;

    for (const oi of otherIncomes) {
      const amt = round2(oi.amount || 0);
      totalOtherIncome = round2(totalOtherIncome + amt);

      // Group by Income Head
      const hName = oi.headName || oi.incomeHeadId?.name || 'Other Receipts';
      headMap.set(hName, round2((headMap.get(hName) || 0) + amt));

      // Group by Receiving Account
      const accName = oi.receivingAccountId?.name || 'Direct Bank/Cash';
      accountMap.set(accName, round2((accountMap.get(accName) || 0) + amt));

      // Property vs General
      if (oi.propertyId) {
        propertyLinkedTotal = round2(propertyLinkedTotal + amt);
      } else {
        generalIncomeTotal = round2(generalIncomeTotal + amt);
      }
    }

    // 2. Total Rental Income for the selected month — query Transactions (authoritative ledger)
    //    RentReceived documents may not always be present (cleanup, legacy data), but Transaction
    //    records with reportCategory 'Rent' are always created by the ledger service.
    let rentMonthStr = month;
    if (!rentMonthStr) {
      const now = new Date();
      rentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const [rentYear, rentMon] = rentMonthStr.split('-').map(Number);
    const rentStart = new Date(Date.UTC(rentYear, rentMon - 1, 1, 0, 0, 0));
    const rentEnd = new Date(Date.UTC(rentYear, rentMon, 0, 23, 59, 59, 999));

    const rentalTransactions = await Transaction.find({
      date: { $gte: rentStart, $lte: rentEnd },
      transactionType: 'INCOME',
      reportCategory: 'Rent',
    }).lean();

    let totalRentalIncome = 0;
    for (const r of rentalTransactions) {
      totalRentalIncome = round2(totalRentalIncome + (r.amount || 0));
    }

    // 3. True Total Income = Rental Income + Other Income (transfers excluded!)
    const totalIncome = round2(totalRentalIncome + totalOtherIncome);

    const headWiseBreakdown = Array.from(headMap.entries()).map(([head, amount]) => ({
      head,
      amount,
    }));

    const accountWiseBreakdown = Array.from(accountMap.entries()).map(([account, amount]) => ({
      account,
      amount,
    }));

    res.status(200).json({
      success: true,
      data: {
        month: rentMonthStr,
        totalOtherIncome,
        totalRentalIncome,
        totalIncome,
        receiptsCount: otherIncomes.length,
        propertyLinkedTotal,
        generalIncomeTotal,
        headWiseBreakdown,
        accountWiseBreakdown,
      },
    });
  } catch (error) {
    console.error('getMonthlyOtherIncomeSummary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate monthly Other Income summary',
      error: error.message,
    });
  }
};

/**
 * @desc    Reverse an Other Income receipt (Admin Only, Non-Destructive Soft Reversal)
 * @route   POST /api/other-income/:id/reverse
 * @access  Private (Admin Only)
 */
export const reverseOtherIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Reversed by Administrator' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Other Income record ID.',
      });
    }

    const otherIncome = await OtherIncome.findById(id);
    if (!otherIncome) {
      return res.status(404).json({
        success: false,
        message: 'Other Income record not found.',
      });
    }

    if (otherIncome.status === 'REVERSED') {
      return res.status(400).json({
        success: false,
        message: 'This Other Income receipt has already been reversed.',
      });
    }

    if (otherIncome.status === 'VOID') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reverse a voided record.',
      });
    }

    const numericAmount = round2(otherIncome.amount);

    // If was POSTED, restore receiving bank/cash balance and update transaction/voucher
    if (otherIncome.status === 'POSTED') {
      // 1. Deduct amount from receiving account (reverses original debit)
      await Account.findByIdAndUpdate(otherIncome.receivingAccountId, {
        $inc: { currentBalance: -numericAmount },
      });

      // 2. If clearing account exists on transaction, restore it
      if (otherIncome.transactionId) {
        const tx = await Transaction.findById(otherIncome.transactionId);
        if (tx && tx.crAccountId) {
          await Account.findByIdAndUpdate(tx.crAccountId, {
            $inc: { currentBalance: numericAmount },
          });
        }
        await Transaction.findByIdAndUpdate(otherIncome.transactionId, {
          status: 'REVERSED',
          detail: `[REVERSED] ${tx?.detail || otherIncome.transactionDetail}`,
        });
      }

      // 3. Mark Voucher as REVERSED
      if (otherIncome.voucherId) {
        await Voucher.findByIdAndUpdate(otherIncome.voucherId, {
          status: 'REVERSED',
          description: `[REVERSED] ${otherIncome.transactionDetail}`,
        });
      }
    }

    // 4. Soft mark OtherIncome as REVERSED
    otherIncome.status = 'REVERSED';
    otherIncome.reversalReason = reason.trim();
    otherIncome.reversedAt = new Date();
    otherIncome.reversedBy = req.user?._id;
    otherIncome.updatedBy = req.user?._id;
    await otherIncome.save();

    res.status(200).json({
      success: true,
      message: 'Other Income receipt successfully reversed and account balances restored.',
      data: otherIncome,
    });
  } catch (error) {
    console.error('reverseOtherIncome error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reverse Other Income receipt',
      error: error.message,
    });
  }
};
