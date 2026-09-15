import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import RentDue from '../models/RentDue.js';
import Property from '../models/Property.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * @desc    Get all tenants with search, status filtering, and current tenancy info
 * @route   GET /api/tenants
 * @access  Private (Authenticated)
 */
export const getTenants = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { fullName: regex },
        { phone: regex },
        { alternatePhone: regex },
        { email: regex },
        { companyName: regex },
        { identificationNumber: regex },
        { city: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await Tenant.countDocuments(query);
    const tenants = await Tenant.find(query)
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Fetch active rental agreements for these tenants to enrich directory list
    const tenantIds = tenants.map((t) => t._id);
    const activeAgreements = await RentalAgreement.find({
      tenantId: { $in: tenantIds },
      status: 'ACTIVE',
    })
      .populate('propertyId', 'propertyName plazaName propertyCode city')
      .lean();

    // Attach current active lease summary to each tenant
    const propertyIds = [...new Set(activeAgreements.map((a) => a.propertyId?._id).filter(Boolean))];
    const properties = await Property.find({ _id: { $in: propertyIds } }).lean();
    const propertyMap = new Map();
    properties.forEach((p) => {
      propertyMap.set(p._id.toString(), p);
    });

    const enrichedTenants = tenants.map((tenant) => {
      const activeLease = activeAgreements.find(
        (a) => a.tenantId.toString() === tenant._id.toString()
      );

      let currentTenancy = null;
      if (activeLease) {
        const prop = propertyMap.get(activeLease.propertyId?._id?.toString());
        const unit = prop?.units?.find((u) => u._id.toString() === activeLease.unitId.toString());
        currentTenancy = {
          agreementId: activeLease._id,
          agreementNumber: activeLease.agreementNumber,
          propertyId: activeLease.propertyId?._id,
          propertyName: activeLease.propertyId?.propertyName || activeLease.propertyId?.plazaName || 'Property',
          unitId: activeLease.unitId,
          unitName: unit?.unitName || unit?.unitNumber || 'Unit',
          monthlyRent: activeLease.monthlyRent,
          dueDay: activeLease.dueDay,
          startDate: activeLease.startDate,
          endDate: activeLease.endDate,
        };
      }

      return {
        ...tenant,
        currentTenancy,
      };
    });

    // Macro counts for directory header cards
    const totalTenants = await Tenant.countDocuments();
    const activeTenants = await Tenant.countDocuments({ status: 'ACTIVE' });
    const inactiveTenants = await Tenant.countDocuments({ status: 'INACTIVE' });
    const tenantsWithActiveLease = activeAgreements.length;

    const summary = {
      totalTenants,
      activeTenants,
      inactiveTenants,
      tenantsWithActiveLease,
    };

    return apiSuccess(
      res,
      {
        tenants: enrichedTenants,
        summary,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        },
      },
      `Found ${enrichedTenants.length} tenants.`
    );
  } catch (error) {
    console.error('[Get Tenants Error]:', error);
    return apiError(res, 'Failed to fetch tenants directory.', 500);
  }
};

/**
 * @desc    Get single tenant by ID with active lease, agreement history, and rent due history
 * @route   GET /api/tenants/:id
 * @access  Private (Authenticated)
 */
export const getTenantById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid tenant ID.', 400);
    }

    const tenant = await Tenant.findById(id)
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .lean();

    if (!tenant) {
      return apiError(res, 'Tenant not found.', 404);
    }

    // Retrieve full agreement history for this tenant
    const agreements = await RentalAgreement.find({ tenantId: id })
      .populate('propertyId', 'propertyName plazaName propertyCode city address')
      .sort({ startDate: -1 })
      .lean();

    // Attach unit metadata to agreements
    const propertyIds = [...new Set(agreements.map((a) => a.propertyId?._id).filter(Boolean))];
    const properties = await Property.find({ _id: { $in: propertyIds } }).lean();
    const propertyMap = new Map();
    properties.forEach((p) => {
      propertyMap.set(p._id.toString(), p);
    });

    const enrichedAgreements = agreements.map((agr) => {
      const prop = propertyMap.get(agr.propertyId?._id?.toString());
      const unit = prop?.units?.find((u) => u._id.toString() === agr.unitId.toString());
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
            }
          : null,
      };
    });

    // Active lease
    const currentAgreement = enrichedAgreements.find((a) => a.status === 'ACTIVE') || null;

    // Retrieve rent due history for this tenant
    const rentDueRecords = await RentDue.find({ tenantId: id })
      .populate('propertyId', 'propertyName plazaName')
      .sort({ rentMonth: -1 })
      .limit(24)
      .lean();

    const enrichedRentDue = rentDueRecords.map((rd) => {
      const prop = propertyMap.get(rd.propertyId?._id?.toString());
      const unit = prop?.units?.find((u) => u._id.toString() === rd.unitId.toString());
      return {
        ...rd,
        unitName: unit?.unitName || unit?.unitNumber || 'Unit',
      };
    });

    return apiSuccess(
      res,
      {
        tenant,
        currentAgreement,
        agreements: enrichedAgreements,
        rentDueHistory: enrichedRentDue,
      },
      'Tenant details retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Tenant By ID Error]:', error);
    return apiError(res, 'Failed to fetch tenant details.', 500);
  }
};

