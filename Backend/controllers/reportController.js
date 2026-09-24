import * as XLSX from 'xlsx';
import Transaction from '../models/Transaction.js';
import Account from '../models/Account.js';
import Property from '../models/Property.js';
import Category from '../models/Category.js';
import {
  getMonthlyOpeningClosingMatrix,
  getAccountRunningLedger,
  getHeadWiseExpenseReport,
  getTransactionsFiltered,
  round2,
} from '../services/ledgerService.js';
import { generateMonthlyFundsReport } from '../services/pdfReportService.js';

// ─── Shared Helpers ────────────────────────────────────────────────────────────

/**
 * Parse "YYYY-MM" month string → { year, month, startDate, endDate, periodString }
 * Also supports custom startDate/endDate override.
 */
const parseDateFilters = ({ month, startDate: sdStr, endDate: edStr } = {}) => {
  const current = new Date();
  let year = current.getUTCFullYear();
  let mon = current.getUTCMonth() + 1;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) { year = y; mon = m; }
  }

  const periodString = `${year}-${String(mon).padStart(2, '0')}`;

  // Custom date range overrides month
  if (sdStr || edStr) {
    const startDate = sdStr ? new Date(sdStr + 'T00:00:00.000Z') : new Date(Date.UTC(year, mon - 1, 1));
    const endDate = edStr ? new Date(edStr + 'T23:59:59.999Z') : new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
    return { year, month: mon, periodString, startDate, endDate, isCustomRange: true };
  }

  return {
    year,
    month: mon,
    periodString,
    startDate: new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
    isCustomRange: false,
  };
};

