import mongoose from 'mongoose';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import Property from '../models/Property.js';
import PendingEntry from '../models/PendingEntry.js';
import MonthlyReport from '../models/MonthlyReport.js';
import { round2 } from '../services/ledgerService.js';
import { getOrCreateCanonicalHead, provisionStandardCategories } from '../services/expenseClassificationService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * Recognized Cash Custodians in Pixx Technologies
 */
const KNOWN_CASH_CUSTODIANS = [
  'Majid Javed',
  'Sarfaraz Sb',
  'Sarfaraz',
  'Sabir Nawaz',
  'Malik Naveed',
];

/**
 * @desc    Get all accounts with search, type/status filter & liquidity summary
 * @route   GET /api/accounts
 * @access  Private (Authenticated)
 */
export const getAccounts = async (req, res) => {
  try {
    const { search, type, status, page = 1, limit = 50 } = req.query;
    const query = {};

    if (type) {
      query.type = type.toUpperCase();
    }

    if (status) {
      if (status === 'ACTIVE') query.isActive = true;
      if (status === 'INACTIVE') query.isActive = false;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: regex },
        { accountName: regex },
        { accountCode: regex },
        { bankName: regex },
        { cashHolder: regex },
        { ownerName: regex },
        { accountNumber: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await Account.countDocuments(query);
    const accounts = await Account.find(query)
      .sort({ type: 1, name: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Calculate portfolio liquidity totals from all active accounts
    const activeAccounts = await Account.find({ isActive: true }).lean();
    let totalCompanyLiquidity = 0;
    let bankTotal = 0;
    let cashTotal = 0;
    let bankCount = 0;
    let cashCount = 0;

    activeAccounts.forEach((acc) => {
      const bal = acc.currentBalance || 0;
      totalCompanyLiquidity += bal;
      if (acc.type === 'BANK') {
        bankTotal += bal;
        bankCount += 1;
      } else if (acc.type === 'CASH') {
        cashTotal += bal;
        cashCount += 1;
      }
    });

    const enrichedAccounts = accounts.map((acc) => {
      const isCustodian =
        acc.type === 'CASH' &&
        (acc.cashHolder ||
          KNOWN_CASH_CUSTODIANS.some((k) =>
            acc.name?.toLowerCase().includes(k.toLowerCase())
          ));

      return {
        ...acc,
        isCashCustodian: Boolean(isCustodian),
        holderName: acc.cashHolder || (acc.type === 'BANK' ? acc.ownerName : acc.name),
      };
    });

    const summary = {
      totalAccounts: totalCount,
      activeAccountsCount: activeAccounts.length,
      bankCount,
      cashCount,
      totalCompanyLiquidity: round2(totalCompanyLiquidity),
      bankTotal: round2(bankTotal),
      cashTotal: round2(cashTotal),
    };

    return apiSuccess(
      res,
      {
        accounts: enrichedAccounts,
        summary,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        },
      },
      `Found ${enrichedAccounts.length} accounts.`
    );
  } catch (error) {
    console.error('[Get Accounts Error]:', error);
    return apiError(res, 'Failed to fetch accounts.', 500);
  }
};

/**
 * @desc    Get single account details by ID
 * @route   GET /api/accounts/:id
 * @access  Private (Authenticated)
 */
export const getAccountById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid account ID.', 400);
    }

    const account = await Account.findById(id)
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .lean();

    if (!account) {
      return apiError(res, 'Account not found.', 404);
    }

    // Fetch recent 10 transactions for quick preview
    const recentTransactions = await Transaction.find({
      $or: [{ drAccountId: id }, { crAccountId: id }],
    })
      .sort({ date: -1, createdAt: -1 })
      .limit(10)
      .populate('drAccountId', 'name type')
      .populate('crAccountId', 'name type')
      .populate('categoryId', 'name type')
      .lean();

    return apiSuccess(
      res,
      {
        account,
        recentTransactions,
      },
      'Account details retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Account By ID Error]:', error);
    return apiError(res, 'Failed to fetch account details.', 500);
  }
};

/**
 * @desc    Create a new Bank or Cash Account (Admin only)
 * @route   POST /api/accounts
 * @access  Private (Admin)
 */
