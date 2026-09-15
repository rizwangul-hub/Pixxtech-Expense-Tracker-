/**
 * Centralized API Response Formatter
 * Ensures uniform JSON payloads across all endpoints.
 */

/**
 * Send a standardized success response
 * @param {import('express').Response} res
 * @param {*} data - Response payload
 * @param {string} message - Human-readable success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export const apiSuccess = (res, data = null, message = 'Operation successful', statusCode = 200) => {
  const payload = {
    success: true,
    message,
  };
  if (data !== null) {
    payload.data = data;
  }
  return res.status(statusCode).json(payload);
};

/**
 * Send a standardized error response
 * @param {import('express').Response} res
 * @param {string} message - Error description
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {*} errors - Optional array or object of field validation errors
 */
export const apiError = (res, message = 'Internal Server Error', statusCode = 500, errors = null) => {
  const payload = {
    success: false,
    message,
  };
  if (errors) {
    payload.errors = errors;
  }
  return res.status(statusCode).json(payload);
};

export default { apiSuccess, apiError };
