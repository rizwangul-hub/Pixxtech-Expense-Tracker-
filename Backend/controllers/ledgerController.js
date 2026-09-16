import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Account from '../models/Account.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentDue from '../models/RentDue.js';
import RentReceived from '../models/RentReceived.js';
import Category from '../models/Category.js';
import OtherIncomeHead from '../models/OtherIncomeHead.js';
import OtherIncome from '../models/OtherIncome.js';
import Voucher from '../models/Voucher.js';
import { round2 } from '../services/ledgerService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * Utility to parse date presets (TODAY, THIS_WEEK, THIS_MONTH, PREVIOUS_MONTH, CUSTOM, AS_ON_DATE)
 */
const parseDateRange = (datePreset, startDate, endDate, asOnDate) => {
  const now = new Date();
  let periodStart = null;
  let periodEnd = null;

  switch (datePreset) {
    case 'TODAY': {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'THIS_WEEK': {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      periodStart = new Date(now.setDate(diff));
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date();
      periodEnd.setHours(23, 59, 59, 999);
      break;
    }
    case 'THIS_MONTH': {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      periodEnd = new Date(now.getFullYear(), now.getMonth(), days, 23, 59, 59, 999);
      break;
    }
    case 'PREVIOUS_MONTH': {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodStart = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1, 0, 0, 0);
      const days = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
      periodEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), days, 23, 59, 59, 999);
      break;
    }
    case 'AS_ON_DATE': {
      if (asOnDate) {
        periodEnd = new Date(asOnDate);
        periodEnd.setHours(23, 59, 59, 999);
      }
      break;
    }
    case 'CUSTOM': {
      if (startDate) periodStart = new Date(startDate);
      if (endDate) {
        periodEnd = new Date(endDate);
        periodEnd.setHours(23, 59, 59, 999);
      }
      break;
    }
    default:
      break;
  }

  return { periodStart, periodEnd };
};

/**
 * @desc    Get selectable entities grouped or filtered by ledger type
 * @route   GET /api/ledgers/entities
 * @access  Private (Authenticated)
 */
export const getLedgerEntities = async (req, res) => {
  try {
    const { type } = req.query;

    const results = {
      accounts: [],
      custodians: [],
      properties: [],
      tenants: [],
      categories: [],
      otherIncomeHeads: [],
    };

    if (!type || type === 'BANK' || type === 'CASH') {
      const accounts = await Account.find({}).sort({ type: 1, name: 1 }).lean();
      results.accounts = accounts
        .filter((a) => a.type === 'BANK')
        .map((a) => ({ id: a._id, name: a.name, type: 'BANK', subtext: `${a.bankName || 'Bank'} ${a.accountNumber ? `(${a.accountNumber})` : ''}` }));
      results.custodians = accounts
        .filter((a) => a.type === 'CASH')
        .map((a) => ({ id: a._id, name: a.name, type: 'CASH', subtext: `Custodian: ${a.cashHolder || a.name}` }));
    }

    if (!type || type === 'PROPERTY') {
      const props = await Property.find({}).sort({ propertyName: 1 }).lean();
      results.properties = props.map((p) => ({
        id: p._id,
        name: p.propertyName || p.plazaName,
        type: 'PROPERTY',
        subtext: `Code: ${p.propertyCode || 'N/A'} - ${p.city || 'Lahore'}`,
      }));
    }

    if (!type || type === 'TENANT') {
      const tenants = await Tenant.find({}).sort({ tenantName: 1 }).lean();
      results.tenants = tenants.map((t) => ({
        id: t._id,
        name: t.tenantName || t.name,
        type: 'TENANT',
        subtext: `CNIC: ${t.cnic || 'N/A'} - Phone: ${t.phone || 'N/A'}`,
      }));
    }

    if (!type || type === 'ACCOUNT_HEAD' || type === 'CATEGORY' || type === 'EXPENSE') {
      const cats = await Category.find({}).sort({ name: 1 }).lean();
      results.categories = cats.map((c) => ({
        id: c._id,
        name: c.name,
        type: c.type || 'EXPENSE',
        subtext: `Category Type: ${c.type || 'EXPENSE'}`,
      }));
    }

    if (!type || type === 'OTHER_INCOME') {
      const heads = await OtherIncomeHead.find({}).sort({ name: 1 }).lean();
      results.otherIncomeHeads = heads.map((h) => ({
        id: h._id,
        name: h.name,
        type: 'OTHER_INCOME',
        subtext: `Code: ${h.code || 'INC'}`,
      }));
    }

    return apiSuccess(res, results, 'Ledger entities loaded successfully.');
  } catch (error) {
    console.error('[Get Ledger Entities Error]:', error);
    return apiError(res, 'Failed to fetch ledger entities.', 500);
  }
};

