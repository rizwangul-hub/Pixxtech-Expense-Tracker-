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
import { round2, resolveTransactionAccountDisplay, getTransactionsFiltered } from '../services/ledgerService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { generateLedgerPDF, generateAllTransactionsPDF } from '../services/pdfReportService.js';


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
    case 'ALL':
    case 'ALL_TIME': {
      periodStart = null;
      periodEnd = null;
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

    if (!type || type === 'BANK' || type === 'CASH' || type === 'SUSPENSE') {
      const accounts = await Account.find({}).sort({ type: 1, name: 1 }).lean();
      results.accounts = accounts
        .filter((a) => a.type === 'BANK')
        .map((a) => ({ id: a._id, name: a.name, type: 'BANK', subtext: `${a.bankName || 'Bank'} ${a.accountNumber ? `(${a.accountNumber})` : ''}` }));
      results.custodians = accounts
        .filter((a) => a.type === 'CASH')
        .map((a) => ({ id: a._id, name: a.name, type: 'CASH', subtext: `Custodian: ${a.cashHolder || a.name}` }));
      results.suspenseAccounts = accounts
        .filter((a) => a.type === 'SUSPENSE')
        .map((a) => ({ id: a._id, name: a.name, type: 'SUSPENSE', subtext: `Suspense Account: ${a.name}` }));
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

    if (!type || type === 'ACCOUNT_HEAD') {
      // Return main expense heads and standalone top-level heads
      const topHeads = await Category.find({
        type: { $ne: 'INCOME' },
        $or: [
          { isMainHead: true },
          { parentCategoryId: null },
          { parentCategoryId: { $exists: false } },
        ],
      })
        .sort({ name: 1 })
        .lean();

      const mainHeads = topHeads.filter((c) => c.isMainHead);
      const standaloneHeads = topHeads.filter((c) => !c.isMainHead);

      results.categories = [
        {
          id: 'ALL_EXPENSES',
          name: '★ All Expenses (Consolidated)',
          type: 'ACCOUNT_HEAD',
          subtext: 'Complete expense ledger across all heads',
          isMainHead: true,
          group: 'CONSOLIDATED',
        },
        ...mainHeads.map((c) => ({
          id: c._id,
          name: c.name,
          type: c.type || 'EXPENSE',
          subtext: `Main Head • ${c.type || 'EXPENSE'}`,
          isMainHead: true,
          group: 'MAIN_HEADS',
        })),
        ...standaloneHeads.map((c) => ({
          id: c._id,
          name: c.name,
          type: c.type || 'EXPENSE',
          subtext: `Direct Head • ${c.type || 'EXPENSE'}`,
          isMainHead: false,
          group: 'STANDALONE_HEADS',
        })),
      ];
    }

    if (!type || type === 'CATEGORY' || type === 'EXPENSE' || type === 'ACCOUNT_HEAD') {
      // Return all sub-categories (non main-heads or with parent) for sub-category drilldown
      const cats = await Category.find({
        type: { $ne: 'INCOME' },
        parentCategoryId: { $exists: true, $ne: null },
      })
        .sort({ name: 1 })
        .populate('parentCategoryId', 'name')
        .lean();
      results.subCategories = cats.map((c) => ({
        id: c._id,
        name: c.name,
        type: c.type || 'EXPENSE',
        subtext: `Under: ${c.parentCategoryId?.name || 'General'}`,
        parentId: c.parentCategoryId?._id || null,
        parentName: c.parentCategoryId?.name || '',
        isMainHead: false,
      }));
    }

    if (!type || type === 'OTHER_INCOME') {
      const heads = await OtherIncomeHead.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
      results.otherIncomeHeads = [
        {
          id: 'ALL',
          name: '★ All Other Income Heads (Consolidated)',
          type: 'OTHER_INCOME',
          subtext: 'Complete consolidated non-rental receipts ledger',
        },
        ...heads.map((h) => ({
          id: h._id,
          name: h.name,
          type: 'OTHER_INCOME',
          subtext: `Code: ${h.code || 'INC'} &bull; ${h.description || 'Other Income Head'}`,
        })),
      ];
    }

    return apiSuccess(res, results, 'Ledger entities loaded successfully.');
  } catch (error) {
    console.error('[Get Ledger Entities Error]:', error);
    return apiError(res, 'Failed to fetch ledger entities.', 500);
  }
};

/**
 * @desc    Get Central Financial Ledger Data by Type & Entity
 */
