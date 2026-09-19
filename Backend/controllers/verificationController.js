import mongoose from 'mongoose';
import PendingEntry from '../models/PendingEntry.js';
import Transaction from '../models/Transaction.js';
import RentReceived from '../models/RentReceived.js';
import RentDue from '../models/RentDue.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import Category from '../models/Category.js';
import Account from '../models/Account.js';
import { createTransaction, round2, suggestNextVoucherNumber } from '../services/ledgerService.js';
import { getOrCreateOtherIncomeClearingAccount } from './otherIncomeController.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { validateExpenseClassification } from '../services/expenseClassificationService.js';

/**
 * Generate sequential Receipt Number for Rent
 */
const generateReceiptNumber = async (rentMonth) => {
  const cleanMonth = (rentMonth || new Date().toISOString().slice(0, 7)).replace('-', '');
  const prefix = `REC-${cleanMonth}-`;
  const count = await RentReceived.countDocuments({
    receiptNumber: { $regex: `^${prefix}` },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

/**
 * Get or create Rental Income category
 */
const getOrCreateRentalIncomeCategory = async () => {
  let category = await Category.findOne({
    $or: [{ name: /Rental Income/i }, { name: /Rent/i }],
    isRentalHead: true,
  });
  if (!category) {
    category = await Category.findOne({ isRentalHead: true });
  }
  if (!category) {
    category = await Category.create({
      name: 'Rental Income',
      type: 'INCOME',
      isRentalHead: true,
      reportGroup: 'Rent',
      isActive: true,
    });
  }
  return category;
};

/**
 * Get or create Clearing Account
 */
const getOrCreateClearingAccount = async (receivingAccountId) => {
  let clearingAccount = await Account.findOne({
    $or: [
      { name: /Clearing/i },
      { name: /External Parties/i },
      { name: /Tenant Receivable/i },
    ],
    _id: { $ne: receivingAccountId },
  });
  if (!clearingAccount) {
    clearingAccount = await Account.create({
      name: 'External Parties / Rental Clearing',
      accountName: 'External Parties / Rental Clearing',
      type: 'CASH',
      accountType: 'CASH',
      cashHolder: 'Operations Clearing',
      currentBalance: 0,
      openingBalance: 0,
      isActive: true,
      notes: 'System clearing account for counterparty double-entry rent credits',
    });
  }
  return clearingAccount;
};

/**
 * @desc    Get all pending entries with multi-filter & pagination
 * @route   GET /api/verification/pending
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const getPendingEntries = async (req, res) => {
  try {
    const {
      status,
      entryType,
      submittedBy,
      propertyId,
      tenantId,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    } else {
      // Default to unverified / pending entries
      query.status = { $in: ['PENDING_VERIFICATION', 'EDITED'] };
    }

    if (entryType) query.entryType = entryType;
    if (submittedBy && mongoose.Types.ObjectId.isValid(submittedBy)) query.submittedBy = submittedBy;
    if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) query.propertyId = propertyId;
    if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) query.tenantId = tenantId;

    if (startDate || endDate) {
      query.submittedAt = {};
      if (startDate) query.submittedAt.$gte = new Date(startDate);
      if (endDate) query.submittedAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { voucherNo: regex },
        { detail: regex },
        { submittedByName: regex },
        { referenceNumber: regex },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [entries, total] = await Promise.all([
      PendingEntry.find(query)
        .populate('submittedBy', 'name email role')
        .populate('verifiedBy', 'name email role')
        .populate('rejectedBy', 'name email role')
        .populate('propertyId', 'plazaName location')
        .populate('tenantId', 'fullName phone')
        .populate('agreementId', 'agreementNumber monthlyRent')
        .populate('categoryId', 'name type isRentalHead')
        .populate('drAccountId', 'name type currentBalance bankName cashHolder')
        .populate('crAccountId', 'name type currentBalance bankName cashHolder')
        .populate('receivingAccountId', 'name type currentBalance bankName cashHolder')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PendingEntry.countDocuments(query),
    ]);

    return apiSuccess(
      res,
      {
        entries,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum,
        },
      },
      `Retrieved ${entries.length} pending entries.`
    );
  } catch (error) {
    console.error('[Get Pending Entries Error]:', error);
    return apiError(res, error.message || 'Failed to fetch pending entries.', 500);
  }
};

/**
 * @desc    Get verification summary counts and KPIs
 * @route   GET /api/verification/summary
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const getVerificationSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      pendingRentCount,
      pendingExpenseCount,
      totalPendingCount,
      submittedTodayCount,
      submittedBySarfrazCount,
      recentlyVerifiedCount,
      recentlyRejectedCount,
    ] = await Promise.all([
      PendingEntry.countDocuments({ status: { $in: ['PENDING_VERIFICATION', 'EDITED'] }, entryType: 'RENT' }),
      PendingEntry.countDocuments({ status: { $in: ['PENDING_VERIFICATION', 'EDITED'] }, entryType: 'EXPENSE' }),
      PendingEntry.countDocuments({ status: { $in: ['PENDING_VERIFICATION', 'EDITED'] } }),
      PendingEntry.countDocuments({ submittedAt: { $gte: today } }),
      PendingEntry.countDocuments({
        $or: [
          { submittedByName: { $regex: /Sarfraz|entry/i } },
        ],
      }),
      PendingEntry.countDocuments({ status: 'VERIFIED', verifiedAt: { $gte: sevenDaysAgo } }),
      PendingEntry.countDocuments({ status: 'REJECTED', rejectedAt: { $gte: sevenDaysAgo } }),
    ]);

    return apiSuccess(
      res,
      {
        pendingRentCount,
        pendingExpenseCount,
        totalPendingCount,
        submittedTodayCount,
        submittedBySarfrazCount,
        recentlyVerifiedCount,
        recentlyRejectedCount,
      },
      'Verification summary KPIs calculated.'
    );
  } catch (error) {
    console.error('[Get Verification Summary Error]:', error);
    return apiError(res, error.message || 'Failed to calculate verification summary.', 500);
  }
};

/**
 * @desc    Get entries submitted by logged-in Data Entry user
 * @route   GET /api/verification/my-submissions
 * @access  Private (Authenticated)
 */
export const getMySubmissions = async (req, res) => {
  try {
    const query =
      req.user.role === 'DATA_ENTRY'
        ? {
            $or: [
              { submittedBy: req.user._id },
              { status: { $in: ['PENDING_VERIFICATION', 'EDITED'] } },
            ],
          }
        : { submittedBy: req.user._id };

    const entries = await PendingEntry.find(query)
      .populate('propertyId', 'plazaName')
      .populate('tenantId', 'fullName')
      .populate('categoryId', 'name')
      .populate('drAccountId', 'name')
      .populate('crAccountId', 'name')
      .populate('receivingAccountId', 'name')
      .sort({ submittedAt: -1 })
      .limit(50)
      .lean();

    return apiSuccess(res, entries, `Found ${entries.length} submissions.`);
  } catch (error) {
    console.error('[Get My Submissions Error]:', error);
    return apiError(res, error.message || 'Failed to retrieve your submissions.', 500);
  }
};

/**
 * @desc    Get single pending entry by ID
 * @route   GET /api/verification/:id
 * @access  Private (Authenticated)
 */
export const getPendingEntryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid pending entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id)
      .populate('submittedBy', 'name email role')
      .populate('verifiedBy', 'name email role')
      .populate('rejectedBy', 'name email role')
      .populate('propertyId', 'plazaName location')
      .populate('tenantId', 'fullName phone')
      .populate('agreementId', 'agreementNumber monthlyRent')
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type currentBalance bankName cashHolder')
      .populate('crAccountId', 'name type currentBalance bankName cashHolder')
      .populate('receivingAccountId', 'name type currentBalance bankName cashHolder')
      .lean();

    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    return apiSuccess(res, entry, 'Pending entry details retrieved.');
  } catch (error) {
    console.error('[Get Pending Entry Detail Error]:', error);
    return apiError(res, error.message || 'Failed to retrieve pending entry details.', 500);
  }
};