export const createAccount = async (req, res) => {
  try {
    const {
      name,
      accountName,
      accountCode,
      type,
      accountType,
      ownerName,
      bankName,
      cashHolder,
      accountNumber,
      iban,
      branch,
      openingBalance = 0,
      openingBalanceDate,
      notes,
    } = req.body;

    const effName = (accountName || name).trim();
    const effType = (accountType || type || 'BANK').toUpperCase();

    // Check name collision
    const existingName = await Account.findOne({
      $or: [{ name: effName }, { accountName: effName }],
    });
    if (existingName) {
      return apiError(res, `An account with name '${effName}' already exists.`, 409, {
        accountName: 'Account name must be unique.',
      });
    }

    // Check code collision if provided
    if (accountCode && accountCode.trim()) {
      const existingCode = await Account.findOne({
        accountCode: accountCode.trim().toUpperCase(),
      });
      if (existingCode) {
        return apiError(res, `Account code '${accountCode}' is already in use.`, 409, {
          accountCode: 'Account code must be unique.',
        });
      }
    }

    const numOpening = round2(openingBalance);

    const newAccount = await Account.create({
      name: effName,
      accountName: effName,
      accountCode: accountCode ? accountCode.trim().toUpperCase() : undefined,
      type: effType,
      accountType: effType,
      ownerName: ownerName?.trim() || '',
      bankName: effType === 'BANK' ? bankName?.trim() || effName : '',
      cashHolder: effType === 'CASH' ? cashHolder?.trim() || effName : '',
      accountNumber: accountNumber?.trim() || '',
      iban: iban?.trim() || '',
      branch: branch?.trim() || '',
      openingBalance: numOpening,
      openingBalanceDate: openingBalanceDate
        ? new Date(openingBalanceDate)
        : new Date('2026-07-31T00:00:00.000Z'),
      currentBalance: numOpening,
      isActive: true,
      notes: notes?.trim() || '',
      createdBy: req.user._id,
    });

    return apiSuccess(
      res,
      newAccount,
      `Account '${newAccount.name}' created successfully.`,
      201
    );
  } catch (error) {
    console.error('[Create Account Error]:', error);
    return apiError(res, error.message || 'Failed to create account.', 500);
  }
};

/**
 * @desc    Update account details (Admin only)
 * @route   PUT /api/accounts/:id
 * @access  Private (Admin)
 */
export const updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid account ID.', 400);
    }

    const account = await Account.findById(id);
    if (!account) {
      return apiError(res, 'Account not found.', 404);
    }

    const {
      name,
      accountName,
      accountCode,
      ownerName,
      bankName,
      cashHolder,
      accountNumber,
      iban,
      branch,
      notes,
    } = req.body;

    const effName = (accountName || name || account.name).trim();

    // Check name collision if name changed
    if (effName !== account.name && effName !== account.accountName) {
      const duplicate = await Account.findOne({
        _id: { $ne: id },
        $or: [{ name: effName }, { accountName: effName }],
      });
      if (duplicate) {
        return apiError(res, `Another account with name '${effName}' already exists.`, 409, {
          accountName: 'Account name must be unique.',
        });
      }
    }

    // Check code collision if code changed
    if (accountCode && accountCode.trim().toUpperCase() !== account.accountCode) {
      const duplicateCode = await Account.findOne({
        _id: { $ne: id },
        accountCode: accountCode.trim().toUpperCase(),
      });
      if (duplicateCode) {
        return apiError(res, `Account code '${accountCode}' is already in use.`, 409, {
          accountCode: 'Account code must be unique.',
        });
      }
      account.accountCode = accountCode.trim().toUpperCase();
    }

    account.name = effName;
    account.accountName = effName;
    if (ownerName !== undefined) account.ownerName = ownerName.trim();
    if (bankName !== undefined) account.bankName = bankName.trim();
    if (cashHolder !== undefined) account.cashHolder = cashHolder.trim();
    if (accountNumber !== undefined) account.accountNumber = accountNumber.trim();
    if (iban !== undefined) account.iban = iban.trim();
    if (branch !== undefined) account.branch = branch.trim();
    if (notes !== undefined) account.notes = notes.trim();
    account.updatedBy = req.user._id;

    await account.save();

    return apiSuccess(res, account, `Account '${account.name}' updated successfully.`);
  } catch (error) {
    console.error('[Update Account Error]:', error);
    return apiError(res, error.message || 'Failed to update account.', 500);
  }
};

/**
 * @desc    Toggle account active status (Admin only - soft deactivation)
 * @route   PATCH /api/accounts/:id/status
 * @access  Private (Admin)
 */
