import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import Account from '../models/Account.js';
import MonthlyReport from '../models/MonthlyReport.js';
import { createTransaction, round2, suggestNextVoucherNumber } from '../services/ledgerService.js';
import { getOrCreateOtherIncomeClearingAccount } from './otherIncomeController.js';
import { validateExpenseClassification } from '../services/expenseClassificationService.js';

/**
 * @desc    Record a new double-entry voucher transaction
 * @route   POST /api/transactions/voucher
 * @access  Private (DATA_ENTRY creates pending draft, VERIFIER posts directly, ADMIN is blocked from ops entry)
 */
export const recordVoucher = async (req, res) => {
  try {
    let {
      date,
      voucherNo,
      detail,
      categoryId,
      drAccountId,
      crAccountId,
      amount,
      propertyId,
      unitId,
      expenseClassification,
      attachments = [],
      rentMonth,
    } = req.body;

    // 0. Role check: Executive Managers (Fahad) have supervisory oversight only
    if (req.user.role === 'ADMIN' || req.user.role === 'ADMIN_PUBLISHER') {
      return res.status(403).json({
        success: false,
        message: 'Executive Managers (Fahad) have supervisory oversight and cannot record operational expense vouchers.',
      });
    }

    // Auto-resolve drAccountId if omitted for simplified expense entry
    if (!drAccountId && categoryId && crAccountId) {
      const clearingAcc = await getOrCreateOtherIncomeClearingAccount();
      drAccountId = clearingAcc._id;
    }

    // 1. Mandatory field checks
    if (!voucherNo || !detail || !categoryId || !drAccountId || !crAccountId || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: voucherNo, detail, categoryId, crAccountId, amount.',
      });
    }

    // 2. Validate distinct accounts
    if (drAccountId.toString() === crAccountId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Expense head category and disbursing account cannot be identical.',
      });
    }

    // 3. Validate positive numeric amount
    const numericAmount = round2(amount);
    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero.',
      });
    }

    const classification = await validateExpenseClassification({
      expenseClassification,
      expenseScope: req.body.expenseScope,
      propertyExpenseType: req.body.propertyExpenseType,
      propertyId,
      unitId,
    });

    // 4. If submitted by DATA_ENTRY (Sarfraz), save as temporary pending entry awaiting Khurshid's verification
    if (req.user.role === 'DATA_ENTRY') {
      const pending = await PendingEntry.create({
        entryType: 'EXPENSE',
        amount: numericAmount,
        date: date ? new Date(date) : new Date(),
        voucherNo: voucherNo.trim(),
        detail: detail.trim(),
        categoryId,
        drAccountId,
        crAccountId,
        propertyId: propertyId || null,
        unitId: unitId || null,
        expenseClassification: classification.expenseClassification,
        attachments,
        rentMonth: rentMonth || null,
        entryData: req.body,
        status: 'PENDING_VERIFICATION',
        submittedBy: req.user._id,
        submittedByName: req.user.name,
        submittedAt: new Date(),
        auditLog: [
          {
            action: 'SUBMITTED',
            performedBy: req.user.name,
            performedById: req.user._id,
            timestamp: new Date(),
            notes: 'Temporary expense entry awaiting review and verification by Khurshid Anwar.',
          },
        ],
      });

      return res.status(201).json({
        success: true,
        isPending: true,
        message: `Voucher #${voucherNo} submitted as temporary pending entry. Awaiting review and verification by Khurshid Anwar.`,
        pendingEntry: pending,
      });
    }

    // 5. Check voucher number uniqueness (for direct posting by Verifier)
    const existingVoucher = await Transaction.findOne({ voucherNo: voucherNo.trim() });
    if (existingVoucher) {
      return res.status(409).json({
        success: false,
        message: `Voucher number '${voucherNo}' already exists in the system.`,
      });
    }

    // 5. Invoke atomic ledger service
    const transaction = await createTransaction({
      date: date ? new Date(date) : new Date(),
      voucherNo: voucherNo.trim(),
      detail: detail.trim(),
      categoryId,
      drAccountId,
      crAccountId,
      amount: numericAmount,
      transactionType: 'EXPENSE',
      propertyId: propertyId || null,
      unitId: unitId || null,
      expenseClassification: classification.expenseClassification,
      attachments,
      rentMonth: rentMonth || null,
      status: 'PENDING',
      createdBy: req.user._id,
      checkedBy: req.user.name,
    });

    // Populate for response
    const populated = await Transaction.findById(transaction._id)
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type currentBalance')
      .populate('crAccountId', 'name type currentBalance')
      .populate('propertyId', 'plazaName')
      .populate('createdBy', 'name email role');

    return res.status(201).json({
      success: true,
      message: `Voucher #${voucherNo} successfully recorded.`,
      transaction: populated,
    });
  } catch (error) {
    console.error('Error recording voucher:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to record voucher transaction.',
    });
  }
};