/**
 * @desc    Create a new tenant (Admin only)
 * @route   POST /api/tenants
 * @access  Private (Admin)
 */
export const createTenant = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      alternatePhone,
      address,
      city,
      country,
      identificationNumber,
      companyName,
      notes,
      status = 'ACTIVE',
    } = req.body;

    // Check duplicate phone
    const existingPhone = await Tenant.findOne({ phone: phone.trim() });
    if (existingPhone) {
      return apiError(res, `A tenant with phone number '${phone}' already exists.`, 409, {
        phone: 'Phone number already registered to another tenant.',
      });
    }

    // Check duplicate CNIC / NTN if provided
    if (identificationNumber && identificationNumber.trim()) {
      const existingId = await Tenant.findOne({
        identificationNumber: identificationNumber.trim(),
      });
      if (existingId) {
        return apiError(
          res,
          `A tenant with identification '${identificationNumber}' already exists.`,
          409,
          {
            identificationNumber: 'Identification number is already in use.',
          }
        );
      }
    }

    const newTenant = await Tenant.create({
      fullName: fullName.trim(),
      email: email ? email.trim().toLowerCase() : null,
      phone: phone.trim(),
      alternatePhone: alternatePhone?.trim() || '',
      address: address?.trim() || '',
      city: city?.trim() || 'Lahore',
      country: country?.trim() || 'Pakistan',
      identificationNumber: identificationNumber?.trim() || null,
      companyName: companyName?.trim() || '',
      notes: notes?.trim() || '',
      status: status || 'ACTIVE',
      isActive: status !== 'INACTIVE',
      createdBy: req.user._id,
    });

    return apiSuccess(res, newTenant, `Tenant '${newTenant.fullName}' created successfully.`, 201);
  } catch (error) {
    console.error('[Create Tenant Error]:', error);
    return apiError(res, error.message || 'Failed to create tenant.', 500);
  }
};

/**
 * @desc    Update tenant details (Admin only)
 * @route   PUT /api/tenants/:id
 * @access  Private (Admin)
 */
export const updateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid tenant ID.', 400);
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return apiError(res, 'Tenant not found.', 404);
    }

    const {
      fullName,
      email,
      phone,
      alternatePhone,
      address,
      city,
      country,
      identificationNumber,
      companyName,
      notes,
      status,
    } = req.body;

    // Check phone uniqueness if modified
    if (phone && phone.trim() !== tenant.phone) {
      const duplicatePhone = await Tenant.findOne({
        _id: { $ne: id },
        phone: phone.trim(),
      });
      if (duplicatePhone) {
        return apiError(res, `Another tenant with phone '${phone}' already exists.`, 409, {
          phone: 'Phone number already registered to another tenant.',
        });
      }
      tenant.phone = phone.trim();
    }

    // Check identification uniqueness if modified
    if (
      identificationNumber &&
      identificationNumber.trim() !== tenant.identificationNumber
    ) {
      const duplicateId = await Tenant.findOne({
        _id: { $ne: id },
        identificationNumber: identificationNumber.trim(),
      });
      if (duplicateId) {
        return apiError(
          res,
          `Another tenant with identification '${identificationNumber}' already exists.`,
          409,
          {
            identificationNumber: 'Identification number is already in use.',
          }
        );
      }
      tenant.identificationNumber = identificationNumber.trim();
    }

    if (fullName !== undefined) tenant.fullName = fullName.trim();
    if (email !== undefined) tenant.email = email ? email.trim().toLowerCase() : null;
    if (alternatePhone !== undefined) tenant.alternatePhone = alternatePhone.trim();
    if (address !== undefined) tenant.address = address.trim();
    if (city !== undefined) tenant.city = city.trim();
    if (country !== undefined) tenant.country = country.trim();
    if (companyName !== undefined) tenant.companyName = companyName.trim();
    if (notes !== undefined) tenant.notes = notes.trim();
    if (status !== undefined) {
      tenant.status = status;
      tenant.isActive = status === 'ACTIVE';
    }
    tenant.updatedBy = req.user._id;

    await tenant.save();

    return apiSuccess(res, tenant, `Tenant '${tenant.fullName}' updated successfully.`);
  } catch (error) {
    console.error('[Update Tenant Error]:', error);
    return apiError(res, error.message || 'Failed to update tenant.', 500);
  }
};

/**
 * @desc    Soft toggle tenant status (ACTIVE <-> INACTIVE) (Admin only)
 * @route   PATCH /api/tenants/:id/status
 * @access  Private (Admin)
 */
export const toggleTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid tenant ID.', 400);
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return apiError(res, 'Tenant not found.', 404);
    }

    tenant.isActive = !tenant.isActive;
    tenant.status = tenant.isActive ? 'ACTIVE' : 'INACTIVE';
    tenant.updatedBy = req.user._id;

    await tenant.save();

    return apiSuccess(
      res,
      {
        id: tenant._id,
        fullName: tenant.fullName,
        status: tenant.status,
        isActive: tenant.isActive,
      },
      `Tenant '${tenant.fullName}' status changed to ${tenant.status}.`
    );
  } catch (error) {
    console.error('[Toggle Tenant Status Error]:', error);
    return apiError(res, 'Failed to toggle tenant status.', 500);
  }
};

export default {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  toggleTenantStatus,
};
