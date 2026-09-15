import mongoose from 'mongoose';
import RentalAgreement from '../models/RentalAgreement.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentDue from '../models/RentDue.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { checkAgreementOverlap } from '../middleware/validateTenancy.js';

/**
 * Helper to synchronize Unit status when agreement state changes
 */
const syncUnitOccupancy = async (propertyId, unitId) => {
  try {
    const property = await Property.findById(propertyId);
    if (!property) return;

    const unit = property.units.id(unitId);
    if (!unit) return;

    // Check if any ACTIVE agreement exists for this unit
    const activeAgreement = await RentalAgreement.findOne({
      propertyId,
      unitId,
      status: 'ACTIVE',
    }).populate('tenantId', 'fullName');

    if (activeAgreement) {
      unit.status = 'OCCUPIED';
      unit.tenantName = activeAgreement.tenantId?.fullName || unit.tenantName;
      unit.agreedRent = activeAgreement.monthlyRent;
      unit.dueDay = activeAgreement.dueDay;
      unit.renewalDate = activeAgreement.renewalDate || null;
    } else {
      // If no active lease remains, set to VACANT (unless currently under MAINTENANCE)
      if (unit.status !== 'MAINTENANCE' && unit.status !== 'INACTIVE') {
        unit.status = 'VACANT';
        unit.tenantName = null;
      }
    }

    await property.save();
  } catch (err) {
    console.error('[Sync Unit Occupancy Error]:', err);
  }
};

/**
 * Generate sequential human-readable agreement number: e.g. AGR-2026-0001
 */
const generateAgreementNumber = async () => {
  const currentYear = new Date().getFullYear();
  const prefix = `AGR-${currentYear}-`;
  const count = await RentalAgreement.countDocuments({
    agreementNumber: new RegExp(`^${prefix}`),
  });
  const sequential = String(count + 1).padStart(4, '0');
  let candidate = `${prefix}${sequential}`;

  // Ensure collision-free
  let exists = await RentalAgreement.findOne({ agreementNumber: candidate });
  let attempts = 1;
  while (exists) {
    attempts += 1;
    candidate = `${prefix}${String(count + attempts).padStart(4, '0')}`;
    exists = await RentalAgreement.findOne({ agreementNumber: candidate });
  }

  return candidate;
};

/**
 * @desc    Get next proposed agreement number
 * @route   GET /api/agreements/next-number
 * @access  Private (Authenticated)
 */
export const getNextNumber = async (req, res) => {
  try {
    const nextNumber = await generateAgreementNumber();
    return apiSuccess(res, { nextNumber }, 'Next agreement number generated.');
  } catch (error) {
    console.error('[Get Next Number Error]:', error);
    return apiError(res, 'Failed to generate agreement number.', 500);
  }
};

/**
 * @desc    Get all rental agreements with filters & summary
 * @route   GET /api/agreements
 * @access  Private (Authenticated)
 */