export const getLedgerReportData = async (queryParams = {}) => {
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
  } = queryParams;

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

  // Base query filter: include both POSTED and VERIFIED transactions for official ledger
  const baseStatusFilter = { status: { $in: ['POSTED', 'VERIFIED'] } };

  // =========================================================================
  // 1. BANK ACCOUNT, CASH CUSTODIAN & SUSPENSE ACCOUNT LEDGER
  // =========================================================================
  if (type === 'BANK' || type === 'CASH' || type === 'SUSPENSE') {
    if (!entityId || !mongoose.Types.ObjectId.isValid(entityId)) {
      return {
        type,
        ledgerTitle: type === 'BANK' ? 'Bank Account Ledger' : type === 'CASH' ? 'Cash Custodian Ledger' : 'Suspense Account Ledger',
        entitySubtext: 'Please select an account',
        datePreset,
        summary: { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0, entryCount: 0 },
        entries: [],
      };
    }

    targetEntity = await Account.findById(entityId).lean();
    if (!targetEntity) {
      return {
        type,
        ledgerTitle: type === 'BANK' ? 'Bank Account Ledger' : type === 'CASH' ? 'Cash Custodian Ledger' : 'Suspense Account Ledger',
        entitySubtext: 'Account not found',
        datePreset,
        summary: { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0, entryCount: 0 },
        entries: [],
      };
    }

      ledgerTitle = targetEntity.name;
      entitySubtext = type === 'BANK'
        ? `Bank Account &bull; ${targetEntity.bankName || ''} ${targetEntity.accountNumber ? `(${targetEntity.accountNumber})` : ''}`
        : type === 'CASH'
        ? `Cash-in-Hand Custodian &bull; ${targetEntity.cashHolder || targetEntity.name}`
        : `Suspense / Holding Account &bull; ${targetEntity.accountCode || targetEntity.name}`;

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
        .populate({
          path: 'categoryId',
          select: 'name type isRentalHead parentCategoryId isMainHead',
          populate: { path: 'parentCategoryId', select: 'name' },
        })
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

        const display = resolveTransactionAccountDisplay(tx);

        return {
          _id: tx._id,
          date: tx.date,
          voucherNo: tx.voucherNo,
          voucherId: tx.voucherId?._id || tx.voucherId,
          detail: tx.detail,
          transactionType: tx.transactionType,
          sourceModule: tx.sourceModule,
          categoryName: tx.categoryId?.name || 'General',
          drAccount: display.dr || tx.drAccountId?.name || 'Account',
          crAccount: display.cr || tx.crAccountId?.name || 'Account',
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
        return {
          type,
          ledgerTitle: 'Property / Plaza Ledger',
          entitySubtext: 'Please select a property',
          datePreset,
          summary: { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0, entryCount: 0 },
          entries: [],
        };
      }

      targetEntity = await Property.findById(entityId).lean();
      if (!targetEntity) {
        return {
          type,
          ledgerTitle: 'Property / Plaza Ledger',
          entitySubtext: 'Property not found',
          datePreset,
          summary: { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0, entryCount: 0 },
          entries: [],
        };
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
        .populate({
          path: 'categoryId',
          select: 'name type isRentalHead parentCategoryId isMainHead',
          populate: { path: 'parentCategoryId', select: 'name' },
        })
        .populate('propertyId', 'plazaName propertyName propertyCode')
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

        const display = resolveTransactionAccountDisplay(tx);

        return {
          _id: tx._id,
          date: tx.date,
          voucherNo: tx.voucherNo,
          detail: tx.detail,
          transactionType: tx.transactionType,
          categoryName: tx.categoryId?.name || 'General',
          drAccount: display.dr || tx.drAccountId?.name || '',
          crAccount: display.cr || tx.crAccountId?.name || '',
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
        return {
          type,
          ledgerTitle: 'Tenant / Rental Ledger',
          entitySubtext: 'Please select a tenant',
          datePreset,
          summary: { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0, entryCount: 0 },
          entries: [],
        };
      }

      targetEntity = await Tenant.findById(entityId).lean();
      if (!targetEntity) {
        return {
          type,
          ledgerTitle: 'Tenant / Rental Ledger',
          entitySubtext: 'Tenant not found',
          datePreset,
          summary: { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0, entryCount: 0 },
          entries: [],
        };
      }

      ledgerTitle = `Tenant Ledger: ${targetEntity.tenantName || targetEntity.name}`;
      entitySubtext = `CNIC: ${targetEntity.cnic || 'N/A'} &bull; Phone: ${targetEntity.phone || 'N/A'}`;

      // Query RentDue (Billed) and RentReceived (Collections)
      const dueQuery = { tenantId: entityId };
      const recQuery = { tenantId: entityId, status: { $ne: 'REVERSED' } };

      if (periodStart && periodEnd) {
        dueQuery.dueDate = { $gte: periodStart, $lte: periodEnd };
        recQuery.receiptDate = { $gte: periodStart, $lte: periodEnd };
      } else if (periodStart) {
        dueQuery.dueDate = { $gte: periodStart };
        recQuery.receiptDate = { $gte: periodStart };
      } else if (periodEnd) {
        dueQuery.dueDate = { $lte: periodEnd };
        recQuery.receiptDate = { $lte: periodEnd };
      }

      const [rentDues, rentReceipts] = await Promise.all([
        RentDue.find(dueQuery)
          .populate('propertyId', 'propertyName plazaName')
          .populate('unitId', 'unitNumber floorName')
          .lean(),
        RentReceived.find(recQuery)
          .populate('propertyId', 'propertyName plazaName')
          .populate('unitId', 'unitNumber floorName')
          .populate('receivingAccountId', 'name')
          .lean(),
      ]);

      // Combine dues and receipts into chronological tenant ledger
      const combined = [];

      rentDues.forEach((d) => {
        const propLabel = d.propertyId?.propertyName || d.propertyId?.plazaName || '';
        const unitLabel = d.unitId?.unitNumber || d.unitId?.floorName || '';
        combined.push({
          date: d.dueDate || d.createdAt || new Date(),
          voucherNo: `INV-${d.rentMonth}`,
          type: 'RENT_DUE',
          detail: `Rent Invoice — ${d.rentMonth}${propLabel ? ` | ${propLabel}` : ''}${unitLabel ? ` (${unitLabel})` : ''}`,
          rentMonth: d.rentMonth,
          propertyName: propLabel,
          dueAmount: round2(d.expectedRentAmount || d.totalAmount || d.rentAmount || 0),
          receivedAmount: 0,
          receivingAccount: '—',
          status: d.status || 'UNPAID',
        });
      });

      rentReceipts.forEach((r) => {
        const propLabel = r.propertyId?.propertyName || r.propertyId?.plazaName || '';
        combined.push({
          date: r.receiptDate || r.createdAt,
          voucherNo: r.receiptNumber || `RCV-${r.rentMonth}`,
          type: 'RENT_RECEIVED',
          detail: r.description || `Rent Payment — ${r.rentMonth}${propLabel ? ` | ${propLabel}` : ''}`,
          rentMonth: r.rentMonth,
          propertyName: propLabel,
          dueAmount: 0,
          receivedAmount: round2(r.amount || 0),
          receivingAccount: r.receivingAccountId?.name || 'Cash / Bank',
          status: r.status || 'RECEIVED',
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
          categoryName: entry.type === 'RENT_DUE' ? 'Rent Invoice' : 'Rent Payment',
          propertyName: entry.propertyName,
          drAccount: entry.type === 'RENT_DUE' ? 'Tenant Receivable' : entry.receivingAccount,
          crAccount: entry.type === 'RENT_DUE' ? 'Rent Revenue' : 'Tenant Receivable Cleared',
          debit: round2(entry.dueAmount),    // Invoice issued = Debit Tenant Receivable
          credit: round2(entry.receivedAmount), // Cash received = Credit Receivable
          amount: round2(entry.dueAmount || entry.receivedAmount),
          balance: round2(receivableBal),
          status: entry.status,
          createdBy: 'System',
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
      entitySubtext = 'Official Rent Allocation &amp; Payments Journal';

      const rentQuery = { status: { $ne: 'REVERSED' } };
      if (periodStart && periodEnd) rentQuery.receiptDate = { $gte: periodStart, $lte: periodEnd };
      else if (periodStart) rentQuery.receiptDate = { $gte: periodStart };
      else if (periodEnd) rentQuery.receiptDate = { $lte: periodEnd };

      if (sRegex) {
        rentQuery.$or = [{ receiptNumber: sRegex }, { description: sRegex }, { rentMonth: sRegex }];
      }

      const receipts = await RentReceived.find(rentQuery)
        .sort({ receiptDate: 1, createdAt: 1 })   // ascending for correct running total
        .populate('propertyId', 'propertyName plazaName')
        .populate('unitId', 'unitNumber floorName')
        .populate('tenantId', 'tenantName name')
        .populate('receivingAccountId', 'name type')
        .populate('createdBy', 'name')
        .lean();

      let runningTotal = 0;
      ledgerEntries = receipts.map((r) => {
        const amt = round2(r.amount || 0);
        runningTotal = round2(runningTotal + amt);
        totalDebit += amt;

        const unitLabel = r.unitId?.unitNumber || r.unitId?.floorName || '';
        const propLabel = r.propertyId?.propertyName || r.propertyId?.plazaName || '';
        const locationLabel = [propLabel, unitLabel].filter(Boolean).join(' — ');

        return {
          _id: r._id,
          date: r.receiptDate,
          voucherNo: r.receiptNumber || `RCV-${r._id.toString().slice(-6)}`,
          detail: r.description || `Rent Collected — ${r.rentMonth}`,
          transactionType: 'RENT_RECEIVED',
          rentMonth: r.rentMonth,
          categoryName: 'Rental Income',
          propertyName: propLabel,
          tenantName: r.tenantId?.tenantName || r.tenantId?.name || '',
          drAccount: r.receivingAccountId?.name || 'Cash / Bank',  // Money received INTO bank → Dr bank
          crAccount: locationLabel || 'Rental Income',              // Cr the property/unit rental income
          debit: amt,
          credit: 0,
          amount: amt,
          balance: runningTotal,
          status: r.status || 'RECEIVED',
          createdBy: r.createdBy?.name || 'System',
        };
      });

      openingBalance = 0;
      totalDebit = round2(totalDebit);
      totalCredit = 0;
      closingBalance = round2(runningTotal);
    }

    // =========================================================================
    // 5. INDIVIDUAL EXPENSE / ACCOUNT HEAD / CATEGORY LEDGER
    // =========================================================================
    else if (type === 'EXPENSE' || type === 'ACCOUNT_HEAD' || type === 'CATEGORY') {
      const txQuery = { ...baseStatusFilter };

      if (entityId === 'ALL_EXPENSES') {
        // Consolidated: all expense transactions
        txQuery.transactionType = 'EXPENSE';
        ledgerTitle = 'All Expenses — Consolidated Ledger';
        entitySubtext = 'Complete expense ledger across all heads';
      } else if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
        targetEntity = await Category.findById(entityId).lean();
        if (targetEntity) {
          if (targetEntity.isMainHead) {
            // Main head selected → include all its child categories too
            const childIds = await Category.find({ parentCategoryId: entityId })
              .select('_id')
              .lean()
              .then((docs) => docs.map((d) => d._id));

            const categoryIds = [targetEntity._id, ...childIds];
            txQuery.categoryId = { $in: categoryIds };
            ledgerTitle = `Main Head Ledger: ${targetEntity.name}`;
            entitySubtext = `All expenses under <strong>${targetEntity.name}</strong> (${childIds.length} sub-heads included)`;
          } else {
            // Sub-category selected → just that category
            txQuery.categoryId = entityId;
            const parentName = targetEntity.parentCategoryId
              ? (await Category.findById(targetEntity.parentCategoryId).select('name').lean())?.name || ''
              : '';
            ledgerTitle = `Expense Sub-Head Ledger: ${targetEntity.name}`;
            entitySubtext = parentName ? `Under Main Head: <strong>${parentName}</strong>` : `Category Type: ${targetEntity.type || 'EXPENSE'}`;
          }
        } else {
          txQuery.transactionType = 'EXPENSE';
          ledgerTitle = 'Expense Ledger';
          entitySubtext = '';
        }
      } else {
        txQuery.transactionType = 'EXPENSE';
        ledgerTitle = 'All Expenses — Consolidated Ledger';
        entitySubtext = 'All Posted Business &amp; Operational Expenses';
      }

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
        .populate({
          path: 'categoryId',
          select: 'name type isRentalHead parentCategoryId isMainHead',
          populate: { path: 'parentCategoryId', select: 'name' },
        })
        .populate('propertyId', 'propertyName plazaName')
        .populate('tenantId', 'tenantName name')
        .populate('createdBy', 'name email role')
        .lean();

      let runningExpenseSum = 0;
      ledgerEntries = transactions.map((tx) => {
        const display = resolveTransactionAccountDisplay(tx);
        runningExpenseSum = round2(runningExpenseSum + tx.amount);
        totalDebit += tx.amount;

        return {
          _id: tx._id,
          date: tx.date,
          voucherNo: tx.voucherNo,
          detail: tx.detail,
          transactionType: tx.transactionType,
          categoryName: tx.categoryId?.name || 'Expense',
          parentCategoryName: tx.categoryId?.parentCategoryId?.name || '',
          drAccount: display.dr || 'Expense Head',
          crAccount: display.cr || 'Paid From Account',
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
      const incQuery = { status: { $ne: 'REVERSED' } };

      if (entityId && entityId !== 'ALL' && mongoose.Types.ObjectId.isValid(entityId)) {
        incQuery.incomeHeadId = entityId;
        targetEntity = await OtherIncomeHead.findById(entityId).lean();
        if (targetEntity) {
          ledgerTitle = `Other Income Ledger: ${targetEntity.name}`;
          entitySubtext = `Head Code: ${targetEntity.code || 'INC'} &bull; ${targetEntity.description || 'Non-Rental Receipts'}`;
        }
      } else {
        ledgerTitle = 'Other Income Receipts Ledger';
        entitySubtext = 'All Non-Rental Operational Receipts & Miscellaneous Inflows';
      }

      if (periodStart && periodEnd) {
        incQuery.receiptDate = { $gte: periodStart, $lte: periodEnd };
      } else if (periodStart) {
        incQuery.receiptDate = { $gte: periodStart };
      } else if (periodEnd) {
        incQuery.receiptDate = { $lte: periodEnd };
      }

      if (sRegex) {
        incQuery.$or = [
          { transactionDetail: sRegex },
          { referenceNumber: sRegex },
          { receivedFrom: sRegex },
          { receiptNumber: sRegex },
          { headName: sRegex },
        ];
      }

      const incomes = await OtherIncome.find(incQuery)
        .sort({ receiptDate: 1, createdAt: 1 })
        .populate('incomeHeadId', 'name code')
        .populate('receivingAccountId', 'name type')
        .populate('propertyId', 'propertyName plazaName')
        .populate('createdBy', 'name')
        .lean();

      let runningBal = 0;
      ledgerEntries = incomes.map((inc) => {
        const amt = round2(inc.amount || 0);
        runningBal = round2(runningBal + amt);
        totalCredit += amt;

        const propertyName = inc.propertyId
          ? (inc.propertyId.propertyName || inc.propertyId.plazaName || '')
          : '';

        const headDisplay = inc.headName || inc.incomeHeadId?.name || 'Other Income';

        return {
          _id: inc._id,
          date: inc.receiptDate,
          voucherNo: inc.receiptNumber || inc.referenceNumber || `INC-${inc._id.toString().slice(-6)}`,
          detail: inc.transactionDetail || inc.description || 'Other Income Receipt',
          transactionType: 'OTHER_INCOME',
          categoryName: headDisplay,
          propertyName: propertyName,
          drAccount: inc.receivingAccountId?.name || 'Receiving Account',
          crAccount: headDisplay,
          receivedFrom: inc.receivedFrom || '',
          reference: inc.referenceNumber || '',
          debit: 0,
          credit: amt,
          amount: amt,
          balance: runningBal,
          status: inc.status || 'POSTED',
          createdBy: inc.createdBy?.name || 'System',
        };
      });

      openingBalance = 0;
      totalDebit = 0;
      totalCredit = round2(totalCredit);
      closingBalance = round2(runningBal);
    }

    let datePresetDisplay = datePreset;
    if (datePreset === 'THIS_MONTH') datePresetDisplay = 'This Month';
    else if (datePreset === 'PREVIOUS_MONTH') datePresetDisplay = 'Previous Month';
    else if (datePreset === 'TODAY') datePresetDisplay = 'Today';
    else if (datePreset === 'THIS_WEEK') datePresetDisplay = 'This Week';
    else if (datePreset === 'ALL' || datePreset === 'ALL_TIME') datePresetDisplay = 'All Time (Full History)';
    else if (datePreset === 'CUSTOM' && (startDate || endDate)) {
      datePresetDisplay = `${startDate || 'Start'} to ${endDate || 'Latest'}`;
    } else if (datePreset === 'AS_ON_DATE' && asOnDate) {
      datePresetDisplay = `As on ${asOnDate}`;
    }

    // Return unified central ledger payload
    return {
      type,
      ledgerTitle,
      entitySubtext,
      datePreset: datePresetDisplay,
      rawDatePreset: datePreset,
      summary: {
        openingBalance,
        totalDebit,
        totalCredit,
        closingBalance,
        entryCount: ledgerEntries.length,
      },
      entries: ledgerEntries,
    };
  } catch (error) {
    console.error('[Central Ledger Report Data Error]:', error);
    throw error;
  }
};

/**
 * @desc    Query Central Financial Ledger by Type & Entity
 * @route   GET /api/ledgers/query
 * @access  Private (Authenticated)
 */
export const queryLedger = async (req, res) => {
  try {
    const payload = await getLedgerReportData(req.query);
    return apiSuccess(
      res,
      payload,
      `Retrieved ledger for ${payload.ledgerTitle} with ${payload.entries.length} entries.`
    );
  } catch (error) {
    console.error('[Central Ledger Query Error]:', error);
    return apiError(res, error.message || 'Failed to query central ledger.', 500);
  }
};

/**
 * @desc    Download Official PDF for Individual Head Ledger Statement
 * @route   GET /api/ledgers/download-pdf
 * @access  Private (Authenticated)
 */
export const downloadLedgerPDF = async (req, res) => {
  try {
    const payload = await getLedgerReportData(req.query);
    const pdfBuffer = await generateLedgerPDF(payload, req.user);

    const safeTitle = (payload.ledgerTitle || 'Ledger')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);
    const filename = `Pixx_Technologies_Ledger_${safeTitle || 'Statement'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[Download Ledger PDF Error]:', error);
    return apiError(res, error.message || 'Failed to generate ledger PDF.', 500);
  }
};

/**
 * @desc    Download Official PDF for All Transactions — Central Financial Ledger
 * @route   GET /api/ledgers/download-all-transactions-pdf
 * @access  Private (Authenticated)
 */
export const downloadAllTransactionsPDF = async (req, res) => {
  try {
    const {
      month,
      startDate,
      endDate,
      search,
      voucherNo,
      categoryId,
      reportCategory,
      drAccountId,
      crAccountId,
      propertyId,
      expenseClassification,
      transactionType,
      status,
    } = req.query;

    // Fetch ALL matching transactions (no pagination limit — cap at 5000 for safety)
    const result = await getTransactionsFiltered({
      month,
      startDate,
      endDate,
      search,
      voucherNo,
      categoryId,
      reportCategory,
      drAccountId,
      crAccountId,
      propertyId,
      expenseClassification,
      transactionType,
      status,
      page: 1,
      limit: 5000,
    });

    // Build human-readable period label
    let periodLabel = 'All Records';
    if (month) {
      const [y, m] = month.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      periodLabel = `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    } else if (startDate && endDate) {
      periodLabel = `${startDate} to ${endDate}`;
    } else if (startDate) {
      periodLabel = `From ${startDate}`;
    } else if (endDate) {
      periodLabel = `Up to ${endDate}`;
    }

    // Build filter summary string
    const filterParts = [];
    if (transactionType && transactionType !== 'ALL') filterParts.push(`Type: ${transactionType}`);
    if (reportCategory && reportCategory !== 'ALL') filterParts.push(`Category: ${reportCategory}`);
    if (expenseClassification && expenseClassification !== 'ALL') filterParts.push(`Classification: ${expenseClassification}`);
    if (status && status !== 'ALL') filterParts.push(`Status: ${status}`);
    if (search) filterParts.push(`Search: "${search}"`);
    if (voucherNo) filterParts.push(`Voucher: ${voucherNo}`);

    const pdfBuffer = await generateAllTransactionsPDF(
      {
        transactions: result.transactions,
        summary: result.summary,
        totalCount: result.pagination.total,
        periodLabel,
        filterSummary: filterParts.length ? filterParts.join(' | ') : '',
      },
      req.user
    );

    const datePart = month || new Date().toISOString().slice(0, 7);
    const filename = `Pixx_Technologies_Central_Ledger_${datePart.replace(/-/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[Download All Transactions PDF Error]:', error);
    return apiError(res, error.message || 'Failed to generate transactions PDF.', 500);
  }
};

export default {
  getLedgerEntities,
  getLedgerReportData,
  queryLedger,
  downloadLedgerPDF,
  downloadAllTransactionsPDF,
};

