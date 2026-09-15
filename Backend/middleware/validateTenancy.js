import mongoose from 'mongoose';
import RentalAgreement from '../models/RentalAgreement.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import { apiError } from '../utils/apiResponse.js';

/**
 * Validate Tenant Creation / Update payload
 */
export const validateTenant = (req, res, next) => {
  const isUpdate = req.method === 'PUT' || req.method === 'PATCH';
  const { fullName, phone, email, status } = req.body;
  const errors = {};

  if (!isUpdate || fullName !== undefined) {
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      errors.fullName = 'Tenant full name is required.';
    }
  }

  if (!isUpdate || phone !== undefined) {
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      errors.phone = 'Valid phone number is required.';
    }
  }

  if (email !== undefined && email && typeof email === 'string' && email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      errors.email = 'Invalid email address format.';
    }
  }

  if (status !== undefined && !['ACTIVE', 'INACTIVE'].includes(status)) {
    errors.status = 'Status must be ACTIVE or INACTIVE.';
  }

  if (Object.keys(errors).length > 0) {
    return apiError(res, 'Tenant validation failed.', 400, errors);
  }

  next();
};

/**
 * Helper to check if an active agreement overlaps with a given date range for the same unit
 */
export const checkAgreementOverlap = async ({
  propertyId,
  unitId,
  startDate,
  endDate,
  excludeAgreementId = null,
}) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const query = {
    propertyId: new mongoose.Types.ObjectId(propertyId),
    unitId: new mongoose.Types.ObjectId(unitId),
    status: 'ACTIVE',
    // Date overlap formula: (ExistingStart <= NewEnd) AND (ExistingEnd >= NewStart)
    startDate: { $lte: end },
    endDate: { $gte: start },
  };

  if (excludeAgreementId) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeAgreementId) };
  }

  const overlapping = await RentalAgreement.findOne(query)
    .populate('tenantId', 'fullName phone')
    .lean();

  return overlapping;
};

/**
 * Validate Rental Agreement payload & verify unit / tenant integrity
 */
export const validateAgreement = async (req, res, next) => {
  try {
    const isUpdate = req.method === 'PUT' || req.method === 'PATCH';
    const {
      tenantId,
      propertyId,
      unitId,
      startDate,
      endDate,
      monthlyRent,
      dueDay,
      status = 'ACTIVE',
    } = req.body;

    const errors = {};

    // ID validations (mandatory on create, optional on update)
    if (!isUpdate || tenantId !== undefined) {
      if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
        errors.tenantId = 'A valid Tenant must be selected.';
      }
    }
    if (!isUpdate || propertyId !== undefined) {
      if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
        errors.propertyId = 'A valid Property must be selected.';
      }
    }
    if (!isUpdate || unitId !== undefined) {
      if (!unitId || !mongoose.Types.ObjectId.isValid(unitId)) {
        errors.unitId = 'A valid Unit must be selected.';
      }
    }

    // Dates
    if (!isUpdate || startDate !== undefined) {
      if (!startDate || isNaN(new Date(startDate).getTime())) {
        errors.startDate = 'A valid Start Date is required.';
      }
    }
    if (!isUpdate || endDate !== undefined) {
      if (!endDate || isNaN(new Date(endDate).getTime())) {
        errors.endDate = 'A valid End Date is required.';
      }
    }

    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      errors.endDate = 'End Date must be strictly after Start Date.';
    }

    // Rent
    if (!isUpdate || monthlyRent !== undefined) {
      if (monthlyRent === undefined || monthlyRent === null || isNaN(Number(monthlyRent)) || Number(monthlyRent) < 0) {
        errors.monthlyRent = 'Monthly rent must be a non-negative number.';
      }
    }

    // Due Day
    if (dueDay !== undefined) {
      const dayNum = Number(dueDay);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
        errors.dueDay = 'Due day must be between 1 and 31.';
      }
    }

    if (Object.keys(errors).length > 0) {
      return apiError(res, 'Rental agreement validation failed.', 400, errors);
    }

    // Verify Tenant exists if provided
    if (tenantId) {
      const tenantExists = await Tenant.findById(tenantId);
      if (!tenantExists) {
        return apiError(res, 'Referenced tenant not found in database.', 404, {
          tenantId: 'Tenant does not exist.',
        });
      }
    }

    // Verify Property and Unit relationship if provided
    if (propertyId && unitId) {
      const property = await Property.findById(propertyId);
      if (!property) {
        return apiError(res, 'Referenced property not found in database.', 404, {
          propertyId: 'Property does not exist.',
        });
      }

      const unit = property.units.id(unitId);
      if (!unit) {
        return apiError(
          res,
          `Unit does not belong to property '${property.propertyName}'.`,
          400,
          { unitId: 'Unit not found on this property.' }
        );
      }
    }

    // Occupancy overlap validation for ACTIVE agreements
    if (status === 'ACTIVE') {
      const excludeId = req.params?.id || null;
      const overlapping = await checkAgreementOverlap({
        propertyId,
        unitId,
        startDate,
        endDate,
        excludeAgreementId: excludeId,
      });

      if (overlapping) {
        return apiError(
          res,
          `This unit already has an active rental agreement (${overlapping.agreementNumber}) for this period (${new Date(
            overlapping.startDate
          ).toLocaleDateString()} to ${new Date(overlapping.endDate).toLocaleDateString()}).`,
          409,
          {
            unitId: 'Unit already has an active lease overlapping this period.',
            conflictAgreement: overlapping.agreementNumber,
          }
        );
      }
    }

    next();
  } catch (error) {
    console.error('[Validate Agreement Middleware Error]:', error);
    return apiError(res, 'Internal validation error during agreement check.', 500);
  }
};

/**
 * Validate Monthly Rent Due generation request
 */
export const validateRentDueGeneration = (req, res, next) => {
  const { month } = req.body;
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())) {
    return apiError(
      res,
      'Valid month in YYYY-MM format is required (e.g. 2026-08).',
      400,
      { month: 'Format must be YYYY-MM' }
    );
  }
  req.body.month = month.trim();
  next();
};

export default {
  validateTenant,
  validateAgreement,
  validateRentDueGeneration,
  checkAgreementOverlap,
};
