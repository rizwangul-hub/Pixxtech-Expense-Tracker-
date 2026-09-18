import mongoose from 'mongoose';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import Property from '../models/Property.js';
import Voucher from '../models/Voucher.js';
import MonthlyReport from '../models/MonthlyReport.js';
import {
  validateExpenseClassification,
  validateExpenseCategory,
} from './expenseClassificationService.js';

/**
 * Helper to round numbers to 2 decimal places (standard financial precision)
 */
export const round2 = (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100;

/**
 * Create a double-entry voucher transaction and update account balances atomically.
 *
 * @param {Object} data - Transaction payload
 * @param {Date|string} data.date - Voucher date
 * @param {string} data.voucherNo - Voucher Number
 * @param {string} data.detail - Description
 * @param {string|mongoose.Types.ObjectId} data.categoryId - Account Head
 * @param {string|mongoose.Types.ObjectId} data.drAccountId - Receiving / Debited Account
 * @param {string|mongoose.Types.ObjectId} data.crAccountId - Disbursing / Credited Account
 * @param {number} data.amount - Amount in PKR
 * @param {string|mongoose.Types.ObjectId} [data.propertyId] - Optional linked property
 * @param {string|mongoose.Types.ObjectId} [data.unitId] - Optional linked unit
 * @param {string} [data.rentMonth] - Optional rent billing month (YYYY-MM)
 * @param {string} [data.checkedBy] - Checked by personnel
 * @param {string} [data.status] - 'PENDING' | 'VERIFIED'
 * @param {string|mongoose.Types.ObjectId} [data.createdBy] - Creator user ID
 * @param {mongoose.ClientSession} [externalSession] - Optional existing MongoDB session
 * @returns {Promise<Transaction>} - The created transaction document
 */
export const createTransaction = async (data, externalSession = null) => {
  const { drAccountId, crAccountId, amount } = data;

  if (!drAccountId || !crAccountId) {
    throw new Error('Both Debit (drAccountId) and Credit (crAccountId) accounts are required.');
  }

  if (drAccountId.toString() === crAccountId.toString()) {
    throw new Error('Debit and Credit accounts cannot be identical in a double-entry transaction.');
  }

  const numericAmount = round2(amount);
  if (numericAmount <= 0) {
    throw new Error('Transaction amount must be strictly greater than 0.');
  }

  // Part 27: Published Report Lock Check
  const txDate = data.date ? new Date(data.date) : new Date();
  const txMonth = `${txDate.getUTCFullYear()}-${String(txDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const isLocked = await MonthlyReport.findOne({ month: txMonth, status: 'PUBLISHED' }).lean();
  if (isLocked) {
    throw new Error(`Financial period ${txMonth} is officially PUBLISHED and locked. New entries or modifications are prohibited.`);
  }

  const executeAtomicOperation = async (session) => {
    const classification = (data.transactionType === 'EXPENSE'
      || (!data.transactionType && data.sourceModule === 'EXPENSE'))
      ? await validateExpenseClassification({
          expenseClassification: data.expenseClassification,
          propertyId: data.propertyId,
          unitId: data.unitId,
          session,
        })
      : {
          expenseClassification: null,
          propertyId: data.propertyId || null,
          unitId: data.unitId || null,
        };
    if (data.transactionType === 'EXPENSE') {
        await validateExpenseCategory({
          categoryId: data.categoryId,
          expenseClassification: classification.expenseClassification,
          propertyId: classification.propertyId,
          unitId: classification.unitId,
        });
    }
    // 1. Validate existence and active status of both accounts
    const [drAccount, crAccount] = await Promise.all([
      Account.findById(drAccountId).session(session || null),
      Account.findById(crAccountId).session(session || null),
    ]);

    if (!drAccount) throw new Error(`Debit Account not found with ID: ${drAccountId}`);
    if (!crAccount) throw new Error(`Credit Account not found with ID: ${crAccountId}`);
    if (!drAccount.isActive) throw new Error(`Debit Account "${drAccount.name}" is marked inactive.`);
    if (!crAccount.isActive) throw new Error(`Credit Account "${crAccount.name}" is marked inactive.`);

    // 2. Validate category exists
    const categoryDoc = await Category.findById(data.categoryId).session(session || null);
    if (!categoryDoc) throw new Error(`Category not found with ID: ${data.categoryId}`);

    // Determine report category
    let repCategory = data.reportCategory;
    if (!repCategory) {
      if (data.transactionType === 'EXPENSE') repCategory = 'Payments';
      else if (data.transactionType === 'INCOME') {
        repCategory = categoryDoc?.isRentalHead || data.rentMonth ? 'Rent' : 'Other Income';
      } else if (data.transactionType === 'TRANSFER') repCategory = 'Transfer';
      else if (data.transactionType === 'OPENING_BALANCE') repCategory = 'Opening Balance';
      else repCategory = 'Payments';
    }

    // Determine source module
    let srcModule = data.sourceModule;
    if (!srcModule) {
      if (data.transactionType === 'INCOME') {
        srcModule = repCategory === 'Rent' ? 'RENT_RECEIVED' : 'OTHER_INCOME';
      } else if (data.transactionType === 'TRANSFER') srcModule = 'TRANSFER';
      else if (data.transactionType === 'OPENING_BALANCE') srcModule = 'OPENING_BALANCE';
      else if (data.transactionType === 'EXPENSE') srcModule = 'EXPENSE';
      else srcModule = 'MANUAL_VOUCHER';
    }

    // 2b. Synchronize with Central Voucher Header
    let voucherId = data.voucherId || null;
    const cleanVn = (data.voucherNo || '').trim().toUpperCase();
    if (!voucherId && cleanVn) {
      let existingVoucher = await Voucher.findOne({ voucherNumber: cleanVn }).session(session || null);
      if (!existingVoucher) {
        let vType = 'EXPENSE';
        if (data.transactionType === 'INCOME') {
          vType = (srcModule === 'OTHER_INCOME' || repCategory === 'Other Income') ? 'OTHER_INCOME' : 'RENT_RECEIPT';
        } else if (data.transactionType === 'TRANSFER') vType = 'TRANSFER';
        else if (data.transactionType === 'OPENING_BALANCE') vType = 'OPENING_BALANCE';
        else if (data.transactionType === 'ADJUSTMENT') vType = 'ADJUSTMENT';

        const [createdVoucher] = await Voucher.create(
          [
            {
              voucherNumber: cleanVn,
              voucherDate: data.date ? new Date(data.date) : new Date(),
              voucherType: vType,
              reference: data.reference || '',
              description: data.detail ? data.detail.trim() : `Voucher ${cleanVn}`,
              status: data.status === 'VERIFIED' ? 'POSTED' : (data.status || 'POSTED'),
              totalAmount: numericAmount,
              totalDebit: numericAmount,
              totalCredit: numericAmount,
              isBalanced: true,
              linesCount: 1,
              sourceModule: srcModule,
              sourceId: data.sourceId || null,
              checkedBy: data.checkedBy || null,
              createdBy: data.createdBy || null,
            },
          ],
          session ? { session } : {}
        );
        voucherId = createdVoucher._id;
      } else {
        existingVoucher.totalAmount = round2(existingVoucher.totalAmount + numericAmount);
        existingVoucher.totalDebit = round2(existingVoucher.totalDebit + numericAmount);
        existingVoucher.totalCredit = round2(existingVoucher.totalCredit + numericAmount);
        existingVoucher.linesCount = (existingVoucher.linesCount || 1) + 1;
        await existingVoucher.save({ session: session || null });
        voucherId = existingVoucher._id;
      }
    }

    // 3. Create the Transaction record
    const [newTransaction] = await Transaction.create(
      [
        {
          ...data,
          ...classification,
          voucherId,
          reportCategory: repCategory,
          sourceModule: srcModule,
          amount: numericAmount,
          status: data.status || 'POSTED',
        },
      ],
      session ? { session } : {}
    );

    // 4. Double-entry accounting balance updates:
    // For Asset accounts (Bank / Cash):
    // Debit (Dr) increases asset balance (+amount)
    // Credit (Cr) decreases asset balance (-amount)
    await Promise.all([
      Account.findByIdAndUpdate(
        drAccountId,
        { $inc: { currentBalance: numericAmount } },
        { new: true, session: session || null }
      ),
      Account.findByIdAndUpdate(
        crAccountId,
        { $inc: { currentBalance: -numericAmount } },
        { new: true, session: session || null }
      ),
    ]);

    return newTransaction;
  };

  if (externalSession) {
    return await executeAtomicOperation(externalSession);
  }

  // Attempt using a managed MongoDB session if replica set is active
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await executeAtomicOperation(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        // Suppress abort errors if session was not started
      }
    }
    // Safe fallback: execute atomic operations directly without session
    try {
      return await executeAtomicOperation(null);
    } catch (fallbackError) {
      throw fallbackError;
    }
  } finally {
    if (session) {
      try {
        session.endSession();
      } catch {
        // Suppress cleanup error
      }
    }
  }
};

/**
 * Generates an itemized chronological running ledger for a specific Account.
 *
 * @param {string|mongoose.Types.ObjectId} accountId - Target Account ID
 * @param {Date|string} [startDate] - Start date filter (inclusive)
 * @param {Date|string} [endDate] - End date filter (inclusive)
 * @returns {Promise<Object>} - Account running ledger statement with opening & closing balances
 */
export const getAccountRunningLedger = async (accountId, startDate = null, endDate = null) => {
  const account = await Account.findById(accountId).lean();
  if (!account) {
    throw new Error(`Account not found with ID: ${accountId}`);
  }

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);

  // 1. Calculate historical previous balance prior to startDate
  let previousBalance = round2(account.openingBalance);

  if (start) {
    const priorTransactions = await Transaction.find({
      date: { $lt: start },
      $or: [{ drAccountId: accountId }, { crAccountId: accountId }],
      status: { $ne: 'REVERSED' },
    }).lean();

    for (const tx of priorTransactions) {
      const isDr = tx.drAccountId.toString() === accountId.toString();
      const isCr = tx.crAccountId.toString() === accountId.toString();

      if (isDr) previousBalance += tx.amount;
      if (isCr) previousBalance -= tx.amount;
    }
    previousBalance = round2(previousBalance);
  }

  // 2. Query transactions within the date window
  const query = {
    $or: [{ drAccountId: accountId }, { crAccountId: accountId }],
  };

  if (start && end) {
    query.date = { $gte: start, $lte: end };
  } else if (start) {
    query.date = { $gte: start };
  } else if (end) {
    query.date = { $lte: end };
  }

  const transactions = await Transaction.find(query)
    .populate('categoryId', 'name type isRentalHead')
    .populate('propertyId', 'plazaName')
    .populate('drAccountId', 'name type')
    .populate('crAccountId', 'name type')
    .sort({ date: 1, createdAt: 1 })
    .lean();

  // 3. Compute dynamic running balance row by row
  let currentRunning = previousBalance;
  let totalDebits = 0;
  let totalCredits = 0;

  const entries = transactions.map((tx) => {
    const isDr = tx.drAccountId?._id?.toString() === accountId.toString();
    const isCr = tx.crAccountId?._id?.toString() === accountId.toString();

    let drAmount = 0;
    let crAmount = 0;

    if (isDr) {
      drAmount = round2(tx.amount);
      totalDebits += drAmount;
      currentRunning += drAmount;
    }

    if (isCr) {
      crAmount = round2(tx.amount);
      totalCredits += crAmount;
      currentRunning -= crAmount;
    }

    currentRunning = round2(currentRunning);

    return {
      _id: tx._id,
      date: tx.date,
      voucherNo: tx.voucherNo,
      detail: tx.detail,
      category: tx.categoryId?.name || 'Uncategorized',
      property: tx.propertyId?.plazaName || null,
      counterpartyAccount: isDr ? tx.crAccountId?.name : tx.drAccountId?.name,
      drAmount,
      crAmount,
      runningBalance: currentRunning,
      status: tx.status,
      checkedBy: tx.checkedBy,
    };
  });

  return {
    account: {
      _id: account._id,
      name: account.name,
      type: account.type,
      accountNumber: account.accountNumber,
      openingBalance: round2(account.openingBalance),
      currentBalance: round2(account.currentBalance),
    },
    filter: {
      startDate: start ? start.toISOString().split('T')[0] : null,
      endDate: end ? end.toISOString().split('T')[0] : null,
    },
    previousBalance: round2(previousBalance),
    totalDebits: round2(totalDebits),
    totalCredits: round2(totalCredits),
    closingBalance: round2(currentRunning),
    entries,
  };
};

/**
 * Calculates the exact Cash & Bank monthly summary table matrix.
 * Satisfies: Closing Balance = Opening Balance + Total Input - Total Output
 *
 * @param {number} year - Full year (e.g. 2026)
 * @param {number} month - 1-indexed month (1 = Jan, 8 = August)
 * @returns {Promise<Object>} - Matrix rows for each account and a grand total row
 */
export const getMonthlyOpeningClosingMatrix = async (year, month) => {
  if (typeof year === 'string' && year.includes('-')) {
    const [y, m] = year.split('-').map(Number);
    year = y;
    month = m;
  }
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Get all active bank and cash accounts (excluding internal clearing accounts)
  const accounts = await Account.find({ isActive: true, isClearing: { $ne: true } })
    .sort({ type: 1, name: 1 })
    .lean();

  // Fetch all categories for lookup
  const categories = await Category.find({}).lean();
  const categoryMap = new Map(categories.map((c) => [c._id.toString(), c]));

  // Fetch all transactions prior to this month to compute Opening Balances
  const priorTransactions = await Transaction.find({
    date: { $lt: startOfMonth },
    status: { $ne: 'REVERSED' },
  }).lean();

  // Pre-aggregate prior movements by account
  const priorMovements = new Map();
  for (const acc of accounts) {
    priorMovements.set(acc._id.toString(), { debits: 0, credits: 0 });
  }

  for (const tx of priorTransactions) {
    const drId = tx.drAccountId?.toString();
    const crId = tx.crAccountId?.toString();

    if (priorMovements.has(drId)) {
      priorMovements.get(drId).debits += tx.amount;
    }
    if (priorMovements.has(crId)) {
      priorMovements.get(crId).credits += tx.amount;
    }
  }

  // Fetch all transactions within the target month
  const monthTransactions = await Transaction.find({
    date: { $gte: startOfMonth, $lte: endOfMonth },
    status: { $ne: 'REVERSED' },
  })
    .populate('categoryId', 'name type isRentalHead')
    .populate('propertyId', 'plazaName')
    .lean();

  // Build matrix rows for each account
  const rows = [];
  const grandTotal = {
    openingBalance: 0,
    rentalIncome: 0,
    otherInput: 0,
    totalInput: 0,
    rentalExpenses: 0,
    otherExpenses: 0,
    totalOutput: 0,
    closingBalance: 0,
  };

  for (const account of accounts) {
    const accId = account._id.toString();

    // Opening Balance on Day 1 of the month = base opening balance + prior net movements
    const prior = priorMovements.get(accId) || { debits: 0, credits: 0 };
    const openingBalance = round2(account.openingBalance + prior.debits - prior.credits);

    let rentalIncome = 0;
    let otherInput = 0;
    let rentalExpenses = 0;
    let otherExpenses = 0;

    for (const tx of monthTransactions) {
      const isDr = tx.drAccountId?.toString() === accId;
      const isCr = tx.crAccountId?.toString() === accId;
      const cat = tx.categoryId || categoryMap.get(tx.categoryId?.toString());

      const isRentalCat = cat?.isRentalHead || cat?.name === 'Rental Income';
      const isPropertyTied = !!tx.propertyId;

      // Inflow into this account (Debited)
      if (isDr) {
        if (isRentalCat || isPropertyTied) {
          rentalIncome += tx.amount;
        } else {
          otherInput += tx.amount;
        }
      }

      // Outflow from this account (Credited)
      if (isCr) {
        if (isPropertyTied || (isRentalCat && cat?.type === 'EXPENSE')) {
          rentalExpenses += tx.amount;
        } else {
          otherExpenses += tx.amount;
        }
      }
    }

    rentalIncome = round2(rentalIncome);
    otherInput = round2(otherInput);
    const totalInput = round2(rentalIncome + otherInput);

    rentalExpenses = round2(rentalExpenses);
    otherExpenses = round2(otherExpenses);
    const totalOutput = round2(rentalExpenses + otherExpenses);

    const closingBalance = round2(openingBalance + totalInput - totalOutput);

    const row = {
      accountId: account._id,
      accountName: account.name,
      accountType: account.type,
      accountNumber: account.accountNumber,
      openingBalance,
      rentalIncome,
      otherInput,
      totalInput,
      rentalExpenses,
      otherExpenses,
      totalOutput,
      closingBalance,
    };

    rows.push(row);

    // Add to Grand Total
    grandTotal.openingBalance += openingBalance;
    grandTotal.rentalIncome += rentalIncome;
    grandTotal.otherInput += otherInput;
    grandTotal.totalInput += totalInput;
    grandTotal.rentalExpenses += rentalExpenses;
    grandTotal.otherExpenses += otherExpenses;
    grandTotal.totalOutput += totalOutput;
    grandTotal.closingBalance += closingBalance;
  }

  // Round grand totals
  for (const key of Object.keys(grandTotal)) {
    grandTotal[key] = round2(grandTotal[key]);
  }

  return {
    year,
    month,
    periodName: `${year}-${String(month).padStart(2, '0')}`,
    startDate: startOfMonth.toISOString().split('T')[0],
    endDate: endOfMonth.toISOString().split('T')[0],
    rows,
    grandTotal,
  };
};

/**
 * Groups all expense transactions for the specified month by Category (Head).
 *
 * @param {number} year - Full year (e.g. 2026)
 * @param {number} month - 1-indexed month (1 = Jan, 8 = August)
 * @returns {Promise<Object>} - Breakdown by expense head with itemized transaction details
 */
export const getHeadWiseExpenseReport = async (year, month) => {
  if (typeof year === 'string' && year.includes('-')) {
    const [y, m] = year.split('-').map(Number);
    year = y;
    month = m;
  }
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Find all categories of type EXPENSE
  const expenseCategories = await Category.find({ type: 'EXPENSE' }).lean();
  const expenseCatIds = expenseCategories.map((c) => c._id);

  // Find transactions belonging to expense categories in this month
  const transactions = await Transaction.find({
    date: { $gte: startOfMonth, $lte: endOfMonth },
    categoryId: { $in: expenseCatIds },
    status: { $ne: 'REVERSED' },
  })
    .populate('categoryId', 'name type isRentalHead')
    .populate('crAccountId', 'name type')
    .populate('drAccountId', 'name type')
    .populate('propertyId', 'plazaName')
    .sort({ date: 1, voucherNo: 1 })
    .lean();

  // Group transactions by category
  const groupsMap = new Map();
  for (const cat of expenseCategories) {
    groupsMap.set(cat._id.toString(), {
      categoryId: cat._id,
      headName: cat.name,
      isRentalHead: cat.isRentalHead,
      totalSpent: 0,
      transactionCount: 0,
      transactions: [],
    });
  }

  let totalExpensesOverall = 0;
  let generalExpenses = 0;
  let propertyOwnExpenses = 0;
  let unitExpenses = 0;

  for (const tx of transactions) {
    const catId = tx.categoryId?._id?.toString() || tx.categoryId?.toString();
    if (!groupsMap.has(catId)) {
      groupsMap.set(catId, {
        categoryId: catId,
        headName: tx.categoryId?.name || 'Unknown Head',
        isRentalHead: tx.categoryId?.isRentalHead || false,
        totalSpent: 0,
        transactionCount: 0,
        transactions: [],
      });
    }

    const group = groupsMap.get(catId);
    const amt = round2(tx.amount);
    group.totalSpent = round2(group.totalSpent + amt);
    group.transactionCount += 1;
    totalExpensesOverall = round2(totalExpensesOverall + amt);
    const classification = tx.expenseClassification
      || (tx.unitId ? 'UNIT_EXPENSE' : tx.propertyId ? 'PROPERTY_OWN_EXPENSE' : 'GENERAL_EXPENSE');
    if (classification === 'GENERAL_EXPENSE') generalExpenses = round2(generalExpenses + amt);
    if (classification === 'PROPERTY_OWN_EXPENSE') propertyOwnExpenses = round2(propertyOwnExpenses + amt);
    if (classification === 'UNIT_EXPENSE') unitExpenses = round2(unitExpenses + amt);

    group.transactions.push({
      _id: tx._id,
      date: tx.date,
      voucherNo: tx.voucherNo,
      detail: tx.detail,
      amount: amt,
      paidFromAccount: tx.crAccountId?.name || null,
      debitedAccount: tx.drAccountId?.name || null,
      property: tx.propertyId?.plazaName || null,
      expenseClassification: tx.expenseClassification
        || (tx.unitId ? 'UNIT_EXPENSE' : tx.propertyId ? 'PROPERTY_OWN_EXPENSE' : 'GENERAL_EXPENSE'),
      unitId: tx.unitId || null,
      status: tx.status,
      checkedBy: tx.checkedBy,
    });
  }

  // Filter and sort heads: heads with spend first, then alphabetical
  const heads = Array.from(groupsMap.values()).sort((a, b) => {
    if (b.totalSpent !== a.totalSpent) {
      return b.totalSpent - a.totalSpent;
    }
    return a.headName.localeCompare(b.headName);
  });

  return {
    year,
    month,
    periodName: `${year}-${String(month).padStart(2, '0')}`,
    totalExpensesOverall: round2(totalExpensesOverall),
    classificationTotals: {
      generalExpenses: round2(generalExpenses),
      propertyOwnExpenses: round2(propertyOwnExpenses),
      unitExpenses: round2(unitExpenses),
    },
    heads,
  };
};

/**
 * Suggest next sequential numeric voucher number
 */
export const suggestNextVoucherNumber = async () => {
  const [vouchers, txs] = await Promise.all([
    Voucher.find({}, { voucherNumber: 1 }).lean(),
    Transaction.find({}, { voucherNo: 1 }).lean(),
  ]);

  let maxNum = 3000; // Standard Pixx baseline voucher number
  for (const v of vouchers) {
    if (v.voucherNumber) {
      const num = parseInt(v.voucherNumber.replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  for (const t of txs) {
    if (t.voucherNo) {
      const num = parseInt(t.voucherNo.replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }

  return String(maxNum + 1);
};

/**
 * Creates a formal Voucher header and multiple transaction lines atomically,
 * verifying double-entry balancing and updating account balances.
 */
export const createVoucherWithLines = async (payload, externalSession = null) => {
  const {
    voucherNumber,
    voucherDate,
    voucherType = 'EXPENSE',
    reference = '',
    description,
    checkedBy = null,
    sourceModule = 'MANUAL_VOUCHER',
    sourceId = null,
    createdBy = null,
    lines = [],
  } = payload;

  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    throw new Error('Voucher must contain at least one transaction line.');
  }

  // 1. Double-entry validation: Calculate total debits and credits
  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.detail || !line.detail.trim()) {
      throw new Error(`Line ${i + 1}: Transaction detail / description is required.`);
    }
    if (!line.categoryId) {
      throw new Error(`Line ${i + 1}: Account Head (categoryId) is required.`);
    }
    if (!line.drAccountId || !line.crAccountId) {
      throw new Error(`Line ${i + 1}: Both Debit (drAccountId) and Credit (crAccountId) accounts are required.`);
    }
    if (line.drAccountId.toString() === line.crAccountId.toString()) {
      throw new Error(`Line ${i + 1}: Debit and Credit accounts cannot be identical.`);
    }
    const amt = round2(line.amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error(`Line ${i + 1}: Amount must be strictly greater than zero.`);
    }
    totalDebit += amt;
    totalCredit += amt;
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Voucher is unbalanced! Total Debit (Rs. ${totalDebit}) must equal Total Credit (Rs. ${totalCredit}).`);
  }

  // 2. Resolve Voucher Number
  let cleanVn = (voucherNumber || '').trim().toUpperCase();
  if (!cleanVn) {
    cleanVn = await suggestNextVoucherNumber();
  }

  // Check uniqueness for new vouchers
  const existing = await Voucher.findOne({ voucherNumber: cleanVn });
  if (existing) {
    throw new Error(`Voucher number '${cleanVn}' already exists.`);
  }

  const vDate = voucherDate ? new Date(voucherDate) : new Date();
  const vDesc = description ? description.trim() : (lines[0]?.detail || `Voucher ${cleanVn}`);

  const executeAtomicVoucher = async (session) => {
    // 3. Create Voucher Header
    const [voucher] = await Voucher.create(
      [
        {
          voucherNumber: cleanVn,
          voucherDate: vDate,
          voucherType,
          reference: reference.trim(),
          description: vDesc,
          status: 'POSTED',
          totalAmount: totalDebit,
          totalDebit,
          totalCredit,
          isBalanced: true,
          linesCount: lines.length,
          sourceModule,
          sourceId,
          checkedBy: checkedBy || null,
          createdBy: createdBy || null,
        },
      ],
      session ? { session } : {}
    );

    // 4. Create Transaction Lines and update Account balances
    const createdTransactions = [];
    for (const line of lines) {
      const lineAmt = round2(line.amount);

      // Resolve category & reportCategory
      const categoryDoc = await Category.findById(line.categoryId).session(session || null);
      if (!categoryDoc) throw new Error(`Category not found with ID: ${line.categoryId}`);

      let repCat = line.reportCategory;
      if (!repCat) {
        if (voucherType === 'EXPENSE') repCat = 'Payments';
        else if (voucherType === 'RENT_RECEIPT') repCat = 'Rent';
        else if (voucherType === 'TRANSFER') repCat = 'Transfer';
        else if (voucherType === 'OPENING_BALANCE') repCat = 'Opening Balance';
        else if (categoryDoc.type === 'EXPENSE') repCat = 'Payments';
        else if (categoryDoc.type === 'INCOME') repCat = categoryDoc.isRentalHead ? 'Rent' : 'Other Income';
        else repCat = 'Payments';
      }

      let txType = line.transactionType;
      if (!txType) {
        if (voucherType === 'RENT_RECEIPT') txType = 'INCOME';
        else if (voucherType === 'TRANSFER') txType = 'TRANSFER';
        else if (voucherType === 'OPENING_BALANCE') txType = 'OPENING_BALANCE';
        else txType = 'EXPENSE';
      }

      // Create transaction line
      const [tx] = await Transaction.create(
        [
          {
            date: vDate,
            voucherNo: cleanVn,
            voucherId: voucher._id,
            detail: line.detail.trim(),
            transactionType: txType,
            categoryId: line.categoryId,
            reportCategory: repCat,
            sourceModule,
            sourceId,
            drAccountId: line.drAccountId,
            crAccountId: line.crAccountId,
            amount: lineAmt,
            propertyId: line.propertyId || null,
            unitId: line.unitId || null,
            tenantId: line.tenantId || null,
            agreementId: line.agreementId || null,
            reference: line.reference || reference.trim(),
            rentMonth: line.rentMonth || null,
            status: 'POSTED',
            checkedBy: checkedBy || null,
            createdBy: createdBy || null,
          },
        ],
        session ? { session } : {}
      );

      // Account balances: Dr increases, Cr decreases
      await Promise.all([
        Account.findByIdAndUpdate(
          line.drAccountId,
          { $inc: { currentBalance: lineAmt } },
          { new: true, session: session || null }
        ),
        Account.findByIdAndUpdate(
          line.crAccountId,
          { $inc: { currentBalance: -lineAmt } },
          { new: true, session: session || null }
        ),
      ]);

      createdTransactions.push(tx);
    }

    return { voucher, transactions: createdTransactions };
  };

  if (externalSession) {
    return await executeAtomicVoucher(externalSession);
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await executeAtomicVoucher(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {}
    }
    // Sessionless fallback
    return await executeAtomicVoucher(null);
  } finally {
    if (session) {
      try {
        session.endSession();
      } catch {}
    }
  }
};

