import Property from '../models/Property.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * @desc    Get all properties with filtering, search, and dynamic occupancy statistics
 * @route   GET /api/properties
 * @access  Private (Authenticated)
 */
export const getProperties = async (req, res) => {
  try {
    const { search, propertyType, status, city, page = 1, limit = 50 } = req.query;

    const query = {};

    // Filter by Active Status
    if (status) {
      query.status = status;
    }

    // Filter by Property Type
    if (propertyType) {
      query.propertyType = propertyType;
    }

    // Filter by City
    if (city) {
      query.city = { $regex: new RegExp(city.trim(), 'i') };
    }

    // Text Search
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { propertyName: searchRegex },
        { plazaName: searchRegex },
        { propertyCode: searchRegex },
        { address: searchRegex },
        { area: searchRegex },
        { city: searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .sort({ propertyName: 1 })
      .skip(skip)
      .limit(limitNum);

    // Calculate portfolio-wide macro metrics from database
    const allPropertiesForStats = await Property.find({
      isActive: { $ne: false },
      status: { $ne: 'INACTIVE' },
    });
    let totalPortfolioUnits = 0;
    let totalPortfolioOccupied = 0;
    let totalPortfolioVacant = 0;
    let totalPortfolioMaintenance = 0;

    allPropertiesForStats.forEach((p) => {
      totalPortfolioUnits += p.totalUnits;
      totalPortfolioOccupied += p.occupiedUnits;
      totalPortfolioVacant += p.vacantUnits;
      totalPortfolioMaintenance += p.maintenanceUnits;
    });

    const portfolioOccupancyRate =
      totalPortfolioUnits > 0
        ? Math.round((totalPortfolioOccupied / totalPortfolioUnits) * 100)
        : 0;

    const summary = {
      totalProperties: totalCount,
      activeProperties: allPropertiesForStats.length,
      totalUnits: totalPortfolioUnits,
      occupiedUnits: totalPortfolioOccupied,
      vacantUnits: totalPortfolioVacant,
      maintenanceUnits: totalPortfolioMaintenance,
      occupancyRate: portfolioOccupancyRate,
    };

    return apiSuccess(
      res,
      {
        properties,
        summary,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        },
      },
      `Found ${properties.length} properties.`
    );
  } catch (error) {
    console.error('[Get Properties Error]:', error);
    return apiError(res, 'Failed to fetch properties directory.', 500);
  }
};

/**
 * @desc    Get single property by ID with units and detailed occupancy breakdown
 * @route   GET /api/properties/:id
 * @access  Private (Authenticated)
 */
export const getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findById(id)
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .populate('units.defaultReceivingAccountId', 'name type currentBalance');

    if (!property) {
      return apiError(res, 'Property not found.', 404);
    }

    const unitSummary = {
      totalUnits: property.totalUnits,
      occupiedUnits: property.occupiedUnits,
      vacantUnits: property.vacantUnits,
      maintenanceUnits: property.maintenanceUnits,
      inactiveUnits: property.inactiveUnits,
      occupancyRate: property.occupancyRate,
      totalMonthlyRentRoll: property.totalMonthlyRentRoll,
    };

    return apiSuccess(res, { property, unitSummary }, 'Property details retrieved.');
  } catch (error) {
    console.error('[Get Property By ID Error]:', error);
    return apiError(res, 'Failed to fetch property details.', 500);
  }
};

/**
 * @desc    Create a new property/plaza (Admin only)
 * @route   POST /api/properties
 * @access  Private (Admin)
 */