/**
 * @desc    Edit a pending entry before verification
 * @route   PUT /api/verification/:id
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const updatePendingEntry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id);
    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    if (entry.status === 'VERIFIED') {
      return apiError(res, 'Cannot edit an entry that has already been verified and posted.', 400);
    }

    // Once-only edit enforcement: block further edits after first admin edit
    if (entry.isEdited) {
      return apiError(
        res,
        'This entry has already been edited once by an admin and is now locked from further edits. You may verify or delete it.',
        403
      );
    }

    const previousSnapshot = {
      amount: entry.amount,
      date: entry.date,
      rentMonth: entry.rentMonth,
      detail: entry.detail,
      expenseClassification: entry.expenseClassification,
      attachments: entry.attachments || [],
      propertyId: entry.propertyId,
      unitId: entry.unitId,
      tenantId: entry.tenantId,
      categoryId: entry.categoryId,
      drAccountId: entry.drAccountId,
      crAccountId: entry.crAccountId,
      receivingAccountId: entry.receivingAccountId,
    };

    const updates = req.body;
    if (updates.amount !== undefined) entry.amount = round2(Number(updates.amount));
    if (updates.date) entry.date = new Date(updates.date);
    if (updates.rentMonth) entry.rentMonth = updates.rentMonth;
    if (updates.detail !== undefined) entry.detail = updates.detail.trim();
    if (updates.voucherNo !== undefined) entry.voucherNo = updates.voucherNo.trim();
    if (updates.propertyId) entry.propertyId = updates.propertyId;
    if (updates.propertyId === null || updates.propertyId === '') entry.propertyId = null;
    if (updates.unitId) entry.unitId = updates.unitId;
    if (updates.unitId === null || updates.unitId === '') entry.unitId = null;
    if (updates.attachments !== undefined) entry.attachments = updates.attachments || [];
    if (updates.expenseClassification !== undefined) {
      entry.expenseClassification = updates.expenseClassification || null;
    }
    if (updates.tenantId) entry.tenantId = updates.tenantId;
    if (updates.categoryId) entry.categoryId = updates.categoryId;
    if (updates.drAccountId) entry.drAccountId = updates.drAccountId;
    if (updates.crAccountId) entry.crAccountId = updates.crAccountId;
    if (updates.receivingAccountId) entry.receivingAccountId = updates.receivingAccountId;

    if (entry.entryType === 'EXPENSE') {
      const classification = await validateExpenseClassification({
        expenseClassification: entry.expenseClassification,
        expenseScope: updates.expenseScope,
        propertyExpenseType: updates.propertyExpenseType,
        propertyId: entry.propertyId,
        unitId: entry.unitId,
      });
      entry.expenseClassification = classification.expenseClassification;
      entry.propertyId = classification.propertyId;
      entry.unitId = classification.unitId;
    }

    entry.status = 'EDITED';
    entry.isEdited = true;
    entry.editedBy = req.user._id;
    entry.editedByName = req.user.name;
    entry.editedAt = new Date();
    entry.auditLog.push({
      action: 'EDITED',
      performedBy: req.user.name,
      performedById: req.user._id,
      timestamp: new Date(),
      notes: updates.editNotes || 'Information modified prior to approval',
      changes: { previous: previousSnapshot, updated: updates },
    });

    await entry.save();

    const populated = await PendingEntry.findById(entry._id)
      .populate('propertyId', 'plazaName')
      .populate('tenantId', 'fullName')
      .populate('categoryId', 'name')
      .populate('drAccountId', 'name')
      .populate('crAccountId', 'name')
      .populate('receivingAccountId', 'name')
      .lean();

    return apiSuccess(res, populated, 'Pending entry updated successfully.');
  } catch (error) {
    console.error('[Update Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to update pending entry.', 400);
  }
};

/**
 * @desc    Verify and officially post a pending entry to the Central Ledger
 * @route   POST /api/verification/:id/verify
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const verifyEntry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id);
    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    // Strict idempotency: prevent double posting
    if (entry.status === 'VERIFIED') {
      return apiError(res, 'This entry has already been verified and posted to the central ledger.', 400);
    }

    if (entry.status === 'REJECTED') {
      return apiError(res, 'Cannot verify an entry that has already been rejected.', 400);
    }

    let postedTransaction = null;
    let postedRentReceived = null;

    if (entry.entryType === 'EXPENSE') {
      // Older pending vouchers could contain a user/category ID in drAccountId
      // because the expense form did not have a separate debit-account field.
      // Use the system clearing account only when the stored reference is not
      // an actual account; valid account references still go through normal
      // active-account validation in createTransaction.
      const debitAccount = entry.drAccountId
        ? await Account.findById(entry.drAccountId).select('_id')
        : null;
      if (!debitAccount) {
        const clearingAccount = await getOrCreateOtherIncomeClearingAccount();
        entry.drAccountId = clearingAccount._id;
        entry.auditLog.push({
          action: 'ACCOUNT_REFERENCE_NORMALIZED',
          performedBy: req.user.name,
          performedById: req.user._id,
          timestamp: new Date(),
          notes: 'Replaced a missing or invalid debit-account reference with the system clearing account during verification.',
        });
      }

      // 1. Post expense voucher transaction
      postedTransaction = await createTransaction({
        date: entry.date || new Date(),
        voucherNo: entry.voucherNo,
        detail: entry.detail || `Expense Voucher #${entry.voucherNo}`,
        categoryId: entry.categoryId,
        drAccountId: entry.drAccountId,
        crAccountId: entry.crAccountId,
        amount: entry.amount,
        transactionType: 'EXPENSE',
        propertyId: entry.propertyId,
        unitId: entry.unitId,
        expenseClassification: entry.expenseClassification,
        attachments: entry.attachments || [],
        rentMonth: entry.rentMonth,
        status: 'VERIFIED',
        checkedBy: req.user.name,
        createdBy: entry.submittedBy,
      });

      entry.postedTransactionId = postedTransaction._id;
    } else if (entry.entryType === 'RENT') {
      // 2. Post rent receipt
      const cleanMonth = entry.rentMonth || new Date().toISOString().slice(0, 7);
      const receiptNumber = entry.voucherNo || (await generateReceiptNumber(cleanMonth));

      const rentalCategory = await getOrCreateRentalIncomeCategory();
      const clearingAccount = await getOrCreateClearingAccount(entry.receivingAccountId);

      const propertyDoc = entry.propertyId ? await Property.findById(entry.propertyId).lean() : null;
      const tenantDoc = entry.tenantId ? await Tenant.findById(entry.tenantId).lean() : null;
      const plazaName = propertyDoc?.plazaName || 'Property';
      const tenantName = tenantDoc?.fullName || 'Tenant';

      const narration = entry.detail || `Rent Received: ${plazaName} - Unit (${tenantName}) for ${cleanMonth}. Receipt ${receiptNumber}`;

      // Create official transaction
      postedTransaction = await createTransaction({
        date: entry.date || new Date(),
        voucherNo: receiptNumber,
        detail: narration,
        categoryId: rentalCategory._id,
        drAccountId: entry.receivingAccountId,
        crAccountId: clearingAccount._id,
        amount: entry.amount,
        propertyId: entry.propertyId,
        unitId: entry.unitId,
        tenantId: entry.tenantId,
        agreementId: entry.agreementId,
        attachments: entry.attachments || [],
        rentMonth: cleanMonth,
        transactionType: 'INCOME',
        reference: entry.referenceNumber || '',
        checkedBy: req.user.name,
        status: 'VERIFIED',
        createdBy: entry.submittedBy,
      });

      // Update RentDue dues allocation if agreement exists
      let allocatedCurrent = entry.amount;
      let allocatedPrior = 0;
      let allocatedAdvance = 0;

      if (entry.agreementId) {
        const currentRentDue = await RentDue.findOne({
          agreementId: entry.agreementId,
          rentMonth: cleanMonth,
        });

        if (currentRentDue) {
          const newTotalPaid = round2((currentRentDue.paidAmount || 0) + entry.amount);
          currentRentDue.paidAmount = newTotalPaid;
          currentRentDue.status = newTotalPaid >= currentRentDue.expectedRentAmount ? 'PAID' : 'PARTIAL';
          await currentRentDue.save();
        }
      }

      // Create official RentReceived document
      postedRentReceived = await RentReceived.create({
        receiptNumber,
        receiptDate: entry.date || new Date(),
        tenantId: entry.tenantId,
        propertyId: entry.propertyId,
        unitId: entry.unitId,
        agreementId: entry.agreementId,
        rentMonth: cleanMonth,
        amount: entry.amount,
        allocatedCurrentMonth: allocatedCurrent,
        allocatedPreviousReceivable: allocatedPrior,
        allocatedAdvance,
        receivingAccountId: entry.receivingAccountId,
        paymentMethod: entry.paymentMethod || 'CASH',
        referenceNumber: entry.referenceNumber || '',
        description: narration,
        status: 'VERIFIED',
        transactionId: postedTransaction._id,
        attachments: entry.attachments || [],
        checkedBy: req.user.name,
        checkedAt: new Date(),
        createdBy: entry.submittedBy,
      });

      entry.postedTransactionId = postedTransaction._id;
      entry.postedRentReceivedId = postedRentReceived._id;
    }

    entry.status = 'VERIFIED';
    entry.verifiedBy = req.user._id;
    entry.verifiedByName = req.user.name;
    entry.verifiedAt = new Date();
    entry.auditLog.push({
      action: 'VERIFIED_AND_POSTED',
      performedBy: req.user.name,
      performedById: req.user._id,
      timestamp: new Date(),
      notes: `Verified by ${req.user.name} and officially posted to central ledger.`,
    });

    await entry.save();

    return apiSuccess(
      res,
      {
        pendingEntry: entry,
        transaction: postedTransaction,
        rentReceived: postedRentReceived,
      },
      `Entry verified and successfully posted to central financial ledger.`,
      200
    );
  } catch (error) {
    console.error('[Verify Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to verify entry.', 400);
  }
};

/**
 * @desc    Reject a pending entry
 * @route   POST /api/verification/:id/reject
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const rejectEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason = 'Entry rejected by auditor' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id);
    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    if (entry.status === 'VERIFIED') {
      return apiError(res, 'Cannot reject an entry that has already been verified and posted.', 400);
    }

    entry.status = 'REJECTED';
    entry.rejectedBy = req.user._id;
    entry.rejectedByName = req.user.name;
    entry.rejectedAt = new Date();
    entry.rejectionReason = rejectionReason.trim();
    entry.auditLog.push({
      action: 'REJECTED',
      performedBy: req.user.name,
      performedById: req.user._id,
      timestamp: new Date(),
      notes: `Rejected by ${req.user.name}. Reason: ${rejectionReason}`,
    });

    await entry.save();

    return apiSuccess(
      res,
      entry,
      `Entry marked as REJECTED. No financial transaction created.`
    );
  } catch (error) {
    console.error('[Reject Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to reject entry.', 400);
  }
};

/**
 * @desc    Delete a pending entry
 * @route   DELETE /api/verification/:id
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const deletePendingEntry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id);
    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    if (entry.status === 'VERIFIED') {
      return apiError(res, 'Cannot delete an entry that has already been posted to the central ledger.', 400);
    }

    await PendingEntry.findByIdAndDelete(id);

    return apiSuccess(res, { id }, 'Pending entry deleted.');
  } catch (error) {
    console.error('[Delete Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to delete pending entry.', 500);
  }
};

/**
 * @desc    Submit a temporary/pending entry (Data Entry / Sarfraz)
 * @route   POST /api/verification/submit
 * @access  Private (DATA_ENTRY, VERIFIER, VERIFICATION_MANAGER)
 */
