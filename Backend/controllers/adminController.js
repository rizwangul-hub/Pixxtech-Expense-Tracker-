import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Account from '../models/Account.js';
import Property from '../models/Property.js';
import Category from '../models/Category.js';
import MonthlyReport from '../models/MonthlyReport.js';
import {
  getMonthlyOpeningClosingMatrix,
  getAccountRunningLedger,
  getHeadWiseExpenseReport,
  syncAccountBalances,
  round2,
} from '../services/ledgerService.js';

/**
 * Helper to parse month query (defaults to current month)
 */
const parseMonthQuery = (monthStr) => {
  const current = new Date();
  let year = current.getUTCFullYear();
  let month = current.getUTCMonth() + 1; // 1-12

  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }

  const periodString = `${year}-${String(month).padStart(2, '0')}`;
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return { year, month, periodString, startDate, endDate };
};

/**
 * @desc    Get macro financial figures and opening/closing matrix table
 * @route   GET /api/admin/financial-at-a-glance
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getFinancialAtAGlance = async (req, res) => {
  try {
    const { year, month, periodString, startDate, endDate } = parseMonthQuery(req.query.month);

    // 1. Get Live Cash & Bank Monthly Matrix
    const matrixData = await getMonthlyOpeningClosingMatrix(year, month);
    const { grandTotal, rows } = matrixData;

    // 2. Macro Financial Indicators
    const totalRentalIncomeReceived = grandTotal.rentalIncome;
    const totalOtherReceipts = grandTotal.otherInput;
    const totalAmountAvailable = round2(totalRentalIncomeReceived + totalOtherReceipts);
    const totalNetExpenses = grandTotal.totalOutput;
    const closingAvailableBalance = grandTotal.closingBalance;
    const netPosition = round2(totalAmountAvailable - totalNetExpenses);

    // 3. Audit Verification Statistics for the period (excluding reversed/void)
    const activeQuery = {
      date: { $gte: startDate, $lte: endDate },
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    };
    const totalVouchers = await Transaction.countDocuments(activeQuery);
    const verifiedVouchers = await Transaction.countDocuments({
      ...activeQuery,
      status: 'VERIFIED',
    });
    const pendingVouchers = await Transaction.countDocuments({
      ...activeQuery,
      status: 'PENDING',
    });
    const reversedVouchers = await Transaction.countDocuments({
      date: { $gte: startDate, $lte: endDate },
      status: 'REVERSED',
    });

    return res.status(200).json({
      success: true,
      period: periodString,
      macro: {
        totalRentalIncomeReceived,
        totalOtherReceipts,
        totalAmountAvailable,
        totalNetExpenses,
        closingAvailableBalance,
        netPosition,
      },
      audit: {
        totalVouchers,
        verifiedVouchers,
        pendingVouchers,
        reversedVouchers,
        auditPercentage: totalVouchers > 0 ? Math.round((verifiedVouchers / totalVouchers) * 100) : 100,
        auditedBy: req.user.name,
      },
      matrix: {
        rows,
        grandTotal,
      },
    });
  } catch (error) {
    console.error('Error in getFinancialAtAGlance:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate financial overview.',
      error: error.message,
    });
  }
};

/**
 * @desc    Get master general journal transactions with filters and pagination
 * @route   GET /api/admin/master-ledger
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getMasterLedger = async (req, res) => {
  try {
    const { month, accountId, categoryId, status, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const { startDate, endDate } = parseMonthQuery(month);
      query.date = { $gte: startDate, $lte: endDate };
    }

    if (accountId) {
      query.$or = [{ drAccountId: accountId }, { crAccountId: accountId }];
    }

    if (categoryId) {
      query.categoryId = categoryId;
    }

    if (status === 'PENDING') {
      query.status = 'PENDING';
    } else if (status === 'VERIFIED') {
      query.status = 'VERIFIED';
    } else if (status === 'REVERSED') {
      query.status = 'REVERSED';
    } else if (status === 'ALL_INCLUDING_REVERSED') {
      // Return all without status filter
    } else {
      // By default, exclude reversed and void transactions from active ledger
      query.status = { $nin: ['REVERSED', 'VOID'] };
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { voucherNo: { $regex: s, $options: 'i' } },
        { detail: { $regex: s, $options: 'i' } },
        { checkedBy: { $regex: s, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [totalCount, transactions] = await Promise.all([
      Transaction.countDocuments(query),
      Transaction.find(query)
        .populate('categoryId', 'name type isRentalHead')
        .populate('drAccountId', 'name type currentBalance')
        .populate('crAccountId', 'name type currentBalance')
        .populate('propertyId', 'plazaName')
        .populate('createdBy', 'name email role')
        .sort({ date: -1, voucherNo: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    // Compute total sum of filtered transactions
    const sumResult = await Transaction.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalAmount = sumResult.length > 0 ? round2(sumResult[0].total) : 0;

    return res.status(200).json({
      success: true,
      pagination: {
        total: totalCount,
        page: pageNum,
        pages: Math.ceil(totalCount / limitNum),
        limit: limitNum,
      },
      totalAmount,
      transactions,
    });
  } catch (error) {
    console.error('Error in getMasterLedger:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve master ledger entries.',
      error: error.message,
    });
  }
};

/**
 * @desc    Verify transaction and stamp with "Checked By [Admin]"
 * @route   PATCH /api/admin/transactions/:id/verify
 * @access  Private (ADMIN_PUBLISHER)
 */