export const toggleAccountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid account ID.', 400);
    }

    const account = await Account.findById(id);
    if (!account) {
      return apiError(res, 'Account not found.', 404);
    }

    account.isActive = !account.isActive;
    account.updatedBy = req.user._id;
    await account.save();

    return apiSuccess(
      res,
      {
        id: account._id,
        name: account.name,
        isActive: account.isActive,
      },
      `Account '${account.name}' has been ${account.isActive ? 'activated' : 'deactivated'}.`
    );
  } catch (error) {
    console.error('[Toggle Account Status Error]:', error);
    return apiError(res, 'Failed to toggle account status.', 500);
  }
};

/**
 * @desc    Get account running balance ledger with date/month filtering
 * @route   GET /api/accounts/:id/ledger
 * @access  Private (Authenticated)
 */
export const getAccountLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { month, startDate, endDate, search } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid account ID.', 400);
    }

    const account = await Account.findById(id).lean();
    if (!account) {
      return apiError(res, 'Account not found.', 404);
    }

    let periodStart = null;
    let periodEnd = null;

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())) {
      const [y, m] = month.trim().split('-').map(Number);
      periodStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      periodEnd = new Date(Date.UTC(y, m - 1, days, 23, 59, 59, 999));
    } else if (startDate || endDate) {
      if (startDate) periodStart = new Date(startDate);
      if (endDate) {
        periodEnd = new Date(endDate);
        periodEnd.setUTCHours(23, 59, 59, 999);
      }
    }

    // 1. Calculate Opening Balance as of periodStart:
    // Base opening balance is account.openingBalance (at openingBalanceDate)
    let openingBalance = account.openingBalance || 0;

    if (periodStart) {
      // Find all transactions between openingBalanceDate and periodStart
      const priorTxFilter = {
        $or: [{ drAccountId: id }, { crAccountId: id }],
        date: { $lt: periodStart },
      };

      const priorTransactions = await Transaction.find(priorTxFilter)
        .select('drAccountId crAccountId amount')
        .lean();

      priorTransactions.forEach((tx) => {
        if (tx.drAccountId?.toString() === id.toString()) {
          openingBalance += tx.amount; // Money In
        }
        if (tx.crAccountId?.toString() === id.toString()) {
          openingBalance -= tx.amount; // Money Out
        }
      });
    }

    openingBalance = round2(openingBalance);

    // 2. Fetch transactions in the period
    const txQuery = {
      $or: [{ drAccountId: id }, { crAccountId: id }],
    };

    if (periodStart && periodEnd) {
      txQuery.date = { $gte: periodStart, $lte: periodEnd };
    } else if (periodStart) {
      txQuery.date = { $gte: periodStart };
    } else if (periodEnd) {
      txQuery.date = { $lte: periodEnd };
    }

    if (search && search.trim()) {
      const sRegex = new RegExp(search.trim(), 'i');
      txQuery.$and = txQuery.$and || [];
      txQuery.$and.push({
        $or: [{ voucherNo: sRegex }, { detail: sRegex }],
      });
    }

    // Sort deterministically: Date ASC, createdAt ASC, _id ASC
    const transactions = await Transaction.find(txQuery)
      .sort({ date: 1, createdAt: 1, _id: 1 })
      .populate('drAccountId', 'name type')
      .populate('crAccountId', 'name type')
      .populate('categoryId', 'name type isRentalHead')
      .lean();

    // 3. Compute running balance sequentially
    let runningBalance = openingBalance;
    let totalMoneyIn = 0;
    let totalMoneyOut = 0;

    const ledgerEntries = transactions.map((tx) => {
      const isDr = tx.drAccountId?._id?.toString() === id.toString();
      const isCr = tx.crAccountId?._id?.toString() === id.toString();

      const debit = isDr ? tx.amount : 0;
      const credit = isCr ? tx.amount : 0;

      runningBalance = round2(runningBalance + debit - credit);
      totalMoneyIn += debit;
      totalMoneyOut += credit;

      return {
        _id: tx._id,
        date: tx.date,
        voucherNo: tx.voucherNo,
        detail: tx.detail,
        transactionType: tx.transactionType,
        drAccount: tx.drAccountId?.name || 'Account',
        crAccount: tx.crAccountId?.name || 'Account',
        categoryName: tx.categoryId?.name || 'General',
        debit: round2(debit),
        credit: round2(credit),
        balance: round2(runningBalance),
        status: tx.status,
      };
    });

    const summary = {
      openingBalance: round2(openingBalance),
      totalMoneyIn: round2(totalMoneyIn),
      totalMoneyOut: round2(totalMoneyOut),
      closingBalance: round2(runningBalance),
      currentBalance: round2(account.currentBalance),
      transactionCount: ledgerEntries.length,
      filteredPeriod: month || 'ALL',
    };

    return apiSuccess(
      res,
      {
        account,
        ledgerEntries,
        summary,
      },
      `Account ledger retrieved with ${ledgerEntries.length} entries.`
    );
  } catch (error) {
    console.error('[Get Account Ledger Error]:', error);
    return apiError(res, 'Failed to fetch account ledger.', 500);
  }
};

