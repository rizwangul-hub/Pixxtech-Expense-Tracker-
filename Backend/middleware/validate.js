import { apiError } from '../utils/apiResponse.js';

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

/**
 * Validate user login payload
 */
export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = {};

  if (!email || typeof email !== 'string' || !email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = 'Please provide a valid email address.';
  }

  if (!password || typeof password !== 'string') {
    errors.password = 'Password is required.';
  }

  if (Object.keys(errors).length > 0) {
    return apiError(res, 'Validation failed. Invalid login input.', 400, errors);
  }

  next();
};

/**
 * Validate user creation payload (Admin user creation)
 */
export const validateCreateUser = (req, res, next) => {
  const { name, email, password, role } = req.body;
  const errors = {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.name = 'User full name is required.';
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = 'Please provide a valid email address.';
  }

  if (!password || typeof password !== 'string') {
    errors.password = 'Password is required.';
  } else if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters long.';
  }

  const validRoles = ['ADMIN', 'DATA_ENTRY'];
  if (!role || !validRoles.includes(role)) {
    errors.role = 'Role must be either ADMIN or DATA_ENTRY.';
  }

  if (Object.keys(errors).length > 0) {
    return apiError(res, 'Validation failed. Please correct input fields.', 400, errors);
  }

  next();
};

export default {
  validateLogin,
  validateCreateUser,
};