/**
 * Automatically link existing legacy transactions to Voucher header records
 */
export const syncLegacyTransactionsToVouchers = async () => {
  const orphanedTxs = await Transaction.find({}).lean();
  if (orphanedTxs.length === 0) return { syncedCount: 0, createdVouchers: 0 };

  const categories = await Category.find({}).lean();
  const catMap = new Map(categories.map((c) => [c._id.toString(), c]));

  const groups = new Map();
  for (const tx of orphanedTxs) {
    const vn = (tx.voucherNo || 'V-UNKNOWN').trim().toUpperCase();
    if (!groups.has(vn)) groups.set(vn, []);
    groups.get(vn).push(tx);
  }

  let createdVouchers = 0;
  for (const [vn, txList] of groups.entries()) {
    let existingVoucher = await Voucher.findOne({ voucherNumber: vn });
    const totalAmt = round2(txList.reduce((s, t) => s + (t.amount || 0), 0));
    const firstTx = txList[0];
    const cat = catMap.get(firstTx.categoryId?.toString());

    let vType = 'EXPENSE';
    if (firstTx.transactionType === 'INCOME' || cat?.type === 'INCOME') vType = 'RENT_RECEIPT';
    else if (firstTx.transactionType === 'TRANSFER' || cat?.type === 'TRANSFER') vType = 'TRANSFER';
    else if (firstTx.transactionType === 'OPENING_BALANCE') vType = 'OPENING_BALANCE';

    if (!existingVoucher) {
      existingVoucher = await Voucher.create({
        voucherNumber: vn,
        voucherDate: firstTx.date || new Date(),
        voucherType: vType,
        reference: firstTx.reference || '',
        description: firstTx.detail || `Voucher ${vn}`,
        status: firstTx.status === 'VERIFIED' ? 'POSTED' : (firstTx.status || 'POSTED'),
        totalAmount: totalAmt,
        totalDebit: totalAmt,
        totalCredit: totalAmt,
        isBalanced: true,
        linesCount: txList.length,
        sourceModule: vType === 'RENT_RECEIPT' ? 'RENT_RECEIVED' : (vType === 'TRANSFER' ? 'TRANSFER' : 'MANUAL_VOUCHER'),
        checkedBy: firstTx.checkedBy || null,
        createdBy: firstTx.createdBy || null,
      });
      createdVouchers++;
    }

    // Update each individual transaction with its correct type and category
    for (const t of txList) {
      const lineCat = catMap.get(t.categoryId?.toString());
      let txType = t.transactionType;
      if (!txType) {
        if (lineCat?.type === 'INCOME') txType = 'INCOME';
        else if (lineCat?.type === 'TRANSFER') txType = 'TRANSFER';
        else txType = 'EXPENSE';
      }

      let repCat = 'Payments';
      if (txType === 'INCOME') {
        repCat = (lineCat?.isRentalHead || t.rentMonth || lineCat?.name === 'Rental Income') ? 'Rent' : 'Other Income';
      } else if (txType === 'TRANSFER') {
        repCat = 'Transfer';
      } else if (txType === 'OPENING_BALANCE') {
        repCat = 'Opening Balance';
      } else {
        repCat = 'Payments';
      }

      await Transaction.findByIdAndUpdate(t._id, {
        $set: {
          voucherId: existingVoucher._id,
          transactionType: txType,
          reportCategory: repCat,
          status: t.status === 'VERIFIED' ? 'POSTED' : (t.status || 'POSTED'),
        },
      });
    }
  }

  return { syncedCount: orphanedTxs.length, createdVouchers };
};

