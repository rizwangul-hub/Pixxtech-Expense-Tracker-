import mongoose from 'mongoose';
import RentDue from '../models/RentDue.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentReceived from '../models/RentReceived.js';
import Transaction from '../models/Transaction.js';
import { round2 } from '../services/ledgerService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * Automatically synchronize RentDue records with actual RentReceived and Transaction records
 */
export const syncRentDueWithCollections = async (filter = {}) => {
  const query = {};
  if (filter.month || filter.rentMonth) {
    query.rentMonth = filter.month || filter.rentMonth;
  }
  if (filter.agreementId) query.agreementId = filter.agreementId;
  if (filter.unitId) query.unitId = filter.unitId;
  if (filter.propertyId) query.propertyId = filter.propertyId;

  const rentDues = await RentDue.find(query);
  if (!rentDues || rentDues.length === 0) return;

  const distinctMonths = [...new Set(rentDues.map((rd) => rd.rentMonth))];

  // Fetch all non-reversed rent receipts for these months
  const [rentReceipts, rentTransactions] = await Promise.all([
    RentReceived.find({
      rentMonth: { $in: distinctMonths },
      status: { $ne: 'REVERSED' },
    }).lean(),
    Transaction.find({
      rentMonth: { $in: distinctMonths },
      transactionType: 'INCOME',
      reportCategory: 'Rent',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).lean(),
  ]);

  for (const rd of rentDues) {
    const agreementIdStr = rd.agreementId?.toString();
    const unitIdStr = rd.unitId?.toString();
    const targetMonth = rd.rentMonth;

    // Payments from RentReceived
    const matchingReceipts = rentReceipts.filter((rr) => {
      if (rr.rentMonth !== targetMonth) return false;
      if (agreementIdStr && rr.agreementId?.toString() === agreementIdStr) return true;
      if (unitIdStr && rr.unitId?.toString() === unitIdStr) return true;
      return false;
    });

    let paidTotal = matchingReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);

    // Fallback: If no RentReceived but matching verified Transactions exist
    if (paidTotal === 0) {
      const matchingTxs = rentTransactions.filter((tx) => {
        if (tx.rentMonth !== targetMonth) return false;
        if (agreementIdStr && tx.agreementId?.toString() === agreementIdStr) return true;
        if (unitIdStr && tx.unitId?.toString() === unitIdStr) return true;
        return false;
      });
      paidTotal = matchingTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    }

    paidTotal = round2(paidTotal);
    const expected = round2(rd.expectedRentAmount || 0);
    const remaining = round2(Math.max(0, expected - paidTotal));

    let newStatus = rd.status;
    if (remaining <= 0) {
      newStatus = 'PAID';
    } else if (paidTotal > 0) {
      newStatus = 'PARTIAL';
    } else {
      const now = new Date();
      if (rd.dueDate && now > new Date(rd.dueDate)) {
        newStatus = 'OVERDUE';
      } else {
        newStatus = 'DUE';
      }
    }

    if (rd.paidAmount !== paidTotal || rd.remainingAmount !== remaining || rd.status !== newStatus) {
      rd.paidAmount = paidTotal;
      rd.remainingAmount = remaining;
      rd.status = newStatus;
      await rd.save();
    }
  }
};

/**
 * Calculate valid due date capping day at month-end for shorter months (e.g. Feb 28/29)
 */
export const calculateDueDate = (year, monthNum, preferredDay) => {
  // Get number of days in this month
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const cappedDay = Math.min(Math.max(1, preferredDay || 5), daysInMonth);
  return new Date(Date.UTC(year, monthNum - 1, cappedDay, 12, 0, 0));
};

/**
 * @desc    Generate monthly rent due records for active agreements
 * @route   POST /api/rent-due/generate
 * @access  Private (Admin)
 */
