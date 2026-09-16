import Property from '../models/Property.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import { createTransaction, round2 } from '../services/ledgerService.js';

/**
 * @desc    Collect property rent and automatically record double-entry voucher
 * @route   POST /api/rent/collect
 * @access  Private
 */
export const collectRent = async (req, res) => {
  try {
    const {
      propertyId,
      unitId,
      rentMonth,
      receivingAccountId,
      amountPaid,
      paymentDate,
      notes,
      attachments = [],
    } = req.body;

    // 0. Role check: Executive Managers (Fahad) have supervisory oversight only
    if (req.user.role === 'ADMIN' || req.user.role === 'ADMIN_PUBLISHER') {
      return res.status(403).json({
        success: false,
        message: 'Executive Managers (Fahad) have supervisory oversight and cannot record operational rent receipts.',
      });
    }

    if (!propertyId || !unitId || !rentMonth || !receivingAccountId || amountPaid === undefined) {
      return res.status(400).json({
        success: false,
        message: 'propertyId, unitId, rentMonth, receivingAccountId, and amountPaid are required.',
      });
    }

    const paid = round2(amountPaid);
    if (paid <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount paid must be greater than zero.',
      });
    }

    // 1. Fetch Property and Unit
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found.' });
    }

    const unit = property.units.id(unitId);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found in property.' });
    }

    // If submitted by DATA_ENTRY (Sarfraz), save as temporary pending entry awaiting Khurshid's verification
    if (req.user.role === 'DATA_ENTRY') {
      const pending = await PendingEntry.create({
        entryType: 'RENT',
        amount: paid,
        date: paymentDate ? new Date(paymentDate) : new Date(),
        voucherNo: '',
        rentMonth,
        propertyId: property._id,
        unitId: unit._id,
        attachments,
        tenantId: unit.tenantId || null,
        receivingAccountId,
        detail: `Rent Received: ${property.plazaName} - ${unit.unitName} for ${rentMonth}. ${notes ? `Note: ${notes}` : ''}`.trim(),
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
            notes: 'Temporary rent collection entry awaiting review and verification by Khurshid Anwar.',
          },
        ],
      });

      return res.status(201).json({
        success: true,
        isPending: true,
        message: `Rent payment of PKR ${paid.toLocaleString()} recorded as temporary pending entry awaiting verification by Khurshid Anwar.`,
        pendingEntry: pending,
      });
    }

    // 2. Fetch Receiving Account
    const receivingAccount = await Account.findById(receivingAccountId);
    if (!receivingAccount) {
      return res.status(404).json({ success: false, message: 'Receiving account not found.' });
    }

    // 3. Fetch or Identify Rental Income Category
    let rentalCategory = await Category.findOne({
      $or: [{ name: 'Rental Income' }, { isRentalHead: true, type: 'INCOME' }],
    });
    if (!rentalCategory) {
      rentalCategory = await Category.create({
        name: 'Rental Income',
        type: 'INCOME',
        isRentalHead: true,
      });
    }

    // 4. Counterparty clearing account (for double-entry credit side)
    let clearingAccount = await Account.findOne({
      $or: [
        { name: /Clearing/i },
        { name: /External Parties/i },
      ],
    });
    if (!clearingAccount) {
      clearingAccount = await Account.findOne({ _id: { $ne: receivingAccountId } });
    }

    // 5. Compute allocation breakdown
    // Check prior collections for this unit for this specific month
    const existingMonthRent = await Transaction.find({
      propertyId,
      unitId,
      rentMonth,
    }).lean();

    const alreadyPaidThisMonth = existingMonthRent.reduce((sum, tx) => sum + tx.amount, 0);
    const agreedMonthlyRent = round2(unit.agreedRent || 0);
    const remainingMonthDue = Math.max(0, round2(agreedMonthlyRent - alreadyPaidThisMonth));

    // Calculate prior outstanding receivables (for demonstration / simulated ledger dues)
    const simulatedPriorReceivable = 0; // Or from unit historical ledger
    const priorCleared = Math.min(paid, simulatedPriorReceivable);
    const afterPrior = round2(paid - priorCleared);

    const currentMonthCleared = Math.min(afterPrior, remainingMonthDue);
    const advanceRent = round2(Math.max(0, afterPrior - currentMonthCleared));

    // 6. Generate sequential voucher number
    const vouchers = await Transaction.find({}, { voucherNo: 1 }).lean();
    let maxVn = 3000;
    for (const v of vouchers) {
      const num = parseInt(v.voucherNo?.replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > maxVn) maxVn = num;
    }
    const voucherNo = String(maxVn + 1);

    const detailNarration = `Rent Received: ${property.plazaName} - ${unit.unitName} (${unit.tenantName || 'Tenant'}) for ${rentMonth}. ${notes ? `Note: ${notes}` : ''}`.trim();

    // 7. Record transaction via ledgerService
    const transaction = await createTransaction({
      date: paymentDate ? new Date(paymentDate) : new Date(),
      voucherNo,
      detail: detailNarration,
      categoryId: rentalCategory._id,
      drAccountId: receivingAccount._id, // Bank/Cash receiving rent (Debited -> balance increases)
      crAccountId: clearingAccount._id, // Clearing (Credited)
      amount: paid,
      propertyId: property._id,
      unitId: unit._id,
      attachments,
      rentMonth,
      status: 'PENDING',
      checkedBy: req.user.name,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: `Rent payment of PKR ${paid.toLocaleString()} recorded for ${property.plazaName} - ${unit.unitName}.`,
      breakdown: {
        totalPaid: paid,
        agreedRent: agreedMonthlyRent,
        priorReceivableCleared: priorCleared,
        currentMonthCleared,
        advanceRentReceived: advanceRent,
        remainingMonthDue: round2(Math.max(0, remainingMonthDue - currentMonthCleared)),
      },
      voucher: {
        id: transaction._id,
        voucherNo: transaction.voucherNo,
        detail: transaction.detail,
        receivingAccount: receivingAccount.name,
      },
    });
  } catch (error) {
    console.error('Error in collectRent:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to collect rent.',
    });
  }
};