export const createProperty = async (req, res) => {
  try {
    const {
      propertyName,
      plazaName,
      propertyCode,
      propertyType,
      address,
      city,
      area,
      description,
      status,
      notes,
    } = req.body;

    const name = (propertyName || plazaName).trim();

    // Check duplicate name
    const existing = await Property.findOne({
      $or: [{ propertyName: name }, { plazaName: name }],
    });
    if (existing) {
      return apiError(res, `A property with name '${name}' already exists.`, 409, {
        propertyName: 'Property name must be unique.',
      });
    }

    // Check duplicate property code if provided
    if (propertyCode && propertyCode.trim()) {
      const existingCode = await Property.findOne({
        propertyCode: propertyCode.trim().toUpperCase(),
      });
      if (existingCode) {
        return apiError(res, `Property code '${propertyCode}' is already in use.`, 409, {
          propertyCode: 'Property code must be unique.',
        });
      }
    }

    const newProperty = await Property.create({
      propertyName: name,
      plazaName: name,
      propertyCode: propertyCode ? propertyCode.trim().toUpperCase() : undefined,
      propertyType: propertyType || 'PLAZA',
      address: address?.trim() || '',
      city: city?.trim() || 'Lahore',
      area: area?.trim() || '',
      description: description?.trim() || '',
      status: status || 'ACTIVE',
      notes: notes?.trim() || '',
      isActive: true,
      createdBy: req.user._id,
      units: [],
    });

    return apiSuccess(res, newProperty, `Property '${newProperty.propertyName}' created successfully.`, 201);
  } catch (error) {
    console.error('[Create Property Error]:', error);
    return apiError(res, error.message || 'Failed to create property.', 500);
  }
};

/**
 * @desc    Update property metadata (Admin only)
 * @route   PUT /api/properties/:id
 * @access  Private (Admin)
 */
export const updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findById(id);

    if (!property) {
      return apiError(res, 'Property not found.', 404);
    }

    const {
      propertyName,
      plazaName,
      propertyCode,
      propertyType,
      address,
      city,
      area,
      description,
      status,
      notes,
    } = req.body;

    const name = (propertyName || plazaName || property.propertyName).trim();

    // Check name collision if name changed
    if (name !== property.propertyName && name !== property.plazaName) {
      const duplicate = await Property.findOne({
        _id: { $ne: id },
        $or: [{ propertyName: name }, { plazaName: name }],
      });
      if (duplicate) {
        return apiError(res, `A property with name '${name}' already exists.`, 409, {
          propertyName: 'Property name must be unique.',
        });
      }
    }

    // Check code collision if code changed
    if (propertyCode && propertyCode.trim().toUpperCase() !== property.propertyCode) {
      const duplicateCode = await Property.findOne({
        _id: { $ne: id },
        propertyCode: propertyCode.trim().toUpperCase(),
      });
      if (duplicateCode) {
        return apiError(res, `Property code '${propertyCode}' is already in use.`, 409, {
          propertyCode: 'Property code must be unique.',
        });
      }
      property.propertyCode = propertyCode.trim().toUpperCase();
    }

    property.propertyName = name;
    property.plazaName = name;
    if (propertyType) property.propertyType = propertyType;
    if (address !== undefined) property.address = address.trim();
    if (city !== undefined) property.city = city.trim();
    if (area !== undefined) property.area = area.trim();
    if (description !== undefined) property.description = description.trim();
    if (status !== undefined) property.status = status;
    if (notes !== undefined) property.notes = notes.trim();
    property.updatedBy = req.user._id;

    await property.save();

    return apiSuccess(res, property, `Property '${property.propertyName}' updated successfully.`);
  } catch (error) {
    console.error('[Update Property Error]:', error);
    return apiError(res, error.message || 'Failed to update property.', 500);
  }
};

/**
 * @desc    Toggle property active status / soft deactivation (Admin only)
 * @route   PATCH /api/properties/:id/status
 * @access  Private (Admin)
 */
export const togglePropertyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findById(id);

    if (!property) {
      return apiError(res, 'Property not found.', 404);
    }

    property.isActive = !property.isActive;
    property.status = property.isActive ? 'ACTIVE' : 'INACTIVE';
    property.updatedBy = req.user._id;

    await property.save();

    return apiSuccess(
      res,
      {
        id: property._id,
        propertyName: property.propertyName,
        status: property.status,
        isActive: property.isActive,
      },
      `Property '${property.propertyName}' has been ${property.isActive ? 'activated' : 'deactivated'}.`
    );
  } catch (error) {
    console.error('[Toggle Property Status Error]:', error);
    return apiError(res, 'Failed to toggle property status.', 500);
  }
};

/**
 * @desc    Get all units of a property with search and filtering
 * @route   GET /api/properties/:id/units
 * @access  Private (Authenticated)
 */
