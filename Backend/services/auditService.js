import AuditLog from '../models/AuditLog.js';

/**
 * Sanitize object to remove passwords, tokens, and sensitive secrets before logging
 */
const sanitizePayload = (data) => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizePayload);

  const clean = { ...data };
  const sensitiveKeys = ['password', 'passwordHash', 'token', 'refreshToken', 'secret', 'authorization'];
  for (const key of Object.keys(clean)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      clean[key] = '[REDACTED]';
    } else if (typeof clean[key] === 'object' && clean[key] !== null) {
      clean[key] = sanitizePayload(clean[key]);
    }
  }
  return clean;
};

/**
 * Format a Date object into Asia/Karachi local time string
 * Example: "14-Oct-2026, 09:15:30 AM (PKT)"
 */
export const formatKarachiDateTime = (dateInput) => {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch (err) {
    return String(dateInput);
  }
};

/**
 * Centralized Audit Logging Service
 * Records system actions, financial transactions, authentication events, and administrative changes.
 */
export const recordAuditLog = async ({
  req = null,
  userId = null,
  userName = null,
  userEmail = null,
  userRole = null,
  action,
  module,
  recordType = '',
  recordId = '',
  status = 'SUCCESS',
  description,
  changes = null,
  metadata = {},
}) => {
  try {
    const actorUser = req?.user || null;
    const finalUserId = userId || actorUser?._id || null;
    const finalUserName = userName || actorUser?.name || 'System';
    const finalUserEmail = userEmail || actorUser?.email || '';
    const finalUserRole = userRole || actorUser?.role || '';

    // Extract client IP safely
    let ipAddress = '';
    if (req) {
      const forwarded = req.headers?.['x-forwarded-for'];
      if (forwarded) {
        ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0];
      } else {
        ipAddress = req.socket?.remoteAddress || req.ip || '';
      }
    }

    const userAgent = req?.headers?.['user-agent'] || '';

    const sanitizedChanges = changes
      ? {
          previous: sanitizePayload(changes.previous),
          updated: sanitizePayload(changes.updated),
        }
      : null;

    const entry = await AuditLog.create({
      userId: finalUserId,
      userName: finalUserName,
      userEmail: finalUserEmail,
      userRole: finalUserRole,
      action,
      module,
      recordType: recordType || '',
      recordId: recordId ? String(recordId) : '',
      status: status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
      description: description || `${action} on ${module}`,
      changes: sanitizedChanges,
      ipAddress,
      userAgent,
      metadata: sanitizePayload(metadata) || {},
      timestamp: new Date(),
    });

    return entry;
  } catch (err) {
    console.error('[AuditService Error]: Failed to write audit log:', err.message);
    return null;
  }
};

/**
 * Export audit logs to CSV formatted with Asia/Karachi timestamps
 */
export const generateAuditLogsCsv = (logs = []) => {
  const headers = [
    'Log ID',
    'Timestamp (Asia/Karachi)',
    'Timestamp (UTC)',
    'User Name',
    'User Email',
    'User Role',
    'Module',
    'Action',
    'Record Type',
    'Record ID',
    'Status',
    'Description',
    'IP Address',
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = logs.map((log) => [
    escapeCsv(log._id),
    escapeCsv(formatKarachiDateTime(log.timestamp || log.createdAt)),
    escapeCsv(log.timestamp ? new Date(log.timestamp).toISOString() : ''),
    escapeCsv(log.userName),
    escapeCsv(log.userEmail),
    escapeCsv(log.userRole),
    escapeCsv(log.module),
    escapeCsv(log.action),
    escapeCsv(log.recordType),
    escapeCsv(log.recordId),
    escapeCsv(log.status),
    escapeCsv(log.description),
    escapeCsv(log.ipAddress),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
};

export default {
  recordAuditLog,
  formatKarachiDateTime,
  generateAuditLogsCsv,
};