/**
 * @desc    Get monthly opening, money in, money out, and closing balances for all accounts
 * @route   GET /api/accounts/monthly-summary
 * @access  Private (Authenticated)
 */
export const getMonthlySummary = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())) {
      return apiError(res, 'Month must be in YYYY-MM format (e.g. 2026-08).', 400);
    }

    const [y, m] = month.trim().split('-').map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = new Date(Date.UTC(y, m - 1, days, 23, 59, 59, 999));

    const accounts = await Account.find({ isActive: true })
      .sort({ type: 1, name: 1 })
      .lean();

    // Fetch prior and monthly transactions
    const [priorTxs, monthlyTxs] = await Promise.all([
      Transaction.find({ date: { $lt: monthStart } })
        .select('drAccountId crAccountId amount')
        .lean(),
      Transaction.find({ date: { $gte: monthStart, $lte: monthEnd } })
        .select('drAccountId crAccountId amount')
        .lean(),
    ]);

    // Compute metrics per account
    let totalOpening = 0;
    let totalMoneyIn = 0;
    let totalMoneyOut = 0;
    let totalClosing = 0;

    let bankTotalClosing = 0;
    let cashTotalClosing = 0;

    const accountRows = accounts.map((acc) => {
      const accIdStr = acc._id.toString();

      // Opening balance at monthStart
      let opening = acc.openingBalance || 0;
      priorTxs.forEach((tx) => {
        if (tx.drAccountId?.toString() === accIdStr) opening += tx.amount;
        if (tx.crAccountId?.toString() === accIdStr) opening -= tx.amount;
      });
      opening = round2(opening);

      // Monthly inflows & outflows
      let moneyIn = 0;
      let moneyOut = 0;
      monthlyTxs.forEach((tx) => {
        if (tx.drAccountId?.toString() === accIdStr) moneyIn += tx.amount;
        if (tx.crAccountId?.toString() === accIdStr) moneyOut += tx.amount;
      });
      moneyIn = round2(moneyIn);
      moneyOut = round2(moneyOut);

      const closing = round2(opening + moneyIn - moneyOut);

      totalOpening += opening;
      totalMoneyIn += moneyIn;
      totalMoneyOut += moneyOut;
      totalClosing += closing;

      if (acc.type === 'BANK') bankTotalClosing += closing;
      if (acc.type === 'CASH') cashTotalClosing += closing;

      return {
        _id: acc._id,
        name: acc.name,
        accountCode: acc.accountCode,
        type: acc.type,
        cashHolder: acc.cashHolder || (acc.type === 'CASH' ? acc.name : ''),
        bankName: acc.bankName || (acc.type === 'BANK' ? acc.name : ''),
        openingBalance: opening,
        moneyIn,
        moneyOut,
        closingBalance: closing,
      };
    });

    const summary = {
      month,
      totalCompanyFunds: round2(totalClosing),
      bankTotalClosing: round2(bankTotalClosing),
      cashTotalClosing: round2(cashTotalClosing),
      totalAccounts: accounts.length,
    };

    return apiSuccess(
      res,
      {
        month,
        accounts: accountRows,
        summary,
      },
      `Monthly summary calculated for ${month}.`
    );
  } catch (error) {
    console.error('[Get Monthly Summary Error]:', error);
    return apiError(res, 'Failed to calculate monthly summary.', 500);
  }
};

/**
 * Legacy support: Get active accounts summary
 */