export const generateMonthlyRentDue = async (req, res) => {
  try {
    const { month, propertyId, agreementId } = req.body;

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));
    const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const monthEnd = new Date(Date.UTC(year, monthNum - 1, daysInMonth, 23, 59, 59, 999));

    // Build filter for eligible agreements
    const agreementFilter = {
      status: 'ACTIVE',
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart },
    };

    if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
      agreementFilter.propertyId = propertyId;
    }

    if (agreementId && mongoose.Types.ObjectId.isValid(agreementId)) {
      agreementFilter._id = agreementId;
    }

    const eligibleAgreements = await RentalAgreement.find(agreementFilter)
      .populate('tenantId', 'fullName phone status')
      .populate('propertyId', 'propertyName plazaName')
      .lean();

    if (!eligibleAgreements || eligibleAgreements.length === 0) {
      return apiSuccess(
        res,
        {
          month,
          totalEligible: 0,
          newlyGenerated: 0,
          alreadyExisting: 0,
          totalAmountGenerated: 0,
          records: [],
        },
        `No active rental agreements found for ${month}.`
      );
    }

    let newlyGenerated = 0;
    let alreadyExisting = 0;
    let totalAmountGenerated = 0;
    const generatedRecords = [];

    for (const agreement of eligibleAgreements) {
      // Check idempotency: check if rent due already exists for this agreement & month
      const existing = await RentDue.findOne({
        agreementId: agreement._id,
        rentMonth: month,
      });

      if (existing) {
        alreadyExisting += 1;
        continue;
      }

      const dueDate = calculateDueDate(year, monthNum, agreement.dueDay);

      const created = await RentDue.create({
        agreementId: agreement._id,
        tenantId: agreement.tenantId._id || agreement.tenantId,
        propertyId: agreement.propertyId._id || agreement.propertyId,
        unitId: agreement.unitId,
        rentMonth: month,
        dueDate,
        expectedRentAmount: agreement.monthlyRent,
        status: 'DUE',
        notes: `Generated for ${month} via agreement ${agreement.agreementNumber}`,
        createdBy: req.user._id,
      });

      newlyGenerated += 1;
      totalAmountGenerated += created.expectedRentAmount;
      generatedRecords.push(created);
    }

    // Sync newly generated records against any already collected rent for this month
    await syncRentDueWithCollections({ rentMonth: month, propertyId, agreementId });

    return apiSuccess(
      res,
      {
        month,
        totalEligible: eligibleAgreements.length,
        newlyGenerated,
        alreadyExisting,
        totalAmountGenerated,
        recordsCount: generatedRecords.length,
      },
      `Monthly rent generation for ${month} completed: ${newlyGenerated} generated, ${alreadyExisting} already present.`,
      201
    );
  } catch (error) {
    console.error('[Generate Rent Due Error]:', error);
    return apiError(res, error.message || 'Failed to generate monthly rent due.', 500);
  }
};

/**
 * @desc    Get monthly rent due register with filters and summary
 * @route   GET /api/rent-due
 * @access  Private (Authenticated)
 */
export const getRentDue = async (req, res) => {
  try {
    const { month, propertyId, tenantId, status, page = 1, limit = 50 } = req.query;
    const query = {};

    if (month && month.trim()) {
      query.rentMonth = month.trim();
    }

    if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
      query.propertyId = propertyId;
    }

    if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
      query.tenantId = tenantId;
    }

    // Automatically synchronize RentDue records with real collections before returning
    await syncRentDueWithCollections(query);

    if (status) {
      query.status = status;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await RentDue.countDocuments(query);
    const rentDueRecords = await RentDue.find(query)
      .populate('agreementId', 'agreementNumber monthlyRent dueDay startDate endDate status')
      .populate('tenantId', 'fullName phone email companyName identificationNumber')
      .populate('propertyId', 'propertyName plazaName propertyCode city')
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Attach unit details
    const propertyIds = [...new Set(rentDueRecords.map((r) => r.propertyId?._id).filter(Boolean))];
    const properties = await Property.find({ _id: { $in: propertyIds } }).lean();
    const propertyMap = new Map();
    properties.forEach((p) => {
      propertyMap.set(p._id.toString(), p);
    });

    const enrichedRecords = rentDueRecords.map((rd) => {
      const prop = propertyMap.get(rd.propertyId?._id?.toString());
      const unit = prop?.units?.find((u) => u._id.toString() === rd.unitId?.toString());
      const expected = round2(rd.expectedRentAmount || 0);
      const paid = round2(rd.paidAmount || 0);
      const remaining = rd.remainingAmount !== undefined ? rd.remainingAmount : Math.max(0, expected - paid);
      return {
        ...rd,
        expectedRentAmount: expected,
        paidAmount: paid,
        remainingAmount: remaining,
        unitDetails: unit
          ? {
              unitName: unit.unitName,
              unitNumber: unit.unitNumber,
              unitType: unit.unitType,
              floor: unit.floor,
            }
          : null,
      };
    });

    // Aggregates for the filtered dataset
    const allMatching = await RentDue.find(query).select('expectedRentAmount paidAmount remainingAmount status').lean();
    const totalExpectedAmount = round2(allMatching.reduce((sum, r) => sum + (r.expectedRentAmount || 0), 0));
    const totalPaidAmount = round2(allMatching.reduce((sum, r) => sum + (r.paidAmount || 0), 0));
    const totalRemainingAmount = round2(allMatching.reduce((sum, r) => sum + (r.remainingAmount !== undefined ? r.remainingAmount : Math.max(0, (r.expectedRentAmount || 0) - (r.paidAmount || 0))), 0));
    const dueCount = allMatching.filter((r) => r.status === 'DUE').length;
    const partialCount = allMatching.filter((r) => r.status === 'PARTIAL').length;
    const overdueCount = allMatching.filter((r) => r.status === 'OVERDUE').length;
    const paidCount = allMatching.filter((r) => r.status === 'PAID').length;

    const summary = {
      totalRecords: totalCount,
      totalExpectedAmount,
      totalPaidAmount,
      totalRemainingAmount,
      dueCount,
      partialCount,
      overdueCount,
      paidCount,
      filteredMonth: month || 'ALL',
    };

    return apiSuccess(
      res,
      {
        rentDueRecords: enrichedRecords,
        summary,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        },
      },
      `Found ${enrichedRecords.length} rent due records.`
    );
  } catch (error) {
    console.error('[Get Rent Due Error]:', error);
    return apiError(res, 'Failed to fetch rent due records.', 500);
  }
};