export const getPropertyUnits = async (req, res) => {
  try {
    const { id } = req.params;
    const { search, status, unitType, floor } = req.query;

    const property = await Property.findById(id);
    if (!property) {
      return apiError(res, 'Property not found.', 404);
    }

    let units = property.units || [];

    // Filter by status
    if (status) {
      units = units.filter((u) => u.status === status);
    }

    // Filter by unitType
    if (unitType) {
      units = units.filter((u) => u.unitType === unitType);
    }

    // Filter by floor
    if (floor) {
      units = units.filter((u) => u.floor && u.floor.toLowerCase() === floor.toLowerCase());
    }

    // Search by unitName or unitNumber
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      units = units.filter(
        (u) =>
          u.unitName?.toLowerCase().includes(q) ||
          u.unitNumber?.toLowerCase().includes(q) ||
          u.tenantName?.toLowerCase().includes(q)
      );
    }

    return apiSuccess(
      res,
      {
        propertyId: property._id,
        propertyName: property.propertyName,
        units,
      },
      `Found ${units.length} units.`
    );
  } catch (error) {
    console.error('[Get Property Units Error]:', error);
    return apiError(res, 'Failed to fetch units.', 500);
  }
};

/**
 * @desc    Add a new unit to a property (Admin only)
 * @route   POST /api/properties/:id/units
 * @access  Private (Admin)
 */
export const addUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findById(id);
    if (!property) {
      return apiError(res, 'Property not found.', 404);
    }

    const {
      unitName,
      unitNumber,
      unitType = 'SHOP',
      floor = 'Ground Floor',
      area = 0,
      areaUnit = 'SQ_FT',
      status = 'VACANT',
      description = '',
      notes = '',
      tenantName = null,
      agreedRent = 0,
      dueDay = 1,
      renewalDate = null,
    } = req.body;

    const name = unitName.trim();
    const number = (unitNumber || name).trim();

    // Check duplicate unit identifier within this property
    const duplicate = property.units.find(
      (u) =>
        u.isActive !== false &&
        (u.unitName.toLowerCase() === name.toLowerCase() ||
          (u.unitNumber && u.unitNumber.toLowerCase() === number.toLowerCase()))
    );

    if (duplicate) {
      return apiError(
        res,
        `A unit with name '${name}' or number '${number}' already exists in this property.`,
        409,
        {
          unitName: 'Unit identifier must be unique within this property.',
        }
      );
    }

    const newUnit = {
      unitName: name,
      unitNumber: number,
      unitType,
      floor: floor.trim(),
      area: Math.max(0, Number(area) || 0),
      areaUnit,
      status,
      description: description.trim(),
      notes: notes.trim(),
      tenantName: tenantName ? tenantName.trim() : null,
      agreedRent: Math.max(0, Number(agreedRent) || 0),
      dueDay: Math.min(31, Math.max(1, Number(dueDay) || 1)),
      renewalDate: renewalDate ? new Date(renewalDate) : null,
      isActive: true,
      createdBy: req.user._id,
    };

    property.units.push(newUnit);
    property.updatedBy = req.user._id;
    await property.save();

    const createdUnit = property.units[property.units.length - 1];

    return apiSuccess(
      res,
      {
        unit: createdUnit,
        propertyId: property._id,
        propertyName: property.propertyName,
      },
      `Unit '${createdUnit.unitName}' added successfully to ${property.propertyName}.`,
      201
    );
  } catch (error) {
    console.error('[Add Unit Error]:', error);
    return apiError(res, error.message || 'Failed to add unit.', 500);
  }
};

/**
 * @desc    Get unit by ID with parent property context
 * @route   GET /api/units/:id
 * @access  Private (Authenticated)
 */
export const getUnitById = async (req, res) => {
  try {
    const { id } = req.params;

    const property = await Property.findOne({ 'units._id': id });
    if (!property) {
      return apiError(res, 'Unit not found.', 404);
    }

    const unit = property.units.id(id);
    if (!unit) {
      return apiError(res, 'Unit not found.', 404);
    }

    return apiSuccess(
      res,
      {
        unit,
        property: {
          id: property._id,
          propertyName: property.propertyName,
          propertyCode: property.propertyCode,
          propertyType: property.propertyType,
          city: property.city,
          address: property.address,
        },
      },
      'Unit retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Unit By ID Error]:', error);
    return apiError(res, 'Failed to fetch unit.', 500);
  }
};