/**
 * @desc    Get all units for a plaza with rent details and collection status
 * @route   GET /api/rent/plaza-units/:propertyId
 * @access  Private
 */
export const getPlazaUnits = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { month } = req.query; // optional YYYY-MM
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    const property = await Property.findById(propertyId)
      .populate('units.defaultReceivingAccountId', 'name type accountNumber currentBalance')
      .lean();

    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found.' });
    }

    // Fetch collections for this property in the target month
    const monthTransactions = await Transaction.find({
      propertyId,
      rentMonth: targetMonth,
    }).lean();

    // Map units with payment calculations
    const unitsWithStatus = property.units.map((unit) => {
      const unitPayments = monthTransactions.filter(
        (tx) => tx.unitId?.toString() === unit._id.toString()
      );
      const paidThisMonth = round2(
        unitPayments.reduce((sum, tx) => sum + tx.amount, 0)
      );
      const agreedRent = round2(unit.agreedRent || 0);
      const balanceDue = round2(Math.max(0, agreedRent - paidThisMonth));
      const isFullyPaid = paidThisMonth >= agreedRent;

      return {
        _id: unit._id,
        unitName: unit.unitName,
        tenantName: unit.tenantName,
        dueDay: unit.dueDay,
        agreedRent,
        paidThisMonth,
        balanceDue,
        isFullyPaid,
        defaultReceivingAccount: unit.defaultReceivingAccountId,
        isActive: unit.isActive,
      };
    });

    return res.status(200).json({
      success: true,
      property: {
        _id: property._id,
        plazaName: property.plazaName,
        totalMonthlyRentRoll: property.totalMonthlyRentRoll,
      },
      targetMonth,
      units: unitsWithStatus,
    });
  } catch (error) {
    console.error('Error in getPlazaUnits:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve plaza units.',
      error: error.message,
    });
  }
};

export default { collectRent, getPlazaUnits };