export const createPendingEntry = async (req, res) => {
  try {
    const {
      entryType, // 'RENT' or 'EXPENSE'
      amount,
      date,
      voucherNo,
      rentMonth,
      propertyId,
      unitId,
      tenantId,
      agreementId,
      categoryId,
      drAccountId,
      crAccountId,
      receivingAccountId,
      detail,
      paymentMethod,
      referenceNumber,
    } = req.body;

    if (!entryType || !['RENT', 'EXPENSE'].includes(entryType)) {
      return apiError(res, 'Valid entryType (RENT or EXPENSE) is required.', 400);
    }

    let finalClassification = null;
    let finalPropertyId = propertyId || null;
    let finalUnitId = unitId || null;

    if (entryType === 'EXPENSE') {
      const classificationResult = await validateExpenseClassification({
        expenseClassification: req.body.expenseClassification,
        expenseScope: req.body.expenseScope,
        propertyExpenseType: req.body.propertyExpenseType,
        propertyId,
        unitId,
      });
      finalClassification = classificationResult.expenseClassification;
      finalPropertyId = classificationResult.propertyId;
      finalUnitId = classificationResult.unitId;
    }

    const entryDate = date ? new Date(date) : new Date();
    const finalVoucherNo = voucherNo && voucherNo.trim() ? voucherNo.trim() : await suggestNextVoucherNumber(entryDate);

    const pending = await PendingEntry.create({
      entryType,
      amount: numAmount,
      date: entryDate,
      voucherNo: finalVoucherNo,
      rentMonth: rentMonth || null,
      propertyId: finalPropertyId,
      unitId: finalUnitId,
      expenseClassification: finalClassification,
      tenantId: tenantId || null,
      agreementId: agreementId || null,
      categoryId: categoryId || null,
      drAccountId: drAccountId || null,
      crAccountId: crAccountId || null,
      receivingAccountId: receivingAccountId || null,
      detail: detail ? detail.trim() : '',
      paymentMethod: paymentMethod || 'CASH',
      referenceNumber: referenceNumber ? referenceNumber.trim() : '',
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
          notes: `Temporary entry submitted by ${req.user.name}. Awaiting review and verification by Khurshid Anwar.`,
        },
      ],
    });

    const populated = await PendingEntry.findById(pending._id)
      .populate('propertyId', 'plazaName')
      .populate('tenantId', 'fullName')
      .populate('categoryId', 'name')
      .populate('drAccountId', 'name')
      .populate('crAccountId', 'name')
      .populate('receivingAccountId', 'name')
      .lean();

    return apiSuccess(
      res,
      populated,
      'Temporary entry submitted successfully. Awaiting review and verification by Khurshid Anwar.',
      201
    );
  } catch (error) {
    console.error('[Create Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to submit pending entry.', 400);
  }
};

export default {
  getPendingEntries,
  getVerificationSummary,
  getMySubmissions,
  getPendingEntryById,
  updatePendingEntry,
  verifyEntry,
  rejectEntry,
  deletePendingEntry,
  createPendingEntry,
};