export const getActiveAccountsSummary = async (req, res) => {
  try {
    const accounts = await Account.find({ isActive: true })
      .sort({ type: 1, name: 1 })
      .lean();

    const categorized = accounts.map((acc) => {
      const isCash = acc.type === 'CASH';
      const isCustodian =
        isCash &&
        KNOWN_CASH_CUSTODIANS.some((name) =>
          acc.name.toLowerCase().includes(name.toLowerCase())
        );

      let balanceStatus = 'HEALTHY';
      if (acc.currentBalance < 0) {
        balanceStatus = 'NEGATIVE';
      } else if (acc.currentBalance < 2000) {
        balanceStatus = 'LOW';
      }

      return {
        _id: acc._id,
        name: acc.name,
        type: acc.type,
        accountNumber: acc.accountNumber,
        iban: acc.iban,
        branch: acc.branch,
        openingBalance: round2(acc.openingBalance),
        currentBalance: round2(acc.currentBalance),
        isCashCustodian: isCustodian,
        balanceStatus,
      };
    });

    const bankAccounts = categorized.filter((a) => a.type === 'BANK');
    const cashCustodians = categorized.filter((a) => a.isCashCustodian);
    const otherAccounts = categorized.filter(
      (a) => a.type === 'CASH' && !a.isCashCustodian
    );

    return res.status(200).json({
      success: true,
      totalAccounts: categorized.length,
      accounts: categorized,
      grouped: {
        banks: bankAccounts,
        custodians: cashCustodians,
        other: otherAccounts,
      },
    });
  } catch (error) {
    console.error('Error in getActiveAccountsSummary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve accounts summary.',
      error: error.message,
    });
  }
};

/**
 * Get list of all active categories (Heads) with property details
 */
export const getCategories = async (req, res) => {
  try {
    const { type, expenseClassification, propertyId, unitId } = req.query;
    
    // Auto-provision standard categories if any are missing
    await provisionStandardCategories();

    const filter = {};

    if (type) {
      filter.type = type.toUpperCase();
    }
    if (expenseClassification) {
      filter.expenseClassification = expenseClassification;
    }
    if (propertyId) {
      filter.propertyId = propertyId;
    }
    if (unitId) {
      filter.unitId = unitId;
    }

    const categories = await Category.find(filter)
      .populate('propertyId', 'plazaName propertyName')
      .sort({ type: 1, name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve categories.',
      error: error.message,
    });
  }
};

/**
 * Create or retrieve the single canonical expense account head for voucher entry with optional property/unit scoping.
 * The typed name is the expense head (for example, Electricity Bill).
 * Property/unit selections only define the scope of that head.
 */
export const createCategory = async (req, res) => {
  try {
    const rawName = (req.body.name || '').trim();
    const propertyId = req.body.propertyId && mongoose.Types.ObjectId.isValid(req.body.propertyId) ? req.body.propertyId : null;
    const unitId = req.body.unitId && mongoose.Types.ObjectId.isValid(req.body.unitId) ? req.body.unitId : null;
    let expenseClassification = req.body.expenseClassification;

    if (unitId) {
      expenseClassification = 'UNIT_EXPENSE';
    } else if (propertyId) {
      expenseClassification = 'PROPERTY_OWN_EXPENSE';
    } else {
      expenseClassification = 'GENERAL_EXPENSE';
    }

    if (!rawName) {
      return apiError(res, 'Expense name is required (for example, Electricity Bill or Maintenance).', 400);
    }

    const queryFilter = {
      type: 'EXPENSE',
      name: { $regex: `^${rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      expenseClassification,
      propertyId,
      unitId,
    };

    let category = await Category.findOne(queryFilter);
    if (!category) {
      category = await Category.create({
        name: rawName,
        type: 'EXPENSE',
        expenseClassification,
        propertyId,
        unitId,
        isRentalHead: !!req.body.isRentalHead,
      });
    }

    let populatedCat = category;
    if (propertyId) {
      populatedCat = await Category.findById(category._id).populate('propertyId', 'plazaName propertyName').lean();
    }

    return apiSuccess(res, { category: populatedCat || category }, `Expense head '${category.name}' ready.`, 200);
  } catch (error) {
    if (error.code === 11000 || (error.message && error.message.includes('E11000'))) {
      try {
        await Category.collection.dropIndex('name_1');
      } catch (dropErr) {
        // ignore drop error if already dropped
      }

      try {
        const rawName = (req.body.name || '').trim();
        const propertyId = req.body.propertyId && mongoose.Types.ObjectId.isValid(req.body.propertyId) ? req.body.propertyId : null;
        const unitId = req.body.unitId && mongoose.Types.ObjectId.isValid(req.body.unitId) ? req.body.unitId : null;
        let expenseClassification = req.body.expenseClassification;

        if (unitId) {
          expenseClassification = 'UNIT_EXPENSE';
        } else if (propertyId) {
          expenseClassification = 'PROPERTY_OWN_EXPENSE';
        } else {
          expenseClassification = 'GENERAL_EXPENSE';
        }

        let existing = await Category.findOne({
          type: 'EXPENSE',
          name: { $regex: `^${rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
          expenseClassification,
          propertyId,
          unitId,
        });

        if (!existing) {
          existing = await Category.create({
            name: rawName,
            type: 'EXPENSE',
            expenseClassification,
            propertyId,
            unitId,
            isRentalHead: !!req.body.isRentalHead,
          });
        }

        let populatedCat = existing;
        if (propertyId) {
          populatedCat = await Category.findById(existing._id).populate('propertyId', 'plazaName propertyName').lean();
        }

        return apiSuccess(res, { category: populatedCat || existing }, `Expense head '${existing.name}' ready.`, 200);
      } catch (retryErr) {
        console.error('[Create Category Retry Error]:', retryErr);
        return apiError(res, retryErr.message || 'Failed to resolve expense head.', 500);
      }
    }

    console.error('[Create Category Error]:', error);
    return apiError(res, error.message || 'Failed to resolve expense head.', 500);
  }
};

