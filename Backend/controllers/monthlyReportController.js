import MonthlyReport from '../models/MonthlyReport.js';
import Transaction from '../models/Transaction.js';
import { getMonthlyOpeningClosingMatrix, getHeadWiseExpenseReport, round2 } from '../services/ledgerService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * Helper to compute live report snapshot from ledger and transactions
 */
export const computeMonthSnapshot = async (year, month) => {
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Matrix calculation
  const matrixData = await getMonthlyOpeningClosingMatrix(year, month);
  const grand = matrixData.grandTotal;

  // Real transactions in this month
  const [rentTxs, otherIncomeTxs, expenseTxs, transferTxs] = await Promise.all([
    Transaction.find({
      date: { $gte: startOfMonth, $lte: endOfMonth },
      transactionType: 'INCOME',
      reportCategory: 'Rent',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).lean(),
    Transaction.find({
      date: { $gte: startOfMonth, $lte: endOfMonth },
      transactionType: 'INCOME',
      reportCategory: 'Other Income',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).lean(),
    Transaction.find({
      date: { $gte: startOfMonth, $lte: endOfMonth },
      transactionType: 'EXPENSE',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).lean(),
    Transaction.find({
      date: { $gte: startOfMonth, $lte: endOfMonth },
      transactionType: 'TRANSFER',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).lean(),
  ]);

  const totalRentalIncome = round2(rentTxs.reduce((s, t) => s + (t.amount || 0), 0));
  const totalOtherIncome = round2(otherIncomeTxs.reduce((s, t) => s + (t.amount || 0), 0));
  const totalIncome = round2(totalRentalIncome + totalOtherIncome);

  const totalExpenses = round2(expenseTxs.reduce((s, t) => s + (t.amount || 0), 0));
  const totalTransfers = round2(transferTxs.reduce((s, t) => s + (t.amount || 0), 0));

  const bankRows = matrixData.rows.filter((r) => r.accountType === 'BANK');
  const cashRows = matrixData.rows.filter((r) => r.accountType === 'CASH');

  const totalBankClosing = round2(bankRows.reduce((s, r) => s + (r.closingBalance || 0), 0));
  const totalCashClosing = round2(cashRows.reduce((s, r) => s + (r.closingBalance || 0), 0));
  const closingBalance = round2(totalBankClosing + totalCashClosing);

  const openingBalance = grand.openingBalance;
  const netPosition = round2(totalIncome - totalExpenses);

  // Reconciliation Integrity Checks
  const discrepancies = [];

  // Check 1: Opening + Input - Output = Closing at Matrix level
  const calcMatrixClosing = round2(openingBalance + grand.totalInput - grand.totalOutput);
  if (Math.abs(calcMatrixClosing - grand.closingBalance) > 0.05) {
    discrepancies.push(
      `Matrix balance mismatch: Opening (${openingBalance}) + Input (${grand.totalInput}) - Output (${grand.totalOutput}) = ${calcMatrixClosing}, but Closing is ${grand.closingBalance}`
    );
  }

  // Check 2: Bank Closing + Cash Closing = Grand Closing
  if (Math.abs(closingBalance - grand.closingBalance) > 0.05) {
    discrepancies.push(
      `Liquidity sum mismatch: Bank (${totalBankClosing}) + Cash (${totalCashClosing}) = ${closingBalance}, but Grand Closing is ${grand.closingBalance}`
    );
  }

  const isReconciled = discrepancies.length === 0;

  return {
    snapshot: {
      totalRentalIncome,
      totalOtherIncome,
      totalIncome,
      totalExpenses,
      totalTransfers,
      openingBalance,
      closingBalance,
      netPosition,
      totalBankClosing,
      totalCashClosing,
    },
    reconciliationStatus: isReconciled ? 'RECONCILED' : 'DISCREPANCY',
    reconciliationNotes: discrepancies.join(' | ') || 'All ledger totals mathematically reconciled.',
    matrixData,
  };
};

/**
 * @desc    Get all monthly reports history
 * @route   GET /api/monthly-reports
 * @access  Private (Authenticated)
 */
export const getMonthlyReports = async (req, res) => {
  try {
    let reports = await MonthlyReport.find({})
      .sort({ year: -1, monthNumber: -1 })
      .lean();

    // If no reports exist yet, auto-generate default draft for 2026-08
    if (reports.length === 0) {
      const { snapshot, reconciliationStatus, reconciliationNotes } = await computeMonthSnapshot(2026, 8);
      const defaultReport = await MonthlyReport.create({
        month: '2026-08',
        year: 2026,
        monthNumber: 8,
        status: 'DRAFT',
        reconciliationStatus,
        reconciliationNotes,
        summarySnapshot: snapshot,
        preparedByName: req.user?.name || 'Administrator',
        preparedBy: req.user?._id,
      });
      reports = [defaultReport.toObject()];
    }

    return apiSuccess(res, { reports }, 'Monthly reports history retrieved.');
  } catch (error) {
    console.error('Error in getMonthlyReports:', error);
    return apiError(res, error.message || 'Failed to retrieve monthly reports.', 500);
  }
};

/**
 * @desc    Get a single monthly report by month string (YYYY-MM)
 * @route   GET /api/monthly-reports/:month
 * @access  Private (Authenticated)
 */
export const getMonthlyReportByMonth = async (req, res) => {
  try {
    const { month } = req.params;
    let report = await MonthlyReport.findOne({ month }).lean();

    if (!report) {
      const [y, m] = month.split('-').map(Number);
      if (isNaN(y) || isNaN(m)) {
        return apiError(res, 'Invalid month parameter format (YYYY-MM required).', 400);
      }
      const { snapshot, reconciliationStatus, reconciliationNotes } = await computeMonthSnapshot(y, m);
      report = {
        month,
        year: y,
        monthNumber: m,
        status: 'DRAFT',
        reconciliationStatus,
        reconciliationNotes,
        summarySnapshot: snapshot,
        preparedByName: req.user?.name || 'System Operator',
      };
    }

    return apiSuccess(res, { report }, `Monthly report for ${month} retrieved.`);
  } catch (error) {
    console.error('Error in getMonthlyReportByMonth:', error);
    return apiError(res, error.message || 'Failed to retrieve monthly report.', 500);
  }
};

/**
 * @desc    Generate or update a monthly report record with fresh live calculation
 * @route   POST /api/monthly-reports/generate
 * @access  Private (ADMIN_PUBLISHER)
 */
export const generateMonthlyReport = async (req, res) => {
  try {
    const { month, notes } = req.body;
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return apiError(res, 'A valid month (YYYY-MM) is required.', 400);
    }

    const [y, m] = month.split('-').map(Number);
    const existing = await MonthlyReport.findOne({ month });

    // If report is already PUBLISHED, check if publisher wants to re-run
    if (existing && existing.status === 'PUBLISHED') {
      return apiError(
        res,
        `Monthly report for ${month} is officially PUBLISHED and locked. Unlock or revert to DRAFT first.`,
        403
      );
    }

    const { snapshot, reconciliationStatus, reconciliationNotes } = await computeMonthSnapshot(y, m);

    const updated = await MonthlyReport.findOneAndUpdate(
      { month },
      {
        month,
        year: y,
        monthNumber: m,
        status: existing?.status || 'DRAFT',
        reconciliationStatus,
        reconciliationNotes,
        summarySnapshot: snapshot,
        preparedBy: req.user?._id,
        preparedByName: req.user?.name || 'System Operator',
        generatedAt: new Date(),
        notes: notes || existing?.notes || '',
      },
      { new: true, upsert: true }
    );

    return apiSuccess(res, { report: updated }, `Monthly report for ${month} generated successfully.`);
  } catch (error) {
    console.error('Error in generateMonthlyReport:', error);
    return apiError(res, error.message || 'Failed to generate monthly report.', 500);
  }
};

/**
 * @desc    Update report lifecycle status (DRAFT -> REVIEWED -> PUBLISHED)
 * @route   PATCH /api/monthly-reports/:month/status
 * @access  Private (ADMIN_PUBLISHER)
 */
export const updateReportStatus = async (req, res) => {
  try {
    const { month } = req.params;
    const { status, notes } = req.body;

    if (!['DRAFT', 'REVIEWED', 'PUBLISHED'].includes(status)) {
      return apiError(res, "Status must be 'DRAFT', 'REVIEWED', or 'PUBLISHED'.", 400);
    }

    const [y, m] = month.split('-').map(Number);
    let report = await MonthlyReport.findOne({ month });

    // If report doesn't exist yet, compute and create
    if (!report) {
      const { snapshot, reconciliationStatus, reconciliationNotes } = await computeMonthSnapshot(y, m);
      report = new MonthlyReport({
        month,
        year: y,
        monthNumber: m,
        status: 'DRAFT',
        reconciliationStatus,
        reconciliationNotes,
        summarySnapshot: snapshot,
        preparedBy: req.user?._id,
        preparedByName: req.user?.name,
      });
    }

    // Workflow validations
    if (status === 'REVIEWED') {
      report.reviewedBy = req.user?._id;
      report.reviewedByName = req.user?.name || 'Auditor';
      report.reviewedAt = new Date();
    } else if (status === 'PUBLISHED') {
      if (report.reconciliationStatus === 'DISCREPANCY') {
        return apiError(
          res,
          'Cannot PUBLISH report with an active RECONCILIATION DISCREPANCY. Resolve discrepancies before publishing.',
          400
        );
      }
      report.publishedBy = req.user?._id;
      report.publishedByName = req.user?.name || 'Publisher';
      report.publishedAt = new Date();
      if (!report.reviewedByName) {
        report.reviewedByName = req.user?.name;
        report.reviewedAt = new Date();
      }
    }

    report.status = status;
    if (notes !== undefined) report.notes = notes;
    await report.save();

    return apiSuccess(res, { report }, `Report for ${month} successfully marked as ${status}.`);
  } catch (error) {
    console.error('Error in updateReportStatus:', error);
    return apiError(res, error.message || 'Failed to update report status.', 500);
  }
};

/**
 * @desc    Validate reconciliation for a specific month
 * @route   GET /api/monthly-reports/:month/validate
 * @access  Private (ADMIN_PUBLISHER)
 */
export const validateMonthReconciliation = async (req, res) => {
  try {
    const { month } = req.params;
    const [y, m] = month.split('-').map(Number);
    const { snapshot, reconciliationStatus, reconciliationNotes } = await computeMonthSnapshot(y, m);

    return apiSuccess(
      res,
      {
        month,
        isReconciled: reconciliationStatus === 'RECONCILED',
        reconciliationStatus,
        reconciliationNotes,
        snapshot,
      },
      `Reconciliation validation complete for ${month}.`
    );
  } catch (error) {
    console.error('Error in validateMonthReconciliation:', error);
    return apiError(res, error.message || 'Reconciliation validation failed.', 500);
  }
};

/**
 * @desc    Reset and recompute a monthly report from current live ledger data
 * @route   POST /api/monthly-reports/:month/reset
 * @access  Private (ADMIN, ADMIN_PUBLISHER)
 */
export const resetMonthlyReport = async (req, res) => {
  try {
    const { month } = req.params;
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return apiError(res, 'A valid month (YYYY-MM) is required.', 400);
    }

    const [y, m] = month.split('-').map(Number);
    const existing = await MonthlyReport.findOne({ month });

    const { snapshot, reconciliationStatus, reconciliationNotes, matrixData } = await computeMonthSnapshot(y, m);

    const updated = await MonthlyReport.findOneAndUpdate(
      { month },
      {
        month,
        year: y,
        monthNumber: m,
        status: existing?.status === 'PUBLISHED' ? 'DRAFT' : (existing?.status || 'DRAFT'),
        reconciliationStatus,
        reconciliationNotes,
        summarySnapshot: snapshot,
        preparedBy: req.user?._id,
        preparedByName: req.user?.name || 'System Operator',
        generatedAt: new Date(),
        notes: existing?.notes ? `${existing.notes} (Reset with current ledger on ${new Date().toISOString().split('T')[0]})` : 'Reset with current ledger',
      },
      { new: true, upsert: true }
    );

    return apiSuccess(
      res,
      { report: updated, matrixData },
      `Monthly report for ${month} has been reset and refreshed with current ledger information.`
    );
  } catch (error) {
    console.error('Error in resetMonthlyReport:', error);
    return apiError(res, error.message || 'Failed to reset monthly report.', 500);
  }
};

export default {
  getMonthlyReports,
  getMonthlyReportByMonth,
  generateMonthlyReport,
  resetMonthlyReport,
  updateReportStatus,
  validateMonthReconciliation,
  computeMonthSnapshot,
};