/**
 * @desc    Get rent due summary for top metrics
 * @route   GET /api/rent-due/summary
 * @access  Private (Authenticated)
 */
export const getRentDueSummary = async (req, res) => {
  try {
    const { month } = req.query;
    const query = {};
    if (month && month.trim()) {
      query.rentMonth = month.trim();
    }

    await syncRentDueWithCollections(query);

    const records = await RentDue.find(query).select('expectedRentAmount paidAmount remainingAmount status rentMonth').lean();
    const totalExpectedRent = round2(records.reduce((sum, r) => sum + (r.expectedRentAmount || 0), 0));
    const totalPaidRent = round2(records.reduce((sum, r) => sum + (r.paidAmount || 0), 0));
    const totalRemainingDue = round2(records.reduce((sum, r) => sum + (r.remainingAmount !== undefined ? r.remainingAmount : Math.max(0, (r.expectedRentAmount || 0) - (r.paidAmount || 0))), 0));
    const activeAgreements = await RentalAgreement.countDocuments({ status: 'ACTIVE' });
    const overdueRecords = records.filter((r) => r.status === 'OVERDUE').length;
    const paidRecords = records.filter((r) => r.status === 'PAID').length;
    const partialRecords = records.filter((r) => r.status === 'PARTIAL').length;
    const dueRecords = records.filter((r) => r.status === 'DUE').length;

    return apiSuccess(
      res,
      {
        month: month || 'ALL',
        totalExpectedRent,
        totalPaidRent,
        totalRemainingDue,
        totalRecords: records.length,
        paidRecords,
        partialRecords,
        dueRecords,
        activeAgreements,
        overdueRecords,
      },
      'Rent due summary calculated successfully.'
    );
  } catch (error) {
    console.error('[Get Rent Due Summary Error]:', error);
    return apiError(res, 'Failed to calculate rent due summary.', 500);
  }
};

/**
 * @desc    Get single rent due record by ID
 * @route   GET /api/rent-due/:id
 * @access  Private (Authenticated)
 */
export const getRentDueById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid rent due ID.', 400);
    }

    const rentDue = await RentDue.findById(id)
      .populate('agreementId')
      .populate('tenantId')
      .populate('propertyId')
      .lean();

    if (!rentDue) {
      return apiError(res, 'Rent due record not found.', 404);
    }

    const property = await Property.findById(rentDue.propertyId?._id).lean();
    const unit = property?.units?.find((u) => u._id.toString() === rentDue.unitId.toString());

    return apiSuccess(
      res,
      {
        rentDue: {
          ...rentDue,
          unitDetails: unit || null,
        },
      },
      'Rent due record retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Rent Due By ID Error]:', error);
    return apiError(res, 'Failed to fetch rent due record.', 500);
  }
};

export default {
  generateMonthlyRentDue,
  getRentDue,
  getRentDueSummary,
  getRentDueById,
};