export const getAgreements = async (req, res) => {
  try {
    const { search, status, propertyId, tenantId, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
      query.propertyId = propertyId;
    }

    if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
      query.tenantId = tenantId;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      // Search agreement number directly or match tenant / property names via pre-lookup
      const matchingTenants = await Tenant.find({ fullName: regex }).select('_id');
      const tenantIds = matchingTenants.map((t) => t._id);

      const matchingProperties = await Property.find({
        $or: [{ propertyName: regex }, { plazaName: regex }],
      }).select('_id');
      const propertyIds = matchingProperties.map((p) => p._id);

      query.$or = [
        { agreementNumber: regex },
        { tenantId: { $in: tenantIds } },
        { propertyId: { $in: propertyIds } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await RentalAgreement.countDocuments(query);
    const agreements = await RentalAgreement.find(query)
      .populate('tenantId', 'fullName phone email companyName identificationNumber status')
      .populate('propertyId', 'propertyName plazaName propertyCode city address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Attach unit details
    const propertyIds = [...new Set(agreements.map((a) => a.propertyId?._id).filter(Boolean))];
    const properties = await Property.find({ _id: { $in: propertyIds } }).lean();
    const propertyMap = new Map();
    properties.forEach((p) => {
      propertyMap.set(p._id.toString(), p);
    });

    const enrichedAgreements = agreements.map((agr) => {
      const prop = propertyMap.get(agr.propertyId?._id?.toString());
      const unit = prop?.units?.find((u) => u._id.toString() === agr.unitId?.toString());
      return {
        ...agr,
        unitDetails: unit
          ? {
              unitName: unit.unitName,
              unitNumber: unit.unitNumber,
              unitType: unit.unitType,
              floor: unit.floor,
              area: unit.area,
              areaUnit: unit.areaUnit,
              status: unit.status,
            }
          : null,
      };
    });

    // Macro stats across all agreements in portfolio
    const totalAgreements = await RentalAgreement.countDocuments();
    const activeAgreements = await RentalAgreement.countDocuments({ status: 'ACTIVE' });
    const expiredAgreements = await RentalAgreement.countDocuments({ status: 'EXPIRED' });
    const terminatedAgreements = await RentalAgreement.countDocuments({ status: 'TERMINATED' });

    // Calculate total agreed monthly rent roll from active agreements
    const activeAgreementsList = await RentalAgreement.find({ status: 'ACTIVE' }).select('monthlyRent');
    const totalMonthlyRentRoll = activeAgreementsList.reduce((sum, a) => sum + (a.monthlyRent || 0), 0);

    const summary = {
      totalAgreements,
      activeAgreements,
      expiredAgreements,
      terminatedAgreements,
      totalMonthlyRentRoll,
    };

    return apiSuccess(
      res,
      {
        agreements: enrichedAgreements,
        summary,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        },
      },
      `Found ${enrichedAgreements.length} rental agreements.`
    );
  } catch (error) {
    console.error('[Get Agreements Error]:', error);
    return apiError(res, 'Failed to fetch rental agreements.', 500);
  }
};

/**
 * @desc    Get single agreement by ID with full details and rent due ledger
 * @route   GET /api/agreements/:id
 * @access  Private (Authenticated)
 */
export const getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid agreement ID.', 400);
    }

    const agreement = await RentalAgreement.findById(id)
      .populate('tenantId')
      .populate('propertyId')
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .lean();

    if (!agreement) {
      return apiError(res, 'Rental agreement not found.', 404);
    }

    // Attach unit details
    const property = await Property.findById(agreement.propertyId?._id).lean();
    const unit = property?.units?.find((u) => u._id.toString() === agreement.unitId.toString());

    // Fetch rent due records generated under this agreement
    const rentDueRecords = await RentDue.find({ agreementId: id })
      .sort({ rentMonth: -1 })
      .lean();

    return apiSuccess(
      res,
      {
        agreement: {
          ...agreement,
          unitDetails: unit || null,
        },
        rentDueRecords,
      },
      'Rental agreement retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Agreement By ID Error]:', error);
    return apiError(res, 'Failed to fetch rental agreement.', 500);
  }
};

/**
 * @desc    Create a new rental agreement (Admin only)
 * @route   POST /api/agreements
 * @access  Private (Admin)
 */
export const createAgreement = async (req, res) => {
  try {
    const {
      agreementNumber,
      tenantId,
      propertyId,
      unitId,
      startDate,
      endDate,
      renewalDate,
      dueDay = 5,
      monthlyRent,
      previousRent = 0,
      securityDeposit = 0,
      rentIncreaseAmount = 0,
      rentIncreasePercentage = 0,
      paymentFrequency = 'MONTHLY',
      status = 'ACTIVE',
      notes = '',
    } = req.body;

    // Use provided agreement number or generate a new sequential one
    let assignedNumber = agreementNumber?.trim().toUpperCase();
    if (!assignedNumber) {
      assignedNumber = await generateAgreementNumber();
    } else {
      const existing = await RentalAgreement.findOne({ agreementNumber: assignedNumber });
      if (existing) {
        return apiError(
          res,
          `Agreement number '${assignedNumber}' is already in use.`,
          409,
          { agreementNumber: 'Agreement number must be unique.' }
        );
      }
    }

    const newAgreement = await RentalAgreement.create({
      agreementNumber: assignedNumber,
      tenantId,
      propertyId,
      unitId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      renewalDate: renewalDate ? new Date(renewalDate) : null,
      dueDay: Number(dueDay) || 5,
      monthlyRent: Number(monthlyRent),
      previousRent: Number(previousRent) || 0,
      securityDeposit: Number(securityDeposit) || 0,
      rentIncreaseAmount: Number(rentIncreaseAmount) || 0,
      rentIncreasePercentage: Number(rentIncreasePercentage) || 0,
      paymentFrequency,
      status,
      notes: notes.trim(),
      createdBy: req.user._id,
    });

    // Synchronize Unit Occupancy
    if (status === 'ACTIVE') {
      await syncUnitOccupancy(propertyId, unitId);
    }

    return apiSuccess(
      res,
      newAgreement,
      `Rental Agreement '${newAgreement.agreementNumber}' created successfully.`,
      201
    );
  } catch (error) {
    console.error('[Create Agreement Error]:', error);
    return apiError(res, error.message || 'Failed to create rental agreement.', 500);
  }
};