/** Format date as DD-MMM-YYYY */
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(dt.getUTCDate()).padStart(2,'0')}-${months[dt.getUTCMonth()]}-${dt.getUTCFullYear()}`;
};

/** Trigger CSV download response */
const sendCSV = (res, filename, rows, headers) => {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + lines.join('\r\n')); // BOM for Excel UTF-8
};

/** Build XLSX workbook buffer from sheets array */
const buildExcel = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const { name, data, colWidths } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    if (colWidths) ws['!cols'] = colWidths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

// ─── 1. PDF (existing) ────────────────────────────────────────────────────────

/**
 * @route GET /api/reports/funds-management-pdf
 */
export const downloadFundsReportPDF = async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const pdfBuffer = await generateMonthlyFundsReport(month);
    const filename = `Pixx_Technologies_Funds_Report_${month}.pdf`;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate PDF.', error: error.message });
  }
};

// ─── 2. Monthly Financial Summary (Phase 9, existing) ─────────────────────────

/**
 * @route GET /api/reports/monthly-financial-summary
 */
export const getMonthlyFinancialSummary = async (req, res) => {
  try {
    const { year, month, periodString, startDate, endDate } = parseDateFilters(req.query);

    const matrixData = await getMonthlyOpeningClosingMatrix(year, month);
    const bankRows = matrixData.rows.filter((r) => r.accountType === 'BANK');
    const cashRows = matrixData.rows.filter((r) => r.accountType === 'CASH');
    const accountSummary = matrixData.rows.map((r) => ({
      accountId: r.accountId,
      accountName: r.accountName,
      accountType: r.accountType,
      accountNumber: r.accountNumber || '',
      openingBalance: r.openingBalance,
      totalInput: r.totalInput,
      totalOutput: r.totalOutput,
      closingBalance: r.closingBalance,
    }));
    const grandTotal = matrixData.grandTotal;

    const properties = await Property.find({}).sort({ plazaName: 1 }).lean();
    const rentTransactions = await Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'INCOME',
      reportCategory: 'Rent',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).populate('drAccountId', 'name type').lean();

    let grandTotalRentalAgreed = 0, grandTotalRentalReceived = 0, grandTotalRentalOutstanding = 0;

    const rentalByProperty = properties.map((plaza) => {
      let plazaReceived = 0, plazaAgreed = 0;
      const unitsData = (plaza.units || []).map((unit) => {
        const agreed = round2(unit.agreedRent || 0);
        const matchingTxs = rentTransactions.filter(
          (t) => t.propertyId?.toString() === plaza._id.toString() && t.unitId?.toString() === unit._id.toString()
        );
        const totalReceived = round2(matchingTxs.reduce((sum, t) => sum + t.amount, 0));
        const outstanding = round2(Math.max(0, agreed - totalReceived));
        const latestTx = matchingTxs[matchingTxs.length - 1];
        let statusBadge = 'OUTSTANDING';
        if (totalReceived >= agreed && agreed > 0) statusBadge = 'FULLY_PAID';
        else if (totalReceived > 0) statusBadge = 'PARTIALLY_PAID';
        plazaAgreed += agreed; plazaReceived += totalReceived;
        return { unitId: unit._id, unitName: unit.unitName, tenantName: unit.tenantName || 'Unassigned', agreedRent: agreed, receivedAmount: totalReceived, outstanding, receivedDate: latestTx?.date ? new Date(latestTx.date).toISOString().split('T')[0] : '-', receivingAccount: latestTx?.drAccountId?.name || '-', statusBadge };
      });
      plazaAgreed = round2(plazaAgreed); plazaReceived = round2(plazaReceived);
      const plazaOutstanding = round2(Math.max(0, plazaAgreed - plazaReceived));
      const collectionRate = plazaAgreed > 0 ? Math.round((plazaReceived / plazaAgreed) * 100) : 0;
      grandTotalRentalAgreed += plazaAgreed; grandTotalRentalReceived += plazaReceived; grandTotalRentalOutstanding += plazaOutstanding;
      return { plazaId: plaza._id, plazaName: plaza.plazaName, location: plaza.location || '', unitsCount: (plaza.units || []).length, agreedRent: plazaAgreed, receivedAmount: plazaReceived, outstanding: plazaOutstanding, collectionRate, units: unitsData };
    });

    grandTotalRentalAgreed = round2(grandTotalRentalAgreed);
    grandTotalRentalReceived = round2(grandTotalRentalReceived);
    grandTotalRentalOutstanding = round2(grandTotalRentalOutstanding);
    const rentalCollectionRate = grandTotalRentalAgreed > 0 ? Math.round((grandTotalRentalReceived / grandTotalRentalAgreed) * 100) : 0;

    const otherIncomeTxns = await Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'INCOME',
      reportCategory: 'Other Income',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).populate('categoryId', 'name').lean();
    const otherIncomeByHead = new Map();
    let totalOtherIncome = 0;
    for (const tx of otherIncomeTxns) {
      const headName = tx.categoryId?.name || 'Other Income';
      const amt = round2(tx.amount);
      otherIncomeByHead.set(headName, round2((otherIncomeByHead.get(headName) || 0) + amt));
      totalOtherIncome = round2(totalOtherIncome + amt);
    }

    const expenseReport = await getHeadWiseExpenseReport(year, month);
    const totalExpenses = round2(expenseReport.totalExpensesOverall);
    const expenseHeadSummary = expenseReport.heads.filter((h) => h.totalSpent > 0).map((h) => ({ headName: h.headName, totalSpent: h.totalSpent, transactionCount: h.transactionCount }));

    const totalIncome = round2(grandTotalRentalReceived + totalOtherIncome);
    const netSurplusDeficit = round2(totalIncome - totalExpenses);
    const totalBankBalance = round2(bankRows.reduce((sum, r) => sum + r.closingBalance, 0));
    const totalCashBalance = round2(cashRows.reduce((sum, r) => sum + r.closingBalance, 0));
    const grandClosingBalance = round2(totalBankBalance + totalCashBalance);

    const transferTxns = await Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'TRANSFER',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).lean();
    const totalTransfers = round2(transferTxns.reduce((sum, t) => sum + t.amount, 0));

    return res.status(200).json({
      success: true, period: periodString,
      accountMatrix: { accounts: accountSummary, bankRows, cashRows, grandTotal, totalBankBalance, totalCashBalance, grandClosingBalance },
      rentalIncomeSummary: { grandTotalAgreed: grandTotalRentalAgreed, grandTotalReceived: grandTotalRentalReceived, grandTotalOutstanding: grandTotalRentalOutstanding, collectionRate: rentalCollectionRate, properties: rentalByProperty },
      otherIncomeSummary: { totalOtherIncome, breakdown: Array.from(otherIncomeByHead.entries()).map(([head, amount]) => ({ head, amount })), transactionCount: otherIncomeTxns.length },
      expenseSummary: {
        totalExpenses,
        ...expenseReport.classificationTotals,
        heads: expenseHeadSummary,
      },
      financialPosition: { totalRentalIncome: grandTotalRentalReceived, totalOtherIncome, totalIncome, totalExpenses, netSurplusDeficit, totalTransfers, grandClosingBalance },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate monthly financial summary.', error: error.message });
  }
};

// ─── 3. Account Ledger Report ────────────────────────────────────────────────

/**
 * @desc    Get running balance ledger for a specific account with date range support
 * @route   GET /api/reports/account-ledger/:accountId
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getAccountLedgerReport = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate, periodString } = parseDateFilters(req.query);

    const ledger = await getAccountRunningLedger(accountId, startDate, endDate);

    return res.status(200).json({
      success: true,
      period: periodString,
      account: ledger.account,
      openingBalance: ledger.previousBalance,
      totalDebits: ledger.totalDebits,
      totalCredits: ledger.totalCredits,
      closingBalance: ledger.closingBalance,
      entries: ledger.entries,
      reconciliation: {
        ledgerClosingBalance: ledger.closingBalance,
        liveAccountBalance: round2(ledger.account.currentBalance),
        isReconciled: Math.abs(ledger.closingBalance - ledger.account.currentBalance) < 0.01,
        discrepancy: round2(Math.abs(ledger.closingBalance - ledger.account.currentBalance)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate account ledger.', error: error.message });
  }
};

// ─── 4. Expense Summary Report ────────────────────────────────────────────────

/**
 * @desc    Head-wise expense summary with optional property filter and date range
 * @route   GET /api/reports/expense-summary
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getExpenseSummaryReport = async (req, res) => {
  try {
    const { year, month, periodString, startDate, endDate } = parseDateFilters(req.query);
    const { propertyId, expenseClassification } = req.query;

    const report = await getHeadWiseExpenseReport(year, month);

    // Property filter: if propertyId supplied, re-run targeted query
    let filteredHeads = report.heads;
    let filteredTotal = report.totalExpensesOverall;
    let classificationTotals = report.classificationTotals;

    if ((propertyId && propertyId !== 'ALL') || (expenseClassification && expenseClassification !== 'ALL')) {
      // Re-query transactions filtered by property
      const expenseCats = await Category.find({ type: 'EXPENSE' }).lean();
      const txns = await Transaction.find({
        date: { $gte: startDate, $lte: endDate },
        categoryId: { $in: expenseCats.map((c) => c._id) },
        ...(propertyId && propertyId !== 'ALL' ? { propertyId } : {}),
        ...(expenseClassification && expenseClassification !== 'ALL' ? { expenseClassification } : {}),
      }).populate('categoryId', 'name type isRentalHead').lean();

      const headMap = new Map();
      filteredTotal = 0;
      for (const tx of txns) {
        const catName = tx.categoryId?.name || 'Unknown';
        const amt = round2(tx.amount);
        filteredTotal = round2(filteredTotal + amt);
        if (!headMap.has(catName)) headMap.set(catName, { headName: catName, totalSpent: 0, transactionCount: 0 });
        const h = headMap.get(catName);
        h.totalSpent = round2(h.totalSpent + amt);
        h.transactionCount += 1;
      }
      filteredHeads = Array.from(headMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
      classificationTotals = txns.reduce((totals, tx) => {
        const classification = tx.expenseClassification
          || (tx.unitId ? 'UNIT_EXPENSE' : tx.propertyId ? 'PROPERTY_OWN_EXPENSE' : 'GENERAL_EXPENSE');
        if (classification === 'GENERAL_EXPENSE') totals.generalExpenses += tx.amount;
        if (classification === 'PROPERTY_OWN_EXPENSE') totals.propertyOwnExpenses += tx.amount;
        if (classification === 'UNIT_EXPENSE') totals.unitExpenses += tx.amount;
        return totals;
      }, { generalExpenses: 0, propertyOwnExpenses: 0, unitExpenses: 0 });
    }

    // Property names for filter UI
    const properties = await Property.find({}, { plazaName: 1, _id: 1 }).lean();

    return res.status(200).json({
      success: true,
      period: periodString,
      propertyFilter: propertyId || 'ALL',
      totalExpenses: filteredTotal,
      ...classificationTotals,
      heads: filteredHeads.filter((h) => h.totalSpent > 0),
      properties,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate expense summary.', error: error.message });
  }
};

// ─── 5. Property-wise Expense Report ─────────────────────────────────────────

/**
 * @desc    Expenses grouped by Property → Expense Head
 * @route   GET /api/reports/property-expense
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getPropertyExpenseReport = async (req, res) => {
  try {
    const { year, month, periodString, startDate, endDate } = parseDateFilters(req.query);
    const { propertyId } = req.query;

    const expenseCats = await Category.find({ type: 'EXPENSE' }).lean();
    const catMap = new Map(expenseCats.map((c) => [c._id.toString(), c]));

    const query = {
      date: { $gte: startDate, $lte: endDate },
      categoryId: { $in: expenseCats.map((c) => c._id) },
      propertyId: { $ne: null },
    };
    if (propertyId && propertyId !== 'ALL') query.propertyId = propertyId;

    const txns = await Transaction.find(query)
      .populate('categoryId', 'name type')
      .populate('propertyId', 'plazaName location')
      .lean();

    // General (non-property) expenses
    const generalQuery = {
      date: { $gte: startDate, $lte: endDate },
      categoryId: { $in: expenseCats.map((c) => c._id) },
      propertyId: null,
    };
    const generalTxns = propertyId && propertyId !== 'ALL' ? [] : await Transaction.find(generalQuery).populate('categoryId', 'name').lean();

    const propertyMap = new Map();
    let grandTotal = 0;

    for (const tx of txns) {
      const pid = tx.propertyId?._id?.toString() || 'general';
      const pName = tx.propertyId?.plazaName || 'General';
      const catName = tx.categoryId?.name || 'Unknown';
      const amt = round2(tx.amount);
      grandTotal = round2(grandTotal + amt);

      if (!propertyMap.has(pid)) {
        propertyMap.set(pid, { propertyId: pid, propertyName: pName, location: tx.propertyId?.location || '', totalSpent: 0, heads: new Map() });
      }
      const prop = propertyMap.get(pid);
      prop.totalSpent = round2(prop.totalSpent + amt);
      if (!prop.heads.has(catName)) prop.heads.set(catName, { headName: catName, totalSpent: 0, count: 0 });
      const head = prop.heads.get(catName);
      head.totalSpent = round2(head.totalSpent + amt);
      head.count += 1;
    }

    // Add general (non-property) as a "General / Company" bucket
    let generalTotal = 0;
    if (generalTxns.length > 0) {
      const genHeads = new Map();
      for (const tx of generalTxns) {
        const catName = tx.categoryId?.name || 'Unknown';
        const amt = round2(tx.amount);
        generalTotal = round2(generalTotal + amt);
        grandTotal = round2(grandTotal + amt);
        if (!genHeads.has(catName)) genHeads.set(catName, { headName: catName, totalSpent: 0, count: 0 });
        const h = genHeads.get(catName);
        h.totalSpent = round2(h.totalSpent + amt);
        h.count += 1;
      }
      propertyMap.set('general', { propertyId: 'general', propertyName: 'General / Company Expenses', location: '', totalSpent: generalTotal, heads: genHeads });
    }

    const propertyList = Array.from(propertyMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((p) => ({
        ...p,
        heads: Array.from(p.heads.values()).sort((a, b) => b.totalSpent - a.totalSpent),
      }));

    const properties = await Property.find({}, { plazaName: 1, _id: 1 }).lean();

    return res.status(200).json({
      success: true,
      period: periodString,
      grandTotal,
      propertyFilter: propertyId || 'ALL',
      properties: propertyList,
      availableProperties: properties,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate property expense report.', error: error.message });
  }
};

// ─── 6. All Transactions Report ───────────────────────────────────────────────

/**
 * @desc    Filtered all-transactions report (wraps existing getTransactionsFiltered)
 * @route   GET /api/reports/all-transactions
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getAllTransactionsReport = async (req, res) => {
  try {
    const result = await getTransactionsFiltered(req.query);

    // Audit log: who ran the report
    console.log(`[REPORT AUDIT] all-transactions by ${req.user?.name} (${req.user?.email}) at ${new Date().toISOString()}`);

    return res.status(200).json({
      success: true,
      auditInfo: { generatedBy: req.user?.name, generatedAt: new Date().toISOString(), filters: req.query },
      ...result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate transactions report.', error: error.message });
  }
};

// ─── 7. Reconciliation Report ────────────────────────────────────────────────

/**
 * @desc    Reconciliation check — ledger computed balance vs live account balance
 * @route   GET /api/reports/reconciliation
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getReconciliationReport = async (req, res) => {
  try {
    const { periodString, startDate, endDate } = parseDateFilters(req.query);

    const accounts = await Account.find({ isActive: true, isClearing: { $ne: true } })
      .sort({ type: 1, name: 1 }).lean();

    const results = await Promise.all(
      accounts.map(async (acc) => {
        const ledger = await getAccountRunningLedger(acc._id.toString(), startDate, endDate);
        const diff = round2(Math.abs(ledger.closingBalance - acc.currentBalance));
        return {
          accountId: acc._id,
          accountName: acc.name,
          accountType: acc.type,
          openingBalance: ledger.previousBalance,
          totalDebits: ledger.totalDebits,
          totalCredits: ledger.totalCredits,
          ledgerClosingBalance: ledger.closingBalance,
          liveBalance: round2(acc.currentBalance),
          discrepancy: diff,
          isReconciled: diff < 0.01,
          status: diff < 0.01 ? 'OK' : 'DISCREPANCY',
        };
      })
    );

    const totalDiscrepancies = results.filter((r) => !r.isReconciled).length;
    const grandLedgerTotal = round2(results.reduce((s, r) => s + r.ledgerClosingBalance, 0));
    const grandLiveTotal = round2(results.reduce((s, r) => s + r.liveBalance, 0));

    return res.status(200).json({
      success: true,
      period: periodString,
      summary: {
        totalAccounts: results.length,
        reconciledCount: results.length - totalDiscrepancies,
        discrepancyCount: totalDiscrepancies,
        grandLedgerTotal,
        grandLiveTotal,
        grandDiscrepancy: round2(Math.abs(grandLedgerTotal - grandLiveTotal)),
        isFullyReconciled: totalDiscrepancies === 0,
      },
      accounts: results,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate reconciliation report.', error: error.message });
  }
};

// ─── 8. Excel Export ──────────────────────────────────────────────────────────

/**
 * @desc    Generate Excel export for various report types
 * @route   GET /api/reports/export/excel?type=account-ledger|expense-summary|property-expense|all-transactions|rental-income
 * @access  Private (ADMIN_PUBLISHER)
 */
export const exportExcel = async (req, res) => {
  try {
    const { type = 'all-transactions', accountId, propertyId } = req.query;
    const { year, month, periodString, startDate, endDate } = parseDateFilters(req.query);

    console.log(`[EXPORT AUDIT] Excel/${type} by ${req.user?.name} at ${new Date().toISOString()} | period=${periodString}`);

    let sheets = [];
    let filename = `Pixx_${type}_${periodString}.xlsx`;

    // ── Account Ledger ──────────────────────────────────────────────────────
    if (type === 'account-ledger' && accountId) {
      const ledger = await getAccountRunningLedger(accountId, startDate, endDate);
      const acc = ledger.account;
      filename = `Pixx_Ledger_${acc.name.replace(/\s+/g, '_')}_${periodString}.xlsx`;

      const headerRows = [
        ['PIXX TECHNOLOGIES — ACCOUNT LEDGER STATEMENT'],
        [`Account: ${acc.name}`, '', '', `Type: ${acc.type}`, '', '', `Period: ${periodString}`],
        [`Account No: ${acc.accountNumber || 'N/A'}`, '', '', `Opening Balance: Rs. ${ledger.previousBalance.toLocaleString()}`, '', '', `Generated: ${fmtDate(new Date())}`],
        [],
        ['Date', 'V.N', 'Description', 'Category', 'Contra Account', 'Debit (Rs.)', 'Credit (Rs.)', 'Balance (Rs.)'],
        ['', '', 'OPENING BALANCE B/F', '', '', '', '', ledger.previousBalance],
      ];

      const dataRows = ledger.entries.map((e) => [
        fmtDate(e.date),
        e.voucherNo || '',
        e.detail || '',
        e.category || '',
        e.counterpartyAccount || '',
        e.drAmount > 0 ? e.drAmount : '',
        e.crAmount > 0 ? e.crAmount : '',
        e.runningBalance,
      ]);

      const footerRows = [
        [],
        ['', '', 'PERIOD TOTALS', '', '', ledger.totalDebits, ledger.totalCredits, ledger.closingBalance],
        ['', '', 'CLOSING BALANCE C/F', '', '', '', '', ledger.closingBalance],
      ];

      sheets.push({
        name: 'Account Ledger',
        data: [...headerRows, ...dataRows, ...footerRows],
        colWidths: [14, 10, 40, 22, 28, 16, 16, 18],
      });
    }

    // ── Expense Summary ──────────────────────────────────────────────────────
    else if (type === 'expense-summary') {
      const report = await getHeadWiseExpenseReport(year, month);
      filename = `Pixx_Expense_Summary_${periodString}.xlsx`;

      const headerRows = [
        ['PIXX TECHNOLOGIES — HEAD-WISE EXPENSE SUMMARY'],
        [`Period: ${periodString}`, '', `Generated: ${fmtDate(new Date())}`],
        [],
        ['#', 'Expense Head', 'Voucher Count', 'Amount (Rs.)'],
      ];

      const headsWithData = report.heads.filter((h) => h.totalSpent > 0);
      const dataRows = headsWithData.map((h, i) => [i + 1, h.headName, h.transactionCount, h.totalSpent]);
      const footerRows = [
        [],
        ['', 'TOTAL EXPENSES', headsWithData.reduce((s, h) => s + h.transactionCount, 0), report.totalExpensesOverall],
      ];

      sheets.push({
        name: 'Expense Summary',
        data: [...headerRows, ...dataRows, ...footerRows],
        colWidths: [6, 40, 16, 18],
      });

      // Detailed transactions per head
      for (const head of headsWithData) {
        const headTxns = await Transaction.find({
          date: { $gte: startDate, $lte: endDate },
          categoryId: (await Category.findOne({ name: head.headName, type: 'EXPENSE' })?._id) ? await Category.findOne({ name: head.headName, type: 'EXPENSE' }).then((c) => c._id) : null,
        }).populate('drAccountId', 'name').populate('crAccountId', 'name').populate('propertyId', 'plazaName').lean();

        if (headTxns.length === 0) continue;

        const sheetRows = [
          [`${head.headName} — Expense Detail`],
          [`Period: ${periodString}`],
          [],
          ['Date', 'V.N', 'Description', 'Paid From', 'Property', 'Amount (Rs.)'],
          ...headTxns.map((t) => [fmtDate(t.date), t.voucherNo, t.detail, t.crAccountId?.name || '', t.propertyId?.plazaName || '', t.amount]),
          [],
          ['', '', 'Total', '', '', head.totalSpent],
        ];

        sheets.push({
          name: head.headName.substring(0, 31),
          data: sheetRows,
          colWidths: [14, 10, 40, 24, 24, 18],
        });
      }
    }

    // ── Property Expense ─────────────────────────────────────────────────────
    else if (type === 'property-expense') {
      const expenseCats = await Category.find({ type: 'EXPENSE' }).lean();
      const txns = await Transaction.find({
        date: { $gte: startDate, $lte: endDate },
        categoryId: { $in: expenseCats.map((c) => c._id) },
      }).populate('categoryId', 'name').populate('propertyId', 'plazaName').lean();

      filename = `Pixx_Property_Expense_${periodString}.xlsx`;

      const propertyMap = new Map();
      for (const tx of txns) {
        const pName = tx.propertyId?.plazaName || 'General / Company';
        const catName = tx.categoryId?.name || 'Unknown';
        if (!propertyMap.has(pName)) propertyMap.set(pName, { total: 0, heads: new Map() });
        const p = propertyMap.get(pName);
        p.total = round2(p.total + tx.amount);
        if (!p.heads.has(catName)) p.heads.set(catName, 0);
        p.heads.set(catName, round2(p.heads.get(catName) + tx.amount));
      }

      const headerRows = [
        ['PIXX TECHNOLOGIES — PROPERTY-WISE EXPENSE REPORT'],
        [`Period: ${periodString}`, '', `Generated: ${fmtDate(new Date())}`],
        [],
        ['Property', 'Expense Head', 'Amount (Rs.)'],
      ];

      const dataRows = [];
      let grandT = 0;
      for (const [pName, pd] of Array.from(propertyMap.entries()).sort((a, b) => b[1].total - a[1].total)) {
        grandT = round2(grandT + pd.total);
        for (const [hName, hAmt] of Array.from(pd.heads.entries()).sort((a, b) => b[1] - a[1])) {
          dataRows.push([pName, hName, hAmt]);
        }
        dataRows.push(['', `${pName} Subtotal`, pd.total]);
        dataRows.push([]);
      }
      dataRows.push(['', 'GRAND TOTAL', grandT]);

      sheets.push({
        name: 'Property Expenses',
        data: [...headerRows, ...dataRows],
        colWidths: [30, 36, 18],
      });
    }

    // ── All Transactions ──────────────────────────────────────────────────────
    else if (type === 'all-transactions') {
      const result = await getTransactionsFiltered({ ...req.query, limit: 5000 });
      filename = `Pixx_All_Transactions_${periodString}.xlsx`;

      const getExpenseClassificationLabel = (cls) => {
        if (cls === 'GENERAL_EXPENSE') return 'General Expense';
        if (cls === 'PROPERTY_OWN_EXPENSE') return 'Property Own Expense';
        if (cls === 'UNIT_EXPENSE') return 'Unit Expense';
        return '—';
      };

      const headerRows = [
        ['PIXX TECHNOLOGIES — ALL TRANSACTIONS REPORT'],
        [`Period: ${periodString}`, '', '', `Generated by: ${req.user?.name}`, '', '', `Generated: ${fmtDate(new Date())}`],
        [],
        ['Date', 'V.N', 'Description', 'Category', 'Expense Type', 'Type', 'Dr. Account', 'Cr. Account', 'Amount (Rs.)', 'Property', 'Unit', 'Status'],
      ];

      const dataRows = result.transactions.map((tx) => {
        let unitLabel = '';
        if (tx.propertyId?.units && tx.unitId) {
          const u = tx.propertyId.units.find((unit) => unit._id?.toString() === tx.unitId.toString());
          if (u) unitLabel = u.unitName || u.unitNumber || '';
        }
        return [
          fmtDate(tx.date),
          tx.voucherNo || '',
          tx.detail || '',
          tx.categoryId?.name || '',
          getExpenseClassificationLabel(tx.expenseClassification),
          tx.transactionType || '',
          tx.drAccountId?.name || '',
          tx.crAccountId?.name || '',
          tx.amount,
          tx.propertyId?.plazaName || '',
          unitLabel,
          tx.status || '',
        ];
      });

      const summary = result.summary;
      const footerRows = [
        [],
        ['SUMMARY', '', '', '', '', '', '', '', '', '', '', ''],
        ['Total Rental Income', '', '', '', '', '', '', '', summary.totalRentalIncome, '', '', ''],
        ['Total Other Income', '', '', '', '', '', '', '', summary.totalOtherIncome, '', '', ''],
        ['Total Expenses', '', '', '', '', '', '', '', round2(summary.totalRentalExpenses + summary.totalOtherExpenses), '', '', ''],
        ['Total Transfers', '', '', '', '', '', '', '', summary.totalTransfers, '', '', ''],
        ['Grand Total (Line Sum)', '', '', '', '', '', '', '', summary.filteredLineTotal, '', '', ''],
      ];

      sheets.push({
        name: 'All Transactions',
        data: [...headerRows, ...dataRows, ...footerRows],
        colWidths: [14, 10, 42, 24, 20, 14, 24, 24, 16, 22, 16, 12],
      });
    }

    // ── Rental Income Summary ─────────────────────────────────────────────────
    else if (type === 'rental-income') {
      const properties = await Property.find({}).sort({ plazaName: 1 }).lean();
      const rentTxns = await Transaction.find({
        date: { $gte: startDate, $lte: endDate },
        transactionType: 'INCOME', reportCategory: 'Rent',
      }).populate('drAccountId', 'name').lean();

      filename = `Pixx_Rental_Income_${periodString}.xlsx`;

      const headerRows = [
        ['PIXX TECHNOLOGIES — RENTAL INCOME SUMMARY'],
        [`Period: ${periodString}`, '', `Generated: ${fmtDate(new Date())}`],
        [],
        ['Property', 'Unit', 'Tenant', 'Agreed Rent (Rs.)', 'Received (Rs.)', 'Outstanding (Rs.)', 'Status'],
      ];

      const dataRows = [];
      let grandAgreed = 0, grandReceived = 0;

      for (const plaza of properties) {
        for (const unit of (plaza.units || [])) {
          const agreed = round2(unit.agreedRent || 0);
          const matchTxs = rentTxns.filter(
            (t) => t.propertyId?.toString() === plaza._id.toString() && t.unitId?.toString() === unit._id.toString()
          );
          const received = round2(matchTxs.reduce((s, t) => s + t.amount, 0));
          const outstanding = round2(Math.max(0, agreed - received));
          const status = received >= agreed && agreed > 0 ? 'FULLY_PAID' : received > 0 ? 'PARTIALLY_PAID' : 'OUTSTANDING';
          grandAgreed += agreed; grandReceived += received;
          dataRows.push([plaza.plazaName, unit.unitName, unit.tenantName || 'Unassigned', agreed, received, outstanding, status]);
        }
      }
      dataRows.push([], ['TOTAL', '', '', round2(grandAgreed), round2(grandReceived), round2(Math.max(0, grandAgreed - grandReceived)), '']);

      sheets.push({
        name: 'Rental Income',
        data: [...headerRows, ...dataRows],
        colWidths: [28, 20, 26, 18, 18, 18, 16],
      });
    }

    if (sheets.length === 0) {
      return res.status(400).json({ success: false, message: `Unknown export type: ${type}` });
    }

    const buffer = buildExcel(sheets);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Excel export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate Excel export.', error: error.message });
  }
};

// ─── 9. CSV Export ────────────────────────────────────────────────────────────

/**
 * @desc    Generate CSV export for various report types
 * @route   GET /api/reports/export/csv?type=account-ledger|expense-summary|all-transactions
 * @access  Private (ADMIN_PUBLISHER)
 */
export const exportCSV = async (req, res) => {
  try {
    const { type = 'all-transactions', accountId } = req.query;
    const { year, month, periodString, startDate, endDate } = parseDateFilters(req.query);

    console.log(`[EXPORT AUDIT] CSV/${type} by ${req.user?.name} at ${new Date().toISOString()} | period=${periodString}`);

    if (type === 'account-ledger' && accountId) {
      const ledger = await getAccountRunningLedger(accountId, startDate, endDate);
      const openingRow = {
        Date: '',
        'V.N': '',
        Description: 'OPENING BALANCE B/F',
        Category: '',
        'Contra Account': '',
        'Debit (Rs.)': '',
        'Credit (Rs.)': '',
        'Balance (Rs.)': ledger.previousBalance,
        Status: 'B/F',
      };
      const rows = [
        openingRow,
        ...ledger.entries.map((e) => ({
          Date: fmtDate(e.date),
          'V.N': e.voucherNo || '',
          Description: e.detail || '',
          Category: e.category || '',
          'Contra Account': e.counterpartyAccount || '',
          'Debit (Rs.)': e.drAmount > 0 ? e.drAmount : '',
          'Credit (Rs.)': e.crAmount > 0 ? e.crAmount : '',
          'Balance (Rs.)': e.runningBalance,
          Status: e.status || '',
        })),
        {
          Date: '',
          'V.N': '',
          Description: 'CLOSING BALANCE C/F',
          Category: '',
          'Contra Account': '',
          'Debit (Rs.)': ledger.totalDebits,
          'Credit (Rs.)': ledger.totalCredits,
          'Balance (Rs.)': ledger.closingBalance,
          Status: 'C/F',
        },
      ];
      return sendCSV(res, `Pixx_Ledger_${periodString}.csv`, rows, [
        'Date',
        'V.N',
        'Description',
        'Category',
        'Contra Account',
        'Debit (Rs.)',
        'Credit (Rs.)',
        'Balance (Rs.)',
        'Status',
      ]);
    }

    if (type === 'expense-summary') {
      const report = await getHeadWiseExpenseReport(year, month);
      const rows = report.heads.filter((h) => h.totalSpent > 0).map((h, i) => ({
        '#': i + 1,
        'Expense Head': h.headName,
        'Voucher Count': h.transactionCount,
        'Amount (Rs.)': h.totalSpent,
      }));
      rows.push({ '#': '', 'Expense Head': 'TOTAL', 'Voucher Count': '', 'Amount (Rs.)': report.totalExpensesOverall });
      return sendCSV(res, `Pixx_Expenses_${periodString}.csv`, rows, ['#', 'Expense Head', 'Voucher Count', 'Amount (Rs.)']);
    }

    // Default: all-transactions
    const result = await getTransactionsFiltered({ ...req.query, limit: 5000 });
    const rows = result.transactions.map((tx) => ({
      Date: fmtDate(tx.date),
      'V.N': tx.voucherNo || '',
      Description: tx.detail || '',
      Category: tx.categoryId?.name || '',
      Type: tx.transactionType || '',
      'Dr. Account': tx.drAccountId?.name || '',
      'Cr. Account': tx.crAccountId?.name || '',
      'Amount (Rs.)': tx.amount,
      Property: tx.propertyId?.plazaName || '',
      'Expense Type': tx.expenseClassification
        || (tx.unitId ? 'UNIT_EXPENSE' : tx.propertyId ? 'PROPERTY_OWN_EXPENSE' : 'GENERAL_EXPENSE'),
      Unit: tx.unitId || '',
      Status: tx.status || '',
    }));
    return sendCSV(res, `Pixx_Transactions_${periodString}.csv`, rows, ['Date', 'V.N', 'Description', 'Category', 'Type', 'Dr. Account', 'Cr. Account', 'Amount (Rs.)', 'Property', 'Expense Type', 'Unit', 'Status']);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate CSV export.', error: error.message });
  }
};

export default {
  downloadFundsReportPDF,
  getMonthlyFinancialSummary,
  getAccountLedgerReport,
  getExpenseSummaryReport,
  getPropertyExpenseReport,
  getAllTransactionsReport,
  getReconciliationReport,
  exportExcel,
  exportCSV,
};