export const verifyTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    tx.status = 'VERIFIED';
    tx.checkedBy = req.user.name; // e.g. 'Fahad Sb'
    tx.verifiedBy = req.user._id;
    tx.verifiedAt = new Date();
    await tx.save();

    const populated = await Transaction.findById(id)
      .populate('categoryId', 'name type')
      .populate('drAccountId', 'name type')
      .populate('crAccountId', 'name type')
      .populate('propertyId', 'plazaName')
      .populate('verifiedBy', 'name email');

    return res.status(200).json({
      success: true,
      message: `Voucher #${tx.voucherNo} verified and stamped by ${req.user.name}.`,
      transaction: populated,
    });
  } catch (error) {
    console.error('Error in verifyTransaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify transaction.',
      error: error.message,
    });
  }
};

/**
 * @desc    Master update transaction with atomic balance re-calculation
 * @route   PUT /api/admin/transactions/:id
 * @access  Private (ADMIN_PUBLISHER)
 */
export const updateTransactionMaster = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      date,
      voucherNo,
      detail,
      categoryId,
      drAccountId,
      crAccountId,
      amount,
      propertyId,
      unitId,
      rentMonth,
      status,
      checkedBy,
    } = req.body;

    const tx = await Transaction.findById(id);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    // Part 27: Published Report Lock Check
    const txDate = tx.date ? new Date(tx.date) : new Date();
    const txMonth = `${txDate.getUTCFullYear()}-${String(txDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const isLocked = await MonthlyReport.findOne({ month: txMonth, status: 'PUBLISHED' }).lean();
    if (isLocked) {
      return res.status(403).json({
        success: false,
        message: `Financial period ${txMonth} is officially PUBLISHED and locked. Transactions cannot be modified.`,
      });
    }

    const oldDrId = tx.drAccountId.toString();
    const oldCrId = tx.crAccountId.toString();
    const oldAmount = round2(tx.amount);

    const newDrId = drAccountId ? drAccountId.toString() : oldDrId;
    const newCrId = crAccountId ? crAccountId.toString() : oldCrId;
    const newAmount = amount !== undefined ? round2(amount) : oldAmount;

    if (newDrId === newCrId) {
      return res.status(400).json({
        success: false,
        message: 'Debit and Credit accounts cannot be identical.',
      });
    }

    if (newAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Transaction amount must be strictly greater than 0.',
      });
    }

    // Update fields
    if (date) tx.date = new Date(date);
    if (voucherNo) tx.voucherNo = voucherNo.trim();
    if (detail) tx.detail = detail.trim();
    if (categoryId) {
      const category = await Category.findById(categoryId).lean();
      if (!category) {
        return res.status(400).json({ success: false, message: 'Selected account head was not found.' });
      }
      tx.categoryId = categoryId;
      if (tx.transactionType === 'EXPENSE') {
        tx.expenseClassification = category.expenseClassification || 'GENERAL_EXPENSE';
        if (propertyId === undefined) tx.propertyId = category.propertyId || null;
        if (unitId === undefined) tx.unitId = category.unitId || null;
      }
    }
    if (drAccountId) tx.drAccountId = drAccountId;
    if (crAccountId) tx.crAccountId = crAccountId;
    tx.amount = newAmount;
    tx.propertyId = propertyId || null;
    tx.unitId = unitId || null;
    tx.rentMonth = rentMonth || null;
    if (status) tx.status = status;
    if (checkedBy !== undefined) tx.checkedBy = checkedBy;

    await tx.save();

    // Reliably synchronize account balances from active ledger
    await syncAccountBalances([oldDrId, oldCrId, newDrId, newCrId]);

    const updated = await Transaction.findById(id)
      .populate('categoryId', 'name type')
      .populate('drAccountId', 'name type currentBalance')
      .populate('crAccountId', 'name type currentBalance')
      .populate('propertyId', 'plazaName');

    return res.status(200).json({
      success: true,
      message: `Voucher #${tx.voucherNo} successfully updated with balance adjustments.`,
      transaction: updated,
    });
  } catch (error) {
    console.error('Error in updateTransactionMaster:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update transaction.',
    });
  }
};