/**
 * @desc    Query Central Financial Ledger by Type & Entity
 * @route   GET /api/ledgers/query
 * @access  Private (Authenticated)
 */
export const queryLedger = async (req, res) => {
  try {
    const {
      type = 'BANK',
      entityId,
      datePreset = 'THIS_MONTH',
      startDate,
      endDate,
      asOnDate,
      search,
      page = 1,
      limit = 100,
    } = req.query;

    const { periodStart, periodEnd } = parseDateRange(datePreset, startDate, endDate, asOnDate);
    const sRegex = search && search.trim() ? new RegExp(search.trim(), 'i') : null;

    let targetEntity = null;
    let ledgerTitle = 'General Central Ledger';
    let entitySubtext = '';
    let ledgerEntries = [];
    let openingBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let closingBalance = 0;

    // Base query filter: ONLY posted transactions for official ledger
    const baseStatusFilter = { status: 'POSTED' };

    // =========================================================================
    // 1. BANK ACCOUNT & CASH CUSTODIAN LEDGER
    // =========================================================================
    if (type === 'BANK' || type === 'CASH') {
      if (!entityId || !mongoose.Types.ObjectId.isValid(entityId)) {
        return apiError(res, `Please select a valid ${type === 'BANK' ? 'Bank Account' : 'Cash Custodian'}.`, 400);
      }

      targetEntity = await Account.findById(entityId).lean();
      if (!targetEntity) {
        return apiError(res, 'Account not found.', 404);
      }

      ledgerTitle = targetEntity.name;
      entitySubtext = type === 'BANK'
        ? `Bank Account &bull; ${targetEntity.bankName || ''} ${targetEntity.accountNumber ? `(${targetEntity.accountNumber})` : ''}`
        : `Cash-in-Hand Custodian &bull; ${targetEntity.cashHolder || targetEntity.name}`;

      // Calculate initial opening balance at openingBalanceDate
      let calcOpening = targetEntity.openingBalance || 0;

      // Add all prior POSTED transactions before periodStart
      if (periodStart) {
        const priorTxs = await Transaction.find({
          ...baseStatusFilter,
          $or: [{ drAccountId: entityId }, { crAccountId: entityId }],
          date: { $lt: periodStart },
        }).select('drAccountId crAccountId amount').lean();

        priorTxs.forEach((tx) => {
          if (tx.drAccountId?.toString() === entityId.toString()) calcOpening += tx.amount; // Money In (Dr)
          if (tx.crAccountId?.toString() === entityId.toString()) calcOpening -= tx.amount; // Money Out (Cr)
        });
      }
      openingBalance = round2(calcOpening);

      // Query transactions within period
      const txQuery = {
        ...baseStatusFilter,
        $or: [{ drAccountId: entityId }, { crAccountId: entityId }],
      };

      if (periodStart && periodEnd) txQuery.date = { $gte: periodStart, $lte: periodEnd };
      else if (periodStart) txQuery.date = { $gte: periodStart };
      else if (periodEnd) txQuery.date = { $lte: periodEnd };

      if (sRegex) {
        txQuery.$and = txQuery.$and || [];
        txQuery.$and.push({ $or: [{ voucherNo: sRegex }, { detail: sRegex }, { reference: sRegex }] });
      }

      const transactions = await Transaction.find(txQuery)
        .sort({ date: 1, createdAt: 1, _id: 1 })
        .populate('drAccountId', 'name type')
        .populate('crAccountId', 'name type')
        .populate('categoryId', 'name type')
        .populate('propertyId', 'propertyName plazaName propertyCode')
        .populate('tenantId', 'tenantName name')
        .populate('createdBy', 'name email role')
        .populate('voucherId', 'voucherNo status')
        .lean();

      let runningBal = openingBalance;
      ledgerEntries = transactions.map((tx) => {
        const isDr = tx.drAccountId?._id?.toString() === entityId.toString();
        const isCr = tx.crAccountId?._id?.toString() === entityId.toString();

        const debit = isDr ? tx.amount : 0;
        const credit = isCr ? tx.amount : 0;

        runningBal = round2(runningBal + debit - credit);
        totalDebit += debit;
        totalCredit += credit;

        return {
          _id: tx._id,
          date: tx.date,
          voucherNo: tx.voucherNo,
          voucherId: tx.voucherId?._id || tx.voucherId,
          detail: tx.detail,
          transactionType: tx.transactionType,
          sourceModule: tx.sourceModule,
          categoryName: tx.categoryId?.name || 'General',
          drAccount: tx.drAccountId?.name || 'Account',
          crAccount: tx.crAccountId?.name || 'Account',
          propertyName: tx.propertyId?.propertyName || tx.propertyId?.plazaName || '',
          tenantName: tx.tenantId?.tenantName || tx.tenantId?.name || '',
          reference: tx.reference || '',
          debit: round2(debit),
          credit: round2(credit),
          amount: round2(tx.amount),
          balance: round2(runningBal),
          status: tx.status,
          createdBy: tx.createdBy?.name || 'System',
          checkedBy: tx.checkedBy || null,
        };
      });

      totalDebit = round2(totalDebit);
      totalCredit = round2(totalCredit);
      closingBalance = round2(runningBal);
    }

    // =========================================================================
    // 2. PROPERTY LEDGER
    // =========================================================================
    else if (type === 'PROPERTY') {
      if (!entityId || !mongoose.Types.ObjectId.isValid(entityId)) {
        return apiError(res, 'Please select a valid Property.', 400);
      }

      targetEntity = await Property.findById(entityId).lean();
      if (!targetEntity) {
        return apiError(res, 'Property not found.', 404);
      }

      ledgerTitle = `Property Ledger: ${targetEntity.propertyName || targetEntity.plazaName}`;
      entitySubtext = `Code: ${targetEntity.propertyCode || 'N/A'} &bull; City: ${targetEntity.city || 'Lahore'} &bull; Address: ${targetEntity.address || ''}`;

      const txQuery = {
        ...baseStatusFilter,
        propertyId: entityId,
      };

      if (periodStart && periodEnd) txQuery.date = { $gte: periodStart, $lte: periodEnd };
      else if (periodStart) txQuery.date = { $gte: periodStart };
      else if (periodEnd) txQuery.date = { $lte: periodEnd };

      if (sRegex) {
        txQuery.$and = txQuery.$and || [];
        txQuery.$and.push({ $or: [{ voucherNo: sRegex }, { detail: sRegex }, { reference: sRegex }] });
      }

      const transactions = await Transaction.find(txQuery)
        .sort({ date: 1, createdAt: 1, _id: 1 })
        .populate('drAccountId', 'name type')
        .populate('crAccountId', 'name type')
        .populate('categoryId', 'name type')
        .populate('tenantId', 'tenantName name')
        .populate('createdBy', 'name email role')
        .lean();

      let runningBal = 0;
      ledgerEntries = transactions.map((tx) => {
        const isExpense = tx.transactionType === 'EXPENSE' || tx.reportCategory === 'Payments';
        const isIncome = tx.transactionType === 'INCOME' || tx.reportCategory === 'Rent' || tx.reportCategory === 'Other Income';

        const debit = isExpense ? tx.amount : 0;
        const credit = isIncome ? tx.amount : 0;

        runningBal = round2(runningBal + credit - debit); // Income increases net cashflow, expense decreases
        totalDebit += debit;
        totalCredit += credit;

        return {
          _id: tx._id,
          date: tx.date,
          voucherNo: tx.voucherNo,
          detail: tx.detail,
          transactionType: tx.transactionType,
          categoryName: tx.categoryId?.name || 'General',
          drAccount: tx.drAccountId?.name || '',
          crAccount: tx.crAccountId?.name || '',
          tenantName: tx.tenantId?.tenantName || tx.tenantId?.name || '',
          rentMonth: tx.rentMonth || '',
          reference: tx.reference || '',
          debit: round2(debit),
          credit: round2(credit),
          amount: round2(tx.amount),
          balance: round2(runningBal),
          status: tx.status,
          createdBy: tx.createdBy?.name || 'System',
        };
      });

      openingBalance = 0;
      totalDebit = round2(totalDebit);
      totalCredit = round2(totalCredit);
      closingBalance = round2(totalCredit - totalDebit);
    }

    // =========================================================================
    // 3. TENANT / RENTAL LEDGER
    // =========================================================================
    else if (type === 'TENANT') {
      if (!entityId || !mongoose.Types.ObjectId.isValid(entityId)) {
        return apiError(res, 'Please select a valid Tenant.', 400);
      }

      targetEntity = await Tenant.findById(entityId).lean();
      if (!targetEntity) {
        return apiError(res, 'Tenant not found.', 404);
      }

      ledgerTitle = `Tenant Ledger: ${targetEntity.tenantName || targetEntity.name}`;
      entitySubtext = `CNIC: ${targetEntity.cnic || 'N/A'} &bull; Phone: ${targetEntity.phone || 'N/A'} &bull; Emergency Contact: ${targetEntity.emergencyContact || 'N/A'}`;

      // Query RentDue (Billed) and RentReceived (Collections)
      const dueQuery = { tenantId: entityId };
      const recQuery = { tenantId: entityId, status: { $ne: 'REVERSED' } };

      if (periodStart && periodEnd) {
        dueQuery.createdAt = { $gte: periodStart, $lte: periodEnd };
        recQuery.date = { $gte: periodStart, $lte: periodEnd };
      }

      const [rentDues, rentReceipts] = await Promise.all([
        RentDue.find(dueQuery).populate('propertyId', 'propertyName').lean(),
        RentReceived.find(recQuery).populate('receivingAccountId', 'name').lean(),
      ]);

      // Combine dues and receipts into chronological tenant ledger
      const combined = [];

      rentDues.forEach((d) => {
        combined.push({
          date: d.createdAt || new Date(),
          voucherNo: `DUE-${d.rentMonth}`,
          type: 'RENT_DUE',
          detail: `Rent Invoice for ${d.rentMonth}`,
          rentMonth: d.rentMonth,
          dueAmount: d.totalAmount || d.rentAmount || 0,
          receivedAmount: 0,
          receivingAccount: '-',
          status: d.status || 'UNPAID',
        });
      });

      rentReceipts.forEach((r) => {
        combined.push({
          date: r.date || r.createdAt,
          voucherNo: r.receiptNo || r.voucherNo || `RCV-${r.rentMonth}`,
          type: 'RENT_RECEIVED',
          detail: r.narration || `Rent Payment for ${r.rentMonth}`,
          rentMonth: r.rentMonth,
          dueAmount: 0,
          receivedAmount: r.amount || 0,
          receivingAccount: r.receivingAccountId?.name || 'Bank/Cash',
          status: r.status || 'POSTED',
        });
      });

      combined.sort((a, b) => new Date(a.date) - new Date(b.date));

      let receivableBal = 0;
      ledgerEntries = combined.map((entry, idx) => {
        receivableBal = round2(receivableBal + entry.dueAmount - entry.receivedAmount);
        totalDebit += entry.dueAmount;
        totalCredit += entry.receivedAmount;

        return {
          _id: `TENANT-${idx}`,
          date: entry.date,
          voucherNo: entry.voucherNo,
          detail: entry.detail,
          transactionType: entry.type,
          rentMonth: entry.rentMonth,
          drAccount: '-',
          crAccount: entry.receivingAccount,
          debit: round2(entry.dueAmount), // Billed Due
          credit: round2(entry.receivedAmount), // Cash Received
          amount: round2(entry.dueAmount || entry.receivedAmount),
          balance: round2(receivableBal),
          status: entry.status,
        };
      });

      openingBalance = 0;
      totalDebit = round2(totalDebit);
      totalCredit = round2(totalCredit);
      closingBalance = round2(receivableBal);
    }

    // =========================================================================
    // 4. RENT SPECIFIC LEDGER
    // =========================================================================
    else if (type === 'RENT') {
      ledgerTitle = 'Rent Receipts & Collection Ledger';
      entitySubtext = 'Official Rent Allocation & Payments Journal';

      const rentQuery = { status: { $ne: 'REVERSED' } };
      if (periodStart && periodEnd) rentQuery.date = { $gte: periodStart, $lte: periodEnd };
      if (sRegex) {
        rentQuery.$or = [{ receiptNo: sRegex }, { narration: sRegex }, { rentMonth: sRegex }];
      }

      const receipts = await RentReceived.find(rentQuery)
        .sort({ date: -1 })
        .populate('propertyId', 'propertyName plazaName')
        .populate('tenantId', 'tenantName name')
        .populate('receivingAccountId', 'name type')
        .populate('recordedBy', 'name')
        .lean();

      ledgerEntries = receipts.map((r) => {
        totalCredit += r.amount || 0;
        return {
          _id: r._id,
          date: r.date,
          voucherNo: r.receiptNo || `RCV-${r._id.toString().slice(-6)}`,
          detail: r.narration || `Rent Collected for ${r.rentMonth}`,
          transactionType: 'RENT_RECEIVED',
          rentMonth: r.rentMonth,
          propertyName: r.propertyId?.propertyName || r.propertyId?.plazaName || '',
          tenantName: r.tenantId?.tenantName || r.tenantId?.name || '',
          crAccount: r.receivingAccountId?.name || 'Cash/Bank',
          drAccount: 'Rent Revenue Account',
          debit: 0,
          credit: round2(r.amount || 0),
          amount: round2(r.amount || 0),
          balance: round2(totalCredit),
          status: r.status || 'POSTED',
          createdBy: r.recordedBy?.name || 'System',
        };
      });

      openingBalance = 0;
      totalDebit = 0;
      totalCredit = round2(totalCredit);
      closingBalance = totalCredit;
    }

    // =========================================================================
    // 5. INDIVIDUAL EXPENSE / ACCOUNT HEAD / CATEGORY LEDGER
    // =========================================================================
    else if (type === 'EXPENSE' || type === 'ACCOUNT_HEAD' || type === 'CATEGORY') {
      const txQuery = { ...baseStatusFilter };

      if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
        txQuery.categoryId = entityId;
        targetEntity = await Category.findById(entityId).lean();
        if (targetEntity) {
          ledgerTitle = `Expense & Head Ledger: ${targetEntity.name}`;
          entitySubtext = `Category Type: ${targetEntity.type || 'EXPENSE'}`;
        }
      } else {
        txQuery.transactionType = 'EXPENSE';
        ledgerTitle = 'Individual Expense Journal Ledger';
        entitySubtext = 'All Posted Business & Operational Expenses';
      }

      if (periodStart && periodEnd) txQuery.date = { $gte: periodStart, $lte: periodEnd };

      if (sRegex) {
        txQuery.$and = txQuery.$and || [];
        txQuery.$and.push({ $or: [{ voucherNo: sRegex }, { detail: sRegex }, { reference: sRegex }] });
      }

      const transactions = await Transaction.find(txQuery)
        .sort({ date: 1, createdAt: 1 })
        .populate('drAccountId', 'name type')
        .populate('crAccountId', 'name type')
        .populate('categoryId', 'name type')
        .populate('propertyId', 'propertyName plazaName')
        .populate('tenantId', 'tenantName name')
        .populate('createdBy', 'name email role')
        .lean();

      let runningExpenseSum = 0;
      ledgerEntries = transactions.map((tx) => {
        runningExpenseSum = round2(runningExpenseSum + tx.amount);
        totalDebit += tx.amount;

        return {
          _id: tx._id,
          date: tx.date,
          voucherNo: tx.voucherNo,
          detail: tx.detail,
          transactionType: tx.transactionType,
          categoryName: tx.categoryId?.name || 'Expense',
          drAccount: tx.drAccountId?.name || 'Expense Head',
          crAccount: tx.crAccountId?.name || 'Paid From Account',
          propertyName: tx.propertyId?.propertyName || tx.propertyId?.plazaName || '',
          tenantName: tx.tenantId?.tenantName || tx.tenantId?.name || '',
          reference: tx.reference || '',
          debit: round2(tx.amount),
          credit: 0,
          amount: round2(tx.amount),
          balance: round2(runningExpenseSum),
          status: tx.status,
          createdBy: tx.createdBy?.name || 'System',
        };
      });

      openingBalance = 0;
      totalDebit = round2(totalDebit);
      totalCredit = 0;
      closingBalance = totalDebit;
    }

    // =========================================================================
    // 6. OTHER INCOME LEDGER
    // =========================================================================
    else if (type === 'OTHER_INCOME') {
      const incQuery = {};

      if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
        incQuery.headId = entityId;
        targetEntity = await OtherIncomeHead.findById(entityId).lean();
        if (targetEntity) {
          ledgerTitle = `Other Income Ledger: ${targetEntity.name}`;
          entitySubtext = `Income Code: ${targetEntity.code || 'INC'}`;
        }
      } else {
        ledgerTitle = 'Other Income Receipts Ledger';
        entitySubtext = 'Non-Rental Operational Receipts & Scraps';
      }

      if (periodStart && periodEnd) incQuery.date = { $gte: periodStart, $lte: periodEnd };

      if (sRegex) {
        incQuery.$or = [{ detail: sRegex }, { reference: sRegex }, { receivedFrom: sRegex }];
      }

      const incomes = await OtherIncome.find(incQuery)
        .sort({ date: -1 })
        .populate('headId', 'name code')
        .populate('accountId', 'name type')
        .populate('recordedBy', 'name')
        .lean();

      ledgerEntries = incomes.map((inc) => {
        totalCredit += inc.amount || 0;

        return {
          _id: inc._id,
          date: inc.date,
          voucherNo: inc.reference || `INC-${inc._id.toString().slice(-6)}`,
          detail: inc.detail || 'Other Income Receipt',
          transactionType: 'OTHER_INCOME',
          categoryName: inc.headId?.name || 'Other Income',
          drAccount: inc.accountId?.name || 'Receiving Account',
          crAccount: 'Other Income Head',
          receivedFrom: inc.receivedFrom || '',
          debit: 0,
          credit: round2(inc.amount || 0),
          amount: round2(inc.amount || 0),
          balance: round2(totalCredit),
          status: inc.status || 'POSTED',
          createdBy: inc.recordedBy?.name || 'System',
        };
      });

      openingBalance = 0;
      totalDebit = 0;
      totalCredit = round2(totalCredit);
      closingBalance = totalCredit;
    }

    // Return unified central ledger payload
    return apiSuccess(
      res,
      {
        type,
        ledgerTitle,
        entitySubtext,
        datePreset,
        summary: {
          openingBalance,
          totalDebit,
          totalCredit,
          closingBalance,
          entryCount: ledgerEntries.length,
        },
        entries: ledgerEntries,
      },
      `Retrieved ledger for ${ledgerTitle} with ${ledgerEntries.length} entries.`
    );
  } catch (error) {
    console.error('[Central Ledger Query Error]:', error);
    return apiError(res, 'Failed to query central ledger.', 500);
  }
};

export default {
  getLedgerEntities,
  queryLedger,
};