/**
 * Filtered, paginated central transaction ledger query with exact summary totals
 */
export const getTransactionsFiltered = async (filters = {}) => {
  const {
    search,
    startDate,
    endDate,
    month,
    voucherNo,
    categoryId,
    reportCategory,
    drAccountId,
    crAccountId,
    accountId,
    propertyId,
    expenseClassification,
    transactionType,
    status,
    page = 1,
    limit = 50,
  } = filters;

  const query = {};

  // 1. Date / Month filtering (based on transaction date, NOT createdAt)
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    query.date = {
      $gte: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)),
      $lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
    };
  } else if (startDate || endDate) {
    query.date = {};
    if (startDate) {
      query.date.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date.$lte = end;
    }
  }

  // 2. Voucher number exact or prefix
  if (voucherNo && voucherNo.trim()) {
    query.voucherNo = { $regex: voucherNo.trim(), $options: 'i' };
  }

  // 3. Category / Account Head
  if (categoryId) {
    query.categoryId = categoryId;
  }

  // 4. Report Category
  if (reportCategory && reportCategory !== 'ALL') {
    query.reportCategory = reportCategory;
  }

  // 5. Account filtering
  if (accountId) {
    query.$or = [{ drAccountId: accountId }, { crAccountId: accountId }];
  } else {
    if (drAccountId) query.drAccountId = drAccountId;
    if (crAccountId) query.crAccountId = crAccountId;
  }

  // 6. Property filtering
  if (propertyId) {
    query.propertyId = propertyId;
  }

  if (expenseClassification && expenseClassification !== 'ALL') {
    query.expenseClassification = expenseClassification;
  }

  // 7. Transaction Type filtering
  if (transactionType && transactionType !== 'ALL') {
    query.transactionType = transactionType;
  }

  // 8. Status filtering (Exclude REVERSED and VOID by default)
  if (status && status !== 'ALL') {
    query.status = status;
  } else if (!status) {
    query.status = { $nin: ['REVERSED', 'VOID'] };
  }

  // 9. Search string across detail, voucherNo, reference, checkedBy
  if (search && search.trim()) {
    const s = search.trim();
    const searchConditions = [
      { voucherNo: { $regex: s, $options: 'i' } },
      { detail: { $regex: s, $options: 'i' } },
      { reference: { $regex: s, $options: 'i' } },
      { checkedBy: { $regex: s, $options: 'i' } },
    ];
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchConditions }];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  // Execute pagination and query in parallel
  const [totalRecords, transactions, allFilteredTxs] = await Promise.all([
    Transaction.countDocuments(query),
    Transaction.find(query)
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type currentBalance bankName cashHolder')
      .populate('crAccountId', 'name type currentBalance bankName cashHolder')
      .populate('propertyId', 'plazaName location')
      .populate('voucherId', 'voucherNumber voucherDate voucherType totalAmount status')
      .populate('createdBy', 'name email role')
      .sort({ date: -1, voucherNo: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    // Summary aggregation without pagination
    Transaction.find(query, {
      amount: 1,
      voucherNo: 1,
      voucherId: 1,
      transactionType: 1,
      reportCategory: 1,
      propertyId: 1,
      unitId: 1,
      expenseClassification: 1,
      status: 1,
    }).lean(),
  ]);

  // Exact Summary Computations
  let filteredLineTotal = 0;
  let totalRentalIncome = 0;
  let totalOtherIncome = 0;
  let totalRentalExpenses = 0;
  let totalOtherExpenses = 0;
  let totalGeneralExpenses = 0;
  let totalPropertyOwnExpenses = 0;
  let totalUnitExpenses = 0;
  let totalTransfers = 0;

  const distinctVouchers = new Set();
  const voucherAmountsMap = new Map();

  for (const t of allFilteredTxs) {
    const amt = round2(t.amount || 0);
    filteredLineTotal = round2(filteredLineTotal + amt);

    const vnKey = (t.voucherNo || (t.voucherId ? t.voucherId.toString() : t._id.toString())).trim().toUpperCase();
    distinctVouchers.add(vnKey);
    // Track voucher amount (sum of lines for that voucher)
    voucherAmountsMap.set(vnKey, round2((voucherAmountsMap.get(vnKey) || 0) + amt));

    if (t.transactionType === 'INCOME') {
      if (t.reportCategory === 'Rent') {
        totalRentalIncome = round2(totalRentalIncome + amt);
      } else {
        totalOtherIncome = round2(totalOtherIncome + amt);
      }
    } else if (t.transactionType === 'EXPENSE') {
      const classification = t.expenseClassification
        || (t.unitId ? 'UNIT_EXPENSE' : t.propertyId ? 'PROPERTY_OWN_EXPENSE' : 'GENERAL_EXPENSE');
      if (classification === 'GENERAL_EXPENSE') {
        totalGeneralExpenses = round2(totalGeneralExpenses + amt);
        totalOtherExpenses = round2(totalOtherExpenses + amt);
      } else if (classification === 'PROPERTY_OWN_EXPENSE') {
        totalPropertyOwnExpenses = round2(totalPropertyOwnExpenses + amt);
        totalRentalExpenses = round2(totalRentalExpenses + amt);
      } else {
        totalUnitExpenses = round2(totalUnitExpenses + amt);
        totalRentalExpenses = round2(totalRentalExpenses + amt);
      }
    } else if (t.transactionType === 'TRANSFER') {
      totalTransfers = round2(totalTransfers + amt);
    }
  }

  // Voucher Total: Sum of distinct voucher total amounts
  let filteredVoucherTotal = 0;
  for (const amt of voucherAmountsMap.values()) {
    filteredVoucherTotal = round2(filteredVoucherTotal + amt);
  }

  return {
    pagination: {
      total: totalRecords,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(totalRecords / limitNum),
    },
    summary: {
      filteredLineTotal,
      filteredVoucherTotal,
      uniqueVouchersCount: distinctVouchers.size,
      totalRentalIncome,
      totalOtherIncome,
      totalRentalExpenses,
      totalOtherExpenses,
      totalGeneralExpenses,
      totalPropertyOwnExpenses,
      totalUnitExpenses,
      totalTransfers,
      totalFinancialActivity: round2(filteredLineTotal),
    },
    transactions,
  };
};

export default {
  createTransaction,
  createVoucherWithLines,
  suggestNextVoucherNumber,
  syncLegacyTransactionsToVouchers,
  getTransactionsFiltered,
  getAccountRunningLedger,
  getMonthlyOpeningClosingMatrix,
  getHeadWiseExpenseReport,
  round2,
};