/**
 * @desc    Delete transaction and reverse account balance effects
 * @route   DELETE /api/admin/transactions/:id
 * @access  Private (ADMIN_PUBLISHER)
 */
export const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    // Part 27: Published Report Lock Check
    const txDate = tx.date ? new Date(tx.date) : new Date();
    const txMonth = `${txDate.getUTCFullYear()}-${String(txDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const isLocked = await MonthlyReport.findOne({ month: txMonth, status: 'PUBLISHED' }).lean();
    if (isLocked) {
      return res.status(403).json({
        success: false,
        message: `Financial period ${txMonth} is officially PUBLISHED and locked. Transactions cannot be deleted.`,
      });
    }

    const drId = tx.drAccountId?.toString();
    const crId = tx.crAccountId?.toString();

    await Transaction.findByIdAndDelete(id);

    // Synchronize account balances safely from active ledger
    if (drId || crId) {
      await syncAccountBalances([drId, crId]);
    }

    return res.status(200).json({
      success: true,
      message: `Voucher #${tx.voucherNo} deleted and account balances synchronized successfully.`,
    });
  } catch (error) {
    console.error('Error in deleteTransaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete transaction.',
      error: error.message,
    });
  }
};

/**
 * @desc    Get 7 Plazas tenancy register and rental income summary
 * @route   GET /api/admin/rental-income-summary
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getRentalIncomeSummary = async (req, res) => {
  try {
    const { periodString, startDate, endDate } = parseMonthQuery(req.query.month);

    // 1. Fetch all 7 properties
    const properties = await Property.find({})
      .populate('units.defaultReceivingAccountId', 'name type currentBalance')
      .sort({ plazaName: 1 })
      .lean();

    // 2. Fetch all active rent transactions for this month (excluding reversed)
    const rentTransactions = await Transaction.find({
      $or: [
        { rentMonth: periodString },
        { date: { $gte: startDate, $lte: endDate }, propertyId: { $ne: null } },
      ],
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    })
      .populate('drAccountId', 'name type')
      .lean();

    let grandTotalAgreed = 0;
    let grandTotalPrior = 0;
    let grandTotalCurrentDue = 0;
    let grandTotalReceived = 0;
    let grandTotalOutstanding = 0;
    let grandTotalAdvance = 0;

    const plazaSummaries = properties.map((plaza) => {
      let plazaAgreed = 0;
      let plazaPrior = 0;
      let plazaCurrentDue = 0;
      let plazaReceived = 0;
      let plazaOutstanding = 0;
      let plazaAdvance = 0;

      const unitsData = (plaza.units || []).map((unit) => {
        const agreed = round2(unit.agreedRent || 0);
        const prior = round2(unit.julyReceivable || 0); // Prior month receivable/advance
        const currentDue = agreed;

        // Find payments for this unit
        const matchingTxs = rentTransactions.filter(
          (t) =>
            t.propertyId?.toString() === plaza._id.toString() &&
            t.unitId?.toString() === unit._id.toString()
        );

        const totalReceived = round2(
          matchingTxs.reduce((sum, t) => sum + t.amount, 0)
        );

        const latestTx = matchingTxs[matchingTxs.length - 1];
        const receivingAccountName = (latestTx && totalReceived > 0) ? (latestTx.drAccountId?.name || '-') : '-';
        const receivedDate = (latestTx && totalReceived > 0 && latestTx.date) ? new Date(latestTx.date).toISOString().split('T')[0] : '-';
        const isVerified = matchingTxs.length > 0 && matchingTxs.every((t) => t.status === 'VERIFIED');

        // Total obligations vs total payments + advance carried over
        const priorArrears = prior > 0 ? prior : 0;
        const priorAdvance = prior < 0 ? Math.abs(prior) : 0;
        const totalPayable = round2(currentDue + priorArrears);
        const totalCovered = round2(totalReceived + priorAdvance);

        const outstandingRemaining = round2(Math.max(0, totalPayable - totalCovered));
        const advanceRentReceived = round2(Math.max(0, totalCovered - totalPayable));

        let statusBadge = 'OUTSTANDING';
        if (outstandingRemaining === 0) {
          statusBadge = advanceRentReceived > 0 ? 'ADVANCE_PAID' : 'FULLY_PAID';
        } else if (totalCovered > 0) {
          statusBadge = 'PARTIALLY_PAID';
        }

        plazaAgreed += agreed;
        plazaPrior += prior;
        plazaCurrentDue += currentDue;
        plazaReceived += totalReceived;
        plazaOutstanding += outstandingRemaining;
        plazaAdvance += advanceRentReceived;

        return {
          unitId: unit._id,
          unitName: unit.unitName,
          tenantName: unit.tenantName || 'Unassigned',
          dueDay: unit.dueDay ? `${unit.dueDay}th` : '1st',
          agreedRent: agreed,
          priorMonthReceivable: prior,
          currentMonthActualRent: currentDue,
          receivedAmount: totalReceived,
          receivedDate,
          receivingAccountName,
          renewalDate: unit.renewalDate ? new Date(unit.renewalDate).toISOString().split('T')[0] : 'N/A',
          outstandingReceivable: outstandingRemaining,
          advanceRentReceived,
          statusBadge,
          isCheckedByFahad: isVerified,
          checkedBy: latestTx?.checkedBy || (isVerified ? 'Fahad Sb' : 'Pending'),
        };
      });

      plazaAgreed = round2(plazaAgreed);
      plazaPrior = round2(plazaPrior);
      plazaCurrentDue = round2(plazaCurrentDue);
      plazaReceived = round2(plazaReceived);
      plazaOutstanding = round2(plazaOutstanding);
      plazaAdvance = round2(plazaAdvance);

      grandTotalAgreed += plazaAgreed;
      grandTotalPrior += plazaPrior;
      grandTotalCurrentDue += plazaCurrentDue;
      grandTotalReceived += plazaReceived;
      grandTotalOutstanding += plazaOutstanding;
      grandTotalAdvance += plazaAdvance;

      return {
        plazaId: plaza._id,
        plazaName: plaza.plazaName,
        unitsCount: unitsData.length,
        subtotals: {
          agreedRent: plazaAgreed,
          priorReceivable: plazaPrior,
          currentDue: plazaCurrentDue,
          receivedAmount: plazaReceived,
          outstandingReceivable: plazaOutstanding,
          advanceRentReceived: plazaAdvance,
          collectionRate: plazaCurrentDue > 0 ? Math.round((plazaReceived / plazaCurrentDue) * 100) : 0,
        },
        units: unitsData,
      };
    });

    return res.status(200).json({
      success: true,
      period: periodString,
      grandTotals: {
        totalAgreedRent: round2(grandTotalAgreed),
        totalPriorReceivable: round2(grandTotalPrior),
        totalCurrentDue: round2(grandTotalCurrentDue),
        totalReceivedAmount: round2(grandTotalReceived),
        totalOutstandingReceivable: round2(grandTotalOutstanding),
        totalAdvanceRentReceived: round2(grandTotalAdvance),
        collectionRate: grandTotalCurrentDue > 0 ? Math.round((grandTotalReceived / grandTotalCurrentDue) * 100) : 0,
      },
      plazas: plazaSummaries,
    });
  } catch (error) {
    console.error('Error in getRentalIncomeSummary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve rental income register.',
      error: error.message,
    });
  }
};

/**
 * @desc    Get account running statement with negative balance alert detection
 * @route   GET /api/admin/reconcile/account-statement/:accountId
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getAccountReconciliation = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate, periodString } = parseMonthQuery(req.query.month);

    const ledger = await getAccountRunningLedger(accountId, startDate, endDate);

    // Scan running balances to flag any negative cash dips
    let minRunningBalance = ledger.previousBalance;
    let hasNegativeBalanceDip = minRunningBalance < 0;

    for (const entry of ledger.entries) {
      if (entry.runningBalance < minRunningBalance) {
        minRunningBalance = entry.runningBalance;
      }
      if (entry.runningBalance < 0) {
        hasNegativeBalanceDip = true;
      }
    }

    return res.status(200).json({
      success: true,
      period: periodString,
      account: ledger.account,
      reconciliation: {
        openingBalance: ledger.previousBalance,
        totalDebits: ledger.totalDebits,
        totalCredits: ledger.totalCredits,
        closingBalance: ledger.closingBalance,
        minRunningBalance,
        hasNegativeBalanceDip,
        discrepancyWarning: hasNegativeBalanceDip
          ? `WARNING: Account balance dipped into negative (PKR ${minRunningBalance.toLocaleString()}) during this period!`
          : null,
      },
      entries: ledger.entries,
    });
  } catch (error) {
    console.error('Error in getAccountReconciliation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch account reconciliation statement.',
      error: error.message,
    });
  }
};

/**
 * @desc    Get head-wise expense summary with itemized vouchers
 * @route   GET /api/admin/head-wise-summary
 * @access  Private (ADMIN_PUBLISHER)
 */
export const getHeadWiseSummary = async (req, res) => {
  try {
    const { year, month } = parseMonthQuery(req.query.month);
    const report = await getHeadWiseExpenseReport(year, month);
    return res.status(200).json({
      success: true,
      ...report,
    });
  } catch (error) {
    console.error('Error in getHeadWiseSummary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve head-wise expense summary.',
      error: error.message,
    });
  }
};

export default {
  getFinancialAtAGlance,
  getMasterLedger,
  verifyTransaction,
  updateTransactionMaster,
  deleteTransaction,
  getRentalIncomeSummary,
  getAccountReconciliation,
  getHeadWiseSummary,
};