/**
 * @desc    Get the last 30 transactions created by the authenticated user
 * @route   GET /api/transactions/my-entries
 * @access  Private
 */
export const getMyEntries = async (req, res) => {
  try {
    const filter = {};
    // If DATA_ENTRY, filter by createdBy; if ADMIN, show all recent entries
    if (req.user.role === 'DATA_ENTRY') {
      filter.createdBy = req.user._id;
    }

    const transactions = await Transaction.find(filter)
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type currentBalance bankName cashHolder')
      .populate('crAccountId', 'name type currentBalance bankName cashHolder')
      .populate('propertyId', 'plazaName propertyName propertyCode location address units')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();

    return res.status(200).json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error('Error fetching my entries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction entries.',
      error: error.message,
    });
  }
};

/**
 * @desc    Suggest next sequential voucher number for a month
 * @route   GET /api/transactions/suggest-vn?month=YYYY-MM
 * @access  Private
 */
export const suggestVoucherNumber = async (req, res) => {
  try {
    const { date, month } = req.query;
    let targetDate = date ? new Date(date) : new Date();
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      targetDate = new Date(Date.UTC(y, m - 1, 1));
    }

    const nextVoucherNo = await suggestNextVoucherNumber(targetDate);

    return res.status(200).json({
      success: true,
      suggestedVoucherNo: nextVoucherNo,
    });
  } catch (error) {
    console.error('Error suggesting voucher number:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate sequential voucher number.',
      error: error.message,
    });
  }
};

/**
 * @desc    Update a pending voucher entry
 * @route   PUT /api/transactions/:id
 * @access  Private
 */
export const updatePendingVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const { detail, checkedBy, notes } = req.body;

    const tx = await Transaction.findById(id);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    if (tx.status === 'VERIFIED') {
      return res.status(403).json({
        success: false,
        message: 'Locked transaction. Cannot edit a voucher that has already been verified.',
      });
    }

    if (detail) tx.detail = detail.trim();
    if (checkedBy) tx.checkedBy = checkedBy.trim();
    if (notes !== undefined) tx.notes = notes;

    await tx.save();

    const updated = await Transaction.findById(id)
      .populate('categoryId', 'name type')
      .populate('drAccountId', 'name type')
      .populate('crAccountId', 'name type')
      .populate('propertyId', 'plazaName');

    return res.status(200).json({
      success: true,
      message: 'Transaction details updated.',
      transaction: updated,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to update transaction.',
    });
  }
};

/**
 * @desc    Delete a single transaction/voucher and reverse account balance effects
 * @route   DELETE /api/transactions/:id
 * @access  Private
 */
export const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Check if pending entry
    const pending = await PendingEntry.findById(id);
    if (pending) {
      await PendingEntry.findByIdAndDelete(id);
      return res.status(200).json({
        success: true,
        message: `Pending voucher #${pending.voucherNo} deleted successfully.`,
      });
    }

    // 2. Check recorded Transaction
    const tx = await Transaction.findById(id);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    // Locked period check
    const txDate = tx.date ? new Date(tx.date) : new Date();
    const txMonth = `${txDate.getUTCFullYear()}-${String(txDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const isLocked = await MonthlyReport.findOne({ month: txMonth, status: 'PUBLISHED' }).lean();
    if (isLocked) {
      return res.status(403).json({
        success: false,
        message: `Financial period ${txMonth} is officially PUBLISHED and locked. Transactions cannot be deleted.`,
      });
    }

    const amt = round2(tx.amount);
    // Reverse balances
    if (tx.drAccountId && tx.crAccountId) {
      await Promise.all([
        Account.findByIdAndUpdate(tx.drAccountId, { $inc: { currentBalance: -amt } }),
        Account.findByIdAndUpdate(tx.crAccountId, { $inc: { currentBalance: amt } }),
      ]);
    }

    await Transaction.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: `Expense voucher #${tx.voucherNo} deleted and account balances reversed successfully.`,
    });
  } catch (error) {
    console.error('[Delete Transaction Error]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete transaction.',
    });
  }
};

export default {
  recordVoucher,
  getMyEntries,
  suggestVoucherNumber,
  updatePendingVoucher,
  deleteTransaction,
};
