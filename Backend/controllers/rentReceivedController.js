import mongoose from 'mongoose';
import RentReceived from '../models/RentReceived.js';
import RentDue from '../models/RentDue.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Tenant from '../models/Tenant.js';
import Property from '../models/Property.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import { createTransaction, round2 } from '../services/ledgerService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * Helper: Generate sequential receipt number (e.g. RR-2026-00001)
 */
const generateReceiptNumber = async (rentMonth) => {
  const year = rentMonth ? rentMonth.slice(0, 4) : new Date().getFullYear();
  const prefix = `RR-${year}-`;

  const latestReceipt = await RentReceived.findOne({
    receiptNumber: new RegExp(`^${prefix}`),
  })
    .sort({ receiptNumber: -1 })
    .lean();

  let nextSequence = 1;
  if (latestReceipt && latestReceipt.receiptNumber) {
    const parts = latestReceipt.receiptNumber.split('-');
    const currentNum = parseInt(parts[2], 10);
    if (!isNaN(currentNum)) {
      nextSequence = currentNum + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(5, '0')}`;
};

/**
 * Helper: Find or create the Rental Income Category Head
 */
const getOrCreateRentalIncomeCategory = async () => {
  let category = await Category.findOne({
    $or: [{ isRentalHead: true, type: 'INCOME' }, { name: /Rental Income/i }],
  });

  if (!category) {
    category = await Category.create({
      name: 'Rental Income',
      type: 'INCOME',
      isRentalHead: true,
    });
  }

  return category;
};

/**
 * Helper: Find or create a counterparty clearing account for double-entry credit
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
 * @desc    Record an actual rent payment receipt and create double-entry journal voucher
 * @route   POST /api/rent-received
 * @access  Private (Data Entry creates pending draft, Verifier posts directly, Admin is blocked from ops entry)
 */
export const recordRentReceived = async (req, res) => {
  try {
    const {
      tenantId,
      agreementId,
      propertyId,
      unitId,
      rentDueId,
      receiptDate,
      paymentMethod = 'CASH',
      referenceNumber = '',
      description = '',
      checkedBy,
      allocatePriorReceivable = true,
    } = req.body;

    // 0. Role check: Executive Managers (Fahad) have supervisory oversight only
    if (req.user.role === 'ADMIN' || req.user.role === 'ADMIN_PUBLISHER') {
      return res.status(403).json({
        success: false,
        message: 'Executive Managers (Fahad) have supervisory oversight and cannot record operational rent receipts.',
      });
    }

    const tenant = req.verifiedTenant;
    const agreement = req.verifiedAgreement;
    const receivingAccount = req.verifiedAccount;
    const totalAmount = req.cleanAmount;
    const cleanMonth = req.cleanRentMonth;

    const propId = agreement.propertyId;
    const uId = agreement.unitId;

    // If submitted by DATA_ENTRY (Sarfraz), save as temporary pending entry awaiting Khurshid's verification
    if (req.user.role === 'DATA_ENTRY') {
      const pending = await PendingEntry.create({
        entryType: 'RENT',
        amount: totalAmount,
        date: receiptDate ? new Date(receiptDate) : new Date(),
        voucherNo: '',
        rentMonth: cleanMonth,
        propertyId: propId,
        unitId: uId,
        tenantId: tenant._id,
        agreementId: agreement._id,
        receivingAccountId: receivingAccount._id,
        paymentMethod,
        referenceNumber,
        detail: description || `Rent Received: ${cleanMonth} for unit tenant ${tenant.fullName || ''}`.trim(),
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
            notes: 'Temporary rent entry awaiting review and verification by Khurshid Anwar.',
          },
        ],
      });

      return res.status(201).json({
        success: true,
        isPending: true,
        message: 'Rent receipt submitted as temporary pending entry. Awaiting review and verification by Khurshid Anwar.',
        pendingEntry: pending,
      });
    }

    // 1. Locate current RentDue record if exists or provided
    let currentRentDue = null;
    if (rentDueId && mongoose.Types.ObjectId.isValid(rentDueId)) {
      currentRentDue = await RentDue.findById(rentDueId);
    }
    if (!currentRentDue) {
      currentRentDue = await RentDue.findOne({
        agreementId: agreement._id,
        rentMonth: cleanMonth,
      });
    }

    // 2. Fetch prior month(s) overdue dues for this agreement
    const priorDues = await RentDue.find({
      agreementId: agreement._id,
      rentMonth: { $lt: cleanMonth },
      status: { $in: ['DUE', 'PARTIAL', 'OVERDUE'] },
    }).sort({ rentMonth: 1 });

    // 3. Compute 3-Tier Allocation
    let unallocated = totalAmount;
    let allocatedPrior = 0;
    const priorDueUpdates = [];

    // Prior dues allocation
    if (allocatePriorReceivable && priorDues.length > 0) {
      for (const pDue of priorDues) {
        if (unallocated <= 0) break;

        // Calculate already paid on this prior due
        const pastReceipts = await RentReceived.find({
          rentDueId: pDue._id,
          status: { $ne: 'REVERSED' },
        }).lean();
        const pastPaid = pastReceipts.reduce(
          (sum, r) => sum + (r.allocatedCurrentMonth || 0) + (r.allocatedPreviousReceivable || 0),
          0
        );

        const remainingOnPrior = Math.max(0, round2(pDue.expectedRentAmount - pastPaid));
        if (remainingOnPrior > 0) {
          const toAllocate = Math.min(unallocated, remainingOnPrior);
          unallocated = round2(unallocated - toAllocate);
          allocatedPrior = round2(allocatedPrior + toAllocate);

          const newTotalPaid = round2(pastPaid + toAllocate);
          const newStatus = newTotalPaid >= pDue.expectedRentAmount ? 'PAID' : 'PARTIAL';
          priorDueUpdates.push({ rentDue: pDue, newStatus });
        }
      }
    }

    // Current month due allocation
    let allocatedCurrent = 0;
    const expectedCurrentRent = currentRentDue
      ? currentRentDue.expectedRentAmount
      : agreement.monthlyRent;

    // Find previous payments made against this current month
    const existingCurrentReceipts = currentRentDue
      ? await RentReceived.find({
          rentDueId: currentRentDue._id,
          status: { $ne: 'REVERSED' },
        }).lean()
      : await RentReceived.find({
          agreementId: agreement._id,
          rentMonth: cleanMonth,
          status: { $ne: 'REVERSED' },
        }).lean();

    const alreadyPaidCurrent = existingCurrentReceipts.reduce(
      (sum, r) => sum + (r.allocatedCurrentMonth || 0),
      0
    );

    const remainingCurrentDue = Math.max(0, round2(expectedCurrentRent - alreadyPaidCurrent));

    if (unallocated > 0 && remainingCurrentDue > 0) {
      allocatedCurrent = Math.min(unallocated, remainingCurrentDue);
      unallocated = round2(unallocated - allocatedCurrent);
    }

    // Advance rent surplus
    const allocatedAdvance = round2(Math.max(0, unallocated));

    // Calculate receivable snapshots
    const previousReceivableSnapshot = round2(
      priorDues.reduce((sum, d) => sum + d.expectedRentAmount, 0) + remainingCurrentDue
    );
    const remainingReceivableSnapshot = Math.max(
      0,
      round2(previousReceivableSnapshot - allocatedPrior - allocatedCurrent)
    );

    // 4. Generate Unique Receipt Number
    const receiptNumber = await generateReceiptNumber(cleanMonth);

    // 5. Financial Double-Entry Journal Recording
    const rentalCategory = await getOrCreateRentalIncomeCategory();
    const clearingAccount = await getOrCreateClearingAccount(receivingAccount._id);

    const propertyDoc = await Property.findById(propId).lean();
    const plazaName = propertyDoc?.plazaName || 'Property';

    const narration = (
      description ||
      `Rent Received: ${plazaName} - Unit (${tenant.fullName}) for ${cleanMonth}. Receipt ${receiptNumber}`
    ).trim();

    // Atomic createTransaction: Dr receivingAccount (+totalAmount), Cr clearingAccount
    const transaction = await createTransaction({
      date: receiptDate ? new Date(receiptDate) : new Date(),
      voucherNo: receiptNumber,
      detail: narration,
      categoryId: rentalCategory._id,
      drAccountId: receivingAccount._id,
      crAccountId: clearingAccount._id,
      amount: totalAmount,
      propertyId: propId,
      unitId: uId,
      tenantId: tenant._id,
      agreementId: agreement._id,
      rentMonth: cleanMonth,
      transactionType: 'INCOME',
      reference: referenceNumber || '',
      checkedBy: checkedBy || req.user?.name || 'Authorized Auditor',
      status: 'VERIFIED',
      createdBy: req.user?._id,
    });

    // 6. Create and Save RentReceived Record
    const rentReceived = await RentReceived.create({
      receiptNumber,
      receiptDate: receiptDate ? new Date(receiptDate) : new Date(),
      tenantId: tenant._id,
      propertyId: propId,
      unitId: uId,
      agreementId: agreement._id,
      rentDueId: currentRentDue ? currentRentDue._id : null,
      rentMonth: cleanMonth,
      amount: totalAmount,
      allocatedCurrentMonth: allocatedCurrent,
      allocatedPreviousReceivable: allocatedPrior,
      allocatedAdvance,
      previousReceivableBalance: previousReceivableSnapshot,
      remainingReceivable: remainingReceivableSnapshot,
      receivingAccountId: receivingAccount._id,
      paymentMethod,
      referenceNumber,
      description: narration,
      status: 'VERIFIED',
      transactionId: transaction._id,
      checkedBy: checkedBy || req.user?.name || null,
      checkedAt: new Date(),
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    // 7. Update Rent Due Status(es)
    if (currentRentDue) {
      const newTotalPaidCurrent = round2(alreadyPaidCurrent + allocatedCurrent);
      let newCurrentStatus = currentRentDue.status;
      if (newTotalPaidCurrent >= currentRentDue.expectedRentAmount) {
        newCurrentStatus = 'PAID';
      } else if (newTotalPaidCurrent > 0) {
        newCurrentStatus = 'PARTIAL';
      }
      await RentDue.findByIdAndUpdate(currentRentDue._id, { status: newCurrentStatus });
    }

    for (const pUpdate of priorDueUpdates) {
      await RentDue.findByIdAndUpdate(pUpdate.rentDue._id, { status: pUpdate.newStatus });
    }

    // 8. Fetch updated receiving account balance
    const updatedAccount = await Account.findById(receivingAccount._id).lean();

    return apiSuccess(
      res,
      {
        receipt: rentReceived,
        breakdown: {
          totalAmountReceived: totalAmount,
          allocatedToCurrentMonth: allocatedCurrent,
          allocatedToPreviousReceivables: allocatedPrior,
          allocatedToAdvance: allocatedAdvance,
          previousReceivable: previousReceivableSnapshot,
          remainingReceivable: remainingReceivableSnapshot,
          remainingCurrentMonthDue: Math.max(0, round2(remainingCurrentDue - allocatedCurrent)),
        },
        receivingAccount: {
          _id: updatedAccount._id,
          name: updatedAccount.name,
          type: updatedAccount.type,
          currentBalance: updatedAccount.currentBalance,
        },
        transaction: {
          _id: transaction._id,
          voucherNo: transaction.voucherNo,
          amount: transaction.amount,
          transactionType: transaction.transactionType,
        },
      },
      `Rent receipt ${receiptNumber} recorded successfully.`,
      201
    );
  } catch (error) {
    console.error('[Record Rent Received Error]:', error);
    return apiError(res, error.message || 'Failed to record rent receipt.', 500);
  }
};

/**
 * @desc    Get rent received receipts with search, filtering and pagination
 * @route   GET /api/rent-received
 * @access  Private (Authenticated)
 */
export const getRentReceipts = async (req, res) => {
  try {
    const {
      month,
      propertyId,
      tenantId,
      receivingAccountId,
      paymentMethod,
      status,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 30,
    } = req.query;

    const query = {};

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())) {
      query.rentMonth = month.trim();
    }

    if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
      query.propertyId = propertyId;
    }

    if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
      query.tenantId = tenantId;
    }

    if (receivingAccountId && mongoose.Types.ObjectId.isValid(receivingAccountId)) {
      query.receivingAccountId = receivingAccountId;
    }

    if (paymentMethod) {
      query.paymentMethod = paymentMethod.toUpperCase();
    }

    if (status) {
      query.status = status.toUpperCase();
    }

    if (startDate || endDate) {
      query.receiptDate = {};
      if (startDate) query.receiptDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.receiptDate.$lte = end;
      }
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { receiptNumber: regex },
        { description: regex },
        { referenceNumber: regex },
        { checkedBy: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 30));
    const skip = (pageNum - 1) * limitNum;

    const [totalCount, receipts, aggregates] = await Promise.all([
      RentReceived.countDocuments(query),
      RentReceived.find(query)
        .populate('tenantId', 'fullName phone identificationNumber companyName')
        .populate('propertyId', 'plazaName location city')
        .populate('agreementId', 'agreementNumber monthlyRent dueDay')
        .populate('receivingAccountId', 'name accountName type bankName cashHolder')
        .populate('createdBy', 'name email role')
        .sort({ receiptDate: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      RentReceived.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalCollected: { $sum: '$amount' },
            totalCurrentMonth: { $sum: '$allocatedCurrentMonth' },
            totalPriorCleared: { $sum: '$allocatedPreviousReceivable' },
            totalAdvance: { $sum: '$allocatedAdvance' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = aggregates.length > 0 ? aggregates[0] : {};

    return apiSuccess(
      res,
      {
        receipts,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum) || 1,
          limit: limitNum,
          totalCount,
        },
        summary: {
          totalReceipts: totalCount,
          totalCollected: round2(stats.totalCollected || 0),
          totalCurrentMonth: round2(stats.totalCurrentMonth || 0),
          totalPriorCleared: round2(stats.totalPriorCleared || 0),
          totalAdvance: round2(stats.totalAdvance || 0),
        },
      },
      'Rent receipts retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Rent Receipts Error]:', error);
    return apiError(res, 'Failed to fetch rent receipts.', 500);
  }
};

/**
 * @desc    Get single rent receipt details
 * @route   GET /api/rent-received/:id
 * @access  Private (Authenticated)
 */
export const getRentReceiptById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid rent receipt ID.', 400);
    }

    const receipt = await RentReceived.findById(id)
      .populate('tenantId', 'fullName phone alternatePhone email identificationNumber companyName address')
      .populate('propertyId', 'plazaName location city totalUnits')
      .populate('agreementId', 'agreementNumber monthlyRent startDate endDate dueDay status')
      .populate('rentDueId', 'expectedRentAmount rentMonth dueDate status')
      .populate('receivingAccountId', 'name accountName type bankName cashHolder accountNumber currentBalance')
      .populate('transactionId', 'voucherNo detail amount date status')
      .populate('createdBy', 'name email role')
      .lean();

    if (!receipt) {
      return apiError(res, 'Rent receipt not found.', 404);
    }

    // Extract unit details from property
    let unitDetails = null;
    if (receipt.propertyId && receipt.unitId) {
      const property = await Property.findById(receipt.propertyId._id).lean();
      unitDetails = property?.units?.find(
        (u) => u._id.toString() === receipt.unitId.toString()
      );
    }

    return apiSuccess(
      res,
      {
        ...receipt,
        unit: unitDetails || null,
      },
      'Rent receipt details retrieved.'
    );
  } catch (error) {
    console.error('[Get Rent Receipt By ID Error]:', error);
    return apiError(res, 'Failed to retrieve rent receipt details.', 500);
  }
};

/**
 * @desc    Get macro monthly rental income summary (Due, Received, Outstanding, Advance)
 * @route   GET /api/rent-received/summary
 * @access  Private (Authenticated)
 */
export const getRentReceivedSummary = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())) {
      return apiError(res, 'Month must be in YYYY-MM format (e.g. 2026-08).', 400);
    }

    const cleanMonth = month.trim();

    // 1. Rent Due aggregates for this month
    const [dueAggregates, receiptAggregates, priorUnpaidAggregates] = await Promise.all([
      RentDue.aggregate([
        { $match: { rentMonth: cleanMonth } },
        {
          $group: {
            _id: null,
            totalExpectedRent: { $sum: '$expectedRentAmount' },
            totalBillableUnits: { $sum: 1 },
            paidCount: {
              $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] },
            },
            partialCount: {
              $sum: { $cond: [{ $eq: ['$status', 'PARTIAL'] }, 1, 0] },
            },
            dueCount: {
              $sum: { $cond: [{ $in: ['$status', ['DUE', 'OVERDUE']] }, 1, 0] },
            },
          },
        },
      ]),
      RentReceived.aggregate([
        { $match: { rentMonth: cleanMonth, status: { $ne: 'REVERSED' } } },
        {
          $group: {
            _id: null,
            totalActualReceived: { $sum: '$amount' },
            currentMonthAllocated: { $sum: '$allocatedCurrentMonth' },
            priorReceivableCleared: { $sum: '$allocatedPreviousReceivable' },
            advanceRentReceived: { $sum: '$allocatedAdvance' },
            totalReceiptsCount: { $sum: 1 },
          },
        },
      ]),
      RentDue.aggregate([
        {
          $match: {
            rentMonth: { $lt: cleanMonth },
            status: { $in: ['DUE', 'PARTIAL', 'OVERDUE'] },
          },
        },
        {
          $group: {
            _id: null,
            totalPriorUnpaid: { $sum: '$expectedRentAmount' },
          },
        },
      ]),
    ]);

    const dueStats = dueAggregates.length > 0 ? dueAggregates[0] : {};
    const receiptStats = receiptAggregates.length > 0 ? receiptAggregates[0] : {};
    const priorStats = priorUnpaidAggregates.length > 0 ? priorUnpaidAggregates[0] : {};

    const totalRentDue = round2(dueStats.totalExpectedRent || 0);
    const totalActualReceived = round2(receiptStats.totalActualReceived || 0);
    const currentMonthAllocated = round2(receiptStats.currentMonthAllocated || 0);
    const priorReceivableCleared = round2(receiptStats.priorReceivableCleared || 0);
    const advanceRentReceived = round2(receiptStats.advanceRentReceived || 0);
    const priorReceivableUnpaid = round2(priorStats.totalPriorUnpaid || 0);

    const netOutstandingReceivable = Math.max(0, round2(totalRentDue - currentMonthAllocated));
    const collectionPercentage = totalRentDue > 0 ? round2((currentMonthAllocated / totalRentDue) * 100) : 0;

    return apiSuccess(
      res,
      {
        month: cleanMonth,
        totalRentDue,
        totalActualReceived,
        currentMonthAllocated,
        priorReceivableCleared,
        advanceRentReceived,
        priorReceivableUnpaid,
        netOutstandingReceivable,
        collectionPercentage,
        billableUnitsCount: dueStats.totalBillableUnits || 0,
        receiptsCount: receiptStats.totalReceiptsCount || 0,
        statusCounts: {
          paid: dueStats.paidCount || 0,
          partial: dueStats.partialCount || 0,
          dueOrOverdue: dueStats.dueCount || 0,
        },
      },
      `Rental income summary for ${cleanMonth} retrieved successfully.`
    );
  } catch (error) {
    console.error('[Get Rent Received Summary Error]:', error);
    return apiError(res, 'Failed to retrieve rental income summary.', 500);
  }
};

/**
 * @desc    Get property-wise rental income summary matching Pixx report
 * @route   GET /api/rent-received/property-summary
 * @access  Private (Authenticated)
 */
export const getPropertyRentSummary = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;
    const cleanMonth = month.trim();

    const properties = await Property.find({ isActive: true }).sort({ plazaName: 1 }).lean();

    // Fetch dues and receipts for this month
    const [monthDues, monthReceipts] = await Promise.all([
      RentDue.find({ rentMonth: cleanMonth }).lean(),
      RentReceived.find({ rentMonth: cleanMonth, status: { $ne: 'REVERSED' } }).lean(),
    ]);

    const propertySummaries = properties.map((prop) => {
      const propIdStr = prop._id.toString();

      const duesForProp = monthDues.filter((d) => d.propertyId?.toString() === propIdStr);
      const receiptsForProp = monthReceipts.filter((r) => r.propertyId?.toString() === propIdStr);

      const totalRentDue = round2(
        duesForProp.reduce((sum, d) => sum + d.expectedRentAmount, 0)
      );
      const totalReceived = round2(
        receiptsForProp.reduce((sum, r) => sum + r.amount, 0)
      );
      const currentAllocated = round2(
        receiptsForProp.reduce((sum, r) => sum + (r.allocatedCurrentMonth || 0), 0)
      );
      const priorCleared = round2(
        receiptsForProp.reduce((sum, r) => sum + (r.allocatedPreviousReceivable || 0), 0)
      );
      const advanceReceived = round2(
        receiptsForProp.reduce((sum, r) => sum + (r.allocatedAdvance || 0), 0)
      );
      const outstandingReceivable = Math.max(0, round2(totalRentDue - currentAllocated));

      return {
        propertyId: prop._id,
        plazaName: prop.plazaName,
        location: prop.location,
        city: prop.city,
        totalUnits: prop.units?.length || 0,
        activeLeasesCount: duesForProp.length,
        totalRentDue,
        totalReceived,
        currentAllocated,
        priorCleared,
        advanceReceived,
        outstandingReceivable,
      };
    });

    return apiSuccess(
      res,
      {
        month: cleanMonth,
        properties: propertySummaries,
      },
      'Property-wise rental income summary retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Property Rent Summary Error]:', error);
    return apiError(res, 'Failed to fetch property-wise rental summary.', 500);
  }
};

/**
 * @desc    Get account-wise rental income collection summary
 * @route   GET /api/rent-received/account-summary
 * @access  Private (Authenticated)
 */
export const getAccountRentSummary = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;
    const cleanMonth = month.trim();

    const accounts = await Account.find({ isActive: true }).sort({ type: 1, name: 1 }).lean();

    const receipts = await RentReceived.find({
      rentMonth: cleanMonth,
      status: { $ne: 'REVERSED' },
    }).lean();

    const accountBreakdown = accounts.map((acc) => {
      const accIdStr = acc._id.toString();
      const accReceipts = receipts.filter(
        (r) => r.receivingAccountId?.toString() === accIdStr
      );

      const totalReceived = round2(accReceipts.reduce((sum, r) => sum + r.amount, 0));

      return {
        accountId: acc._id,
        name: acc.name,
        type: acc.type,
        bankName: acc.bankName || '',
        cashHolder: acc.cashHolder || '',
        currentBalance: acc.currentBalance || 0,
        totalReceivedInMonth: totalReceived,
        receiptsCount: accReceipts.length,
      };
    }).filter((a) => a.totalReceivedInMonth > 0 || a.currentBalance > 0);

    return apiSuccess(
      res,
      {
        month: cleanMonth,
        accounts: accountBreakdown,
      },
      'Account-wise rental collection summary retrieved.'
    );
  } catch (error) {
    console.error('[Get Account Rent Summary Error]:', error);
    return apiError(res, 'Failed to fetch account-wise rent summary.', 500);
  }
};

/**
 * @desc    Helper for payment form: Get active lease, property, unit and rent due for a tenant
 * @route   GET /api/rent-received/tenant-lease/:tenantId
 * @access  Private (Authenticated)
 */
export const getTenantActiveLease = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { month = '2026-08' } = req.query;

    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return apiError(res, 'Invalid tenant ID.', 400);
    }

    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) {
      return apiError(res, 'Tenant not found.', 404);
    }

    // Find active agreement
    const agreement = await RentalAgreement.findOne({
      tenantId,
      status: 'ACTIVE',
    })
      .populate('propertyId', 'plazaName location city')
      .lean();

    if (!agreement) {
      return apiSuccess(
        res,
        {
          tenant,
          hasActiveAgreement: false,
          agreement: null,
        },
        'No active agreement found for tenant.'
      );
    }

    // Fetch property unit details
    const property = await Property.findById(agreement.propertyId._id).lean();
    const unit = property?.units?.find(
      (u) => u._id.toString() === agreement.unitId.toString()
    );

    // Fetch current month RentDue if exists
    const currentDue = await RentDue.findOne({
      agreementId: agreement._id,
      rentMonth: month.trim(),
    }).lean();

    // Fetch previous unpaid dues
    const priorDues = await RentDue.find({
      agreementId: agreement._id,
      rentMonth: { $lt: month.trim() },
      status: { $in: ['DUE', 'PARTIAL', 'OVERDUE'] },
    })
      .sort({ rentMonth: 1 })
      .lean();

    // Check payments already made against current month
    let alreadyPaidCurrent = 0;
    if (currentDue) {
      const pastReceipts = await RentReceived.find({
        rentDueId: currentDue._id,
        status: { $ne: 'REVERSED' },
      }).lean();
      alreadyPaidCurrent = round2(
        pastReceipts.reduce((sum, r) => sum + (r.allocatedCurrentMonth || 0), 0)
      );
    }

    const remainingCurrentDue = currentDue
      ? Math.max(0, round2(currentDue.expectedRentAmount - alreadyPaidCurrent))
      : agreement.monthlyRent;

    const priorOutstanding = priorDues.reduce(
      (sum, d) => sum + d.expectedRentAmount,
      0
    );

    return apiSuccess(
      res,
      {
        tenant,
        hasActiveAgreement: true,
        agreement: {
          _id: agreement._id,
          agreementNumber: agreement.agreementNumber,
          monthlyRent: agreement.monthlyRent,
          dueDay: agreement.dueDay,
          startDate: agreement.startDate,
          endDate: agreement.endDate,
        },
        property: {
          _id: property._id,
          plazaName: property.plazaName,
          location: property.location,
        },
        unit: unit
          ? {
              _id: unit._id,
              unitName: unit.unitName,
              floor: unit.floor,
              unitType: unit.unitType,
            }
          : null,
        currentRentDue: currentDue || null,
        currentMonthDueAmount: expectedCurrentRent(currentDue, agreement),
        alreadyPaidCurrent,
        remainingCurrentDue,
        priorDuesCount: priorDues.length,
        priorOutstandingAmount: round2(priorOutstanding),
        priorDues,
      },
      'Tenant active lease information retrieved.'
    );
  } catch (error) {
    console.error('[Get Tenant Active Lease Error]:', error);
    return apiError(res, 'Failed to fetch tenant lease data.', 500);
  }
};

const expectedCurrentRent = (currentDue, agreement) => {
  if (currentDue) return currentDue.expectedRentAmount;
  return agreement ? agreement.monthlyRent : 0;
};

/**
 * @desc    Reverse a posted rent receipt (Reversal Safety)
 * @route   PATCH /api/rent-received/:id/reverse
 * @access  Private (Admin, Admin Publisher)
 */
export const reverseRentReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Auditor reversal' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid rent receipt ID.', 400);
    }

    const receipt = await RentReceived.findById(id);
    if (!receipt) {
      return apiError(res, 'Rent receipt not found.', 404);
    }

    if (receipt.status === 'REVERSED') {
      return apiError(res, 'This rent receipt has already been reversed.', 400);
    }

    // 1. Reverse Account Balance: Subtract received amount from receiving account
    await Account.findByIdAndUpdate(receipt.receivingAccountId, {
      $inc: { currentBalance: -receipt.amount },
    });

    // 2. Mark original transaction as reversed or create reversal entry
    if (receipt.transactionId) {
      await Transaction.findByIdAndUpdate(receipt.transactionId, {
        detail: `[REVERSED] ${receipt.description}. Reason: ${reason}`,
      });
    }

    // 3. Mark receipt status as REVERSED
    receipt.status = 'REVERSED';
    receipt.description = `[REVERSED on ${new Date().toISOString()}] ${receipt.description}. Reason: ${reason}`;
    receipt.updatedBy = req.user?._id;
    await receipt.save();

    // 4. Recalculate and restore RentDue status
    if (receipt.rentDueId) {
      const remainingReceipts = await RentReceived.find({
        rentDueId: receipt.rentDueId,
        status: { $ne: 'REVERSED' },
      }).lean();

      const totalActivePaid = remainingReceipts.reduce(
        (sum, r) => sum + (r.allocatedCurrentMonth || 0),
        0
      );

      const dueDoc = await RentDue.findById(receipt.rentDueId);
      if (dueDoc) {
        let restoredStatus = 'DUE';
        if (totalActivePaid >= dueDoc.expectedRentAmount) {
          restoredStatus = 'PAID';
        } else if (totalActivePaid > 0) {
          restoredStatus = 'PARTIAL';
        }
        await RentDue.findByIdAndUpdate(receipt.rentDueId, { status: restoredStatus });
      }
    }

    const updatedAccount = await Account.findById(receipt.receivingAccountId).lean();

    return apiSuccess(
      res,
      {
        receipt,
        receivingAccount: {
          _id: updatedAccount._id,
          name: updatedAccount.name,
          currentBalance: updatedAccount.currentBalance,
        },
      },
      `Rent receipt ${receipt.receiptNumber} successfully reversed.`
    );
  } catch (error) {
    console.error('[Reverse Rent Receipt Error]:', error);
    return apiError(res, 'Failed to reverse rent receipt.', 500);
  }
};

export default {
  recordRentReceived,
  getRentReceipts,
  getRentReceiptById,
  getRentReceivedSummary,
  getPropertyRentSummary,
  getAccountRentSummary,
  getTenantActiveLease,
  reverseRentReceipt,
};