/**
 * @desc    Update unit details (Admin only)
 * @route   PUT /api/units/:id
 * @access  Private (Admin)
 */
export const updateUnit = async (req, res) => {
  try {
    const { id } = req.params;

    const property = await Property.findOne({ 'units._id': id });
    if (!property) {
      return apiError(res, 'Unit not found.', 404);
    }

    const unit = property.units.id(id);
    if (!unit) {
      return apiError(res, 'Unit not found.', 404);
    }

    const {
      unitName,
      unitNumber,
      unitType,
      floor,
      area,
      areaUnit,
      status,
      description,
      notes,
      tenantName,
      agreedRent,
      dueDay,
      renewalDate,
    } = req.body;

    const name = unitName !== undefined ? unitName.trim() : unit.unitName;
    const number = unitNumber !== undefined ? unitNumber.trim() : unit.unitNumber;

    // Check duplicate within same property
    const duplicate = property.units.find(
      (u) =>
        u._id.toString() !== id &&
        u.isActive !== false &&
        (u.unitName.toLowerCase() === name.toLowerCase() ||
          (number && u.unitNumber && u.unitNumber.toLowerCase() === number.toLowerCase()))
    );

    if (duplicate) {
      return apiError(
        res,
        `Another unit with name '${name}' or number '${number}' already exists in this property.`,
        409,
        {
          unitName: 'Unit identifier must be unique within this property.',
        }
      );
    }

    if (unitName !== undefined) unit.unitName = name;
    if (unitNumber !== undefined) unit.unitNumber = number;
    if (unitType !== undefined) unit.unitType = unitType;
    if (floor !== undefined) unit.floor = floor.trim();
    if (area !== undefined) unit.area = Math.max(0, Number(area) || 0);
    if (areaUnit !== undefined) unit.areaUnit = areaUnit;
    if (status !== undefined) unit.status = status;
    if (description !== undefined) unit.description = description.trim();
    if (notes !== undefined) unit.notes = notes.trim();
    if (tenantName !== undefined) unit.tenantName = tenantName ? tenantName.trim() : null;
    if (agreedRent !== undefined) unit.agreedRent = Math.max(0, Number(agreedRent) || 0);
    if (dueDay !== undefined) unit.dueDay = Math.min(31, Math.max(1, Number(dueDay) || 1));
    if (renewalDate !== undefined) unit.renewalDate = renewalDate ? new Date(renewalDate) : null;
    unit.updatedBy = req.user._id;

    property.updatedBy = req.user._id;
    await property.save();

    return apiSuccess(
      res,
      {
        unit,
        propertyId: property._id,
        propertyName: property.propertyName,
      },
      `Unit '${unit.unitName}' updated successfully.`
    );
  } catch (error) {
    console.error('[Update Unit Error]:', error);
    return apiError(res, error.message || 'Failed to update unit.', 500);
  }
};

/**
 * @desc    Change unit status or soft toggle active status (Admin only)
 * @route   PATCH /api/units/:id/status
 * @access  Private (Admin)
 */
export const toggleUnitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isActive } = req.body;

    const property = await Property.findOne({ 'units._id': id });
    if (!property) {
      return apiError(res, 'Unit not found.', 404);
    }

    const unit = property.units.id(id);
    if (!unit) {
      return apiError(res, 'Unit not found.', 404);
    }

    if (status) {
      unit.status = status;
    }

    if (isActive !== undefined) {
      unit.isActive = Boolean(isActive);
      if (!unit.isActive) {
        unit.status = 'INACTIVE';
      }
    }

    unit.updatedBy = req.user._id;
    property.updatedBy = req.user._id;
    await property.save();

    return apiSuccess(
      res,
      {
        id: unit._id,
        unitName: unit.unitName,
        status: unit.status,
        isActive: unit.isActive,
      },
      `Unit '${unit.unitName}' status updated to ${unit.status}.`
    );
  } catch (error) {
    console.error('[Toggle Unit Status Error]:', error);
    return apiError(res, 'Failed to update unit status.', 500);
  }
};

export default {
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  togglePropertyStatus,
  getPropertyUnits,
  addUnit,
  getUnitById,
  updateUnit,
  toggleUnitStatus,
};