/**
 * Legacy support: Get list of all properties
 */
export const getProperties = async (req, res) => {
  try {
    const properties = await Property.find({}).sort({ plazaName: 1 }).lean();
    return res.status(200).json({
      success: true,
      count: properties.length,
      properties,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve properties list.',
      error: error.message,
    });
  }
};

/**
 * Delete a single expense head (category) by ID, along with any linked transactions
 * and pending entries, reversing account balance effects to ensure double-entry precision.
 */
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid expense head ID.', 400);
    }

    const category = await Category.findById(id);
    if (!category) {
      return apiError(res, 'Expense head not found.', 404);
    }

    // Fetch all linked posted transactions and pending entries
    const [transactions, pendingEntries] = await Promise.all([
      Transaction.find({ categoryId: id }),
      PendingEntry.find({ categoryId: id }),
    ]);

    // Check if any transaction is in a published/locked month
    for (const tx of transactions) {
      const txDate = tx.date ? new Date(tx.date) : new Date();
      const txMonth = `${txDate.getUTCFullYear()}-${String(txDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const isLocked = await MonthlyReport.findOne({ month: txMonth, status: 'PUBLISHED' }).lean();
      if (isLocked) {
        return apiError(
          res,
          `Financial period ${txMonth} is officially PUBLISHED and locked. Linked voucher #${tx.voucherNo} cannot be deleted.`,
          403
        );
      }
    }

    // Reverse financial effects for all posted transactions
    for (const tx of transactions) {
      const amt = round2(tx.amount || 0);
      if (tx.drAccountId && tx.crAccountId && amt > 0) {
        await Promise.all([
          Account.findByIdAndUpdate(tx.drAccountId, { $inc: { currentBalance: -amt } }),
          Account.findByIdAndUpdate(tx.crAccountId, { $inc: { currentBalance: amt } }),
        ]);
      }
    }

    // Delete all linked transactions & pending entries
    const [deletedTxRes, deletedPendingRes] = await Promise.all([
      Transaction.deleteMany({ categoryId: id }),
      PendingEntry.deleteMany({ categoryId: id }),
    ]);

    // Delete the Category itself
    await Category.findByIdAndDelete(id);

    const totalCleaned = (deletedTxRes.deletedCount || 0) + (deletedPendingRes.deletedCount || 0);
    const detailMsg = totalCleaned > 0
      ? `Expense head '${category.name}' and ${totalCleaned} linked transaction(s) deleted. Account balances updated.`
      : `Expense head '${category.name}' deleted successfully.`;

    return apiSuccess(res, { id, totalCleaned }, detailMsg);
  } catch (error) {
    console.error('[Delete Category Error]:', error);
    return apiError(res, 'Failed to delete expense head.', 500);
  }
};

export default {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  toggleAccountStatus,
  getAccountLedger,
  getMonthlySummary,
  getActiveAccountsSummary,
  getCategories,
  createCategory,
  deleteCategory,
  getProperties,
};