/**
 * @desc    Update rental agreement (Admin only)
 * @route   PUT /api/agreements/:id
 * @access  Private (Admin)
 */
export const updateAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid agreement ID.', 400);
    }

    const agreement = await RentalAgreement.findById(id);
    if (!agreement) {
      return apiError(res, 'Rental agreement not found.', 404);
    }

    const {
      startDate,
      endDate,
      renewalDate,
      dueDay,
      monthlyRent,
      previousRent,
      securityDeposit,
      rentIncreaseAmount,
      rentIncreasePercentage,
      paymentFrequency,
      status,
      notes,
    } = req.body;

    const oldStatus = agreement.status;

    if (startDate !== undefined) agreement.startDate = new Date(startDate);
    if (endDate !== undefined) agreement.endDate = new Date(endDate);
    if (renewalDate !== undefined) agreement.renewalDate = renewalDate ? new Date(renewalDate) : null;
    if (dueDay !== undefined) agreement.dueDay = Number(dueDay);
    if (monthlyRent !== undefined) agreement.monthlyRent = Number(monthlyRent);
    if (previousRent !== undefined) agreement.previousRent = Number(previousRent);
    if (securityDeposit !== undefined) agreement.securityDeposit = Number(securityDeposit);
    if (rentIncreaseAmount !== undefined) agreement.rentIncreaseAmount = Number(rentIncreaseAmount);
    if (rentIncreasePercentage !== undefined) agreement.rentIncreasePercentage = Number(rentIncreasePercentage);
    if (paymentFrequency !== undefined) agreement.paymentFrequency = paymentFrequency;
    if (status !== undefined) agreement.status = status;
    if (notes !== undefined) agreement.notes = notes.trim();
    agreement.updatedBy = req.user._id;

    await agreement.save();

    // Re-evaluate unit occupancy if status changed or unit details shifted
    if (status && status !== oldStatus) {
      await syncUnitOccupancy(agreement.propertyId, agreement.unitId);
    }

    return apiSuccess(
      res,
      agreement,
      `Rental Agreement '${agreement.agreementNumber}' updated successfully.`
    );
  } catch (error) {
    console.error('[Update Agreement Error]:', error);
    return apiError(res, error.message || 'Failed to update rental agreement.', 500);
  }
};

/**
 * @desc    Toggle or transition agreement status (e.g., TERMINATED, EXPIRED, ACTIVE) (Admin only)
 * @route   PATCH /api/agreements/:id/status
 * @access  Private (Admin)
 */
export const toggleAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid agreement ID.', 400);
    }

    const validStatuses = ['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED', 'INACTIVE'];
    if (!validStatuses.includes(status)) {
      return apiError(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const agreement = await RentalAgreement.findById(id);
    if (!agreement) {
      return apiError(res, 'Rental agreement not found.', 404);
    }

    // If activating, verify no other active agreement overlaps
    if (status === 'ACTIVE' && agreement.status !== 'ACTIVE') {
      const overlapping = await checkAgreementOverlap({
        propertyId: agreement.propertyId,
        unitId: agreement.unitId,
        startDate: agreement.startDate,
        endDate: agreement.endDate,
        excludeAgreementId: agreement._id,
      });

      if (overlapping) {
        return apiError(
          res,
          `Cannot activate: unit already has an active lease (${overlapping.agreementNumber}).`,
          409
        );
      }
    }

    agreement.status = status;
    agreement.updatedBy = req.user._id;
    await agreement.save();

    // Re-synchronize unit occupancy state
    await syncUnitOccupancy(agreement.propertyId, agreement.unitId);

    return apiSuccess(
      res,
      {
        id: agreement._id,
        agreementNumber: agreement.agreementNumber,
        status: agreement.status,
      },
      `Agreement '${agreement.agreementNumber}' status updated to ${agreement.status}.`
    );
  } catch (error) {
    console.error('[Toggle Agreement Status Error]:', error);
    return apiError(res, 'Failed to update agreement status.', 500);
  }
};

export default {
  getAgreements,
  getAgreementById,
  createAgreement,
  updateAgreement,
  toggleAgreementStatus,
  getNextNumber,
};
