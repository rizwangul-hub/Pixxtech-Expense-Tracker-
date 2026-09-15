import { apiError } from '../utils/apiResponse.js';
import {
  PROPERTY_TYPE_LIST,
  PROPERTY_STATUS_LIST,
  UNIT_TYPE_LIST,
  UNIT_STATUS_LIST,
  AREA_UNIT_LIST,
} from '../constants/propertyTypes.js';

/**
 * Validate Property Creation & Update Request Body
 */
export const validateProperty = (req, res, next) => {
  const { propertyName, plazaName, propertyType, status } = req.body;
  const errors = {};

  const name = propertyName || plazaName;
  const isCreate = req.method === 'POST';

  if (isCreate) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      errors.propertyName = 'Property name is required.';
    } else if (name.trim().length < 2) {
      errors.propertyName = 'Property name must be at least 2 characters long.';
    }
  } else if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      errors.propertyName = 'Property name cannot be empty.';
    } else if (name.trim().length < 2) {
      errors.propertyName = 'Property name must be at least 2 characters long.';
    }
  }

  if (propertyType && !PROPERTY_TYPE_LIST.includes(propertyType)) {
    errors.propertyType = `Invalid property type. Must be one of: ${PROPERTY_TYPE_LIST.join(', ')}.`;
  }

  if (status && !PROPERTY_STATUS_LIST.includes(status)) {
    errors.status = `Invalid property status. Must be one of: ${PROPERTY_STATUS_LIST.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) {
    return apiError(res, 'Property validation failed. Please correct input fields.', 400, errors);
  }

  next();
};

/**
 * Validate Unit Creation & Update Request Body
 */
export const validateUnit = (req, res, next) => {
  const { unitName, unitType, status, area, areaUnit } = req.body;
  const errors = {};
  const isCreate = req.method === 'POST';

  if (isCreate) {
    if (!unitName || typeof unitName !== 'string' || !unitName.trim()) {
      errors.unitName = 'Unit name is required.';
    }
  } else if (unitName !== undefined) {
    if (typeof unitName !== 'string' || !unitName.trim()) {
      errors.unitName = 'Unit name cannot be empty.';
    }
  }

  if (unitType && !UNIT_TYPE_LIST.includes(unitType)) {
    errors.unitType = `Invalid unit type. Must be one of: ${UNIT_TYPE_LIST.join(', ')}.`;
  }

  if (status && !UNIT_STATUS_LIST.includes(status)) {
    errors.status = `Invalid unit status. Must be one of: ${UNIT_STATUS_LIST.join(', ')}.`;
  }

  if (area !== undefined && area !== null) {
    const numArea = Number(area);
    if (isNaN(numArea) || numArea < 0) {
      errors.area = 'Area must be a non-negative number.';
    }
  }

  if (areaUnit && !AREA_UNIT_LIST.includes(areaUnit)) {
    errors.areaUnit = `Invalid area unit. Must be one of: ${AREA_UNIT_LIST.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) {
    return apiError(res, 'Unit validation failed. Please correct input fields.', 400, errors);
  }

  next();
};

export default {
  validateProperty,
  validateUnit,
};
