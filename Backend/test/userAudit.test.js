import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDataForAudit,
  formatKarachiDateTime,
  generateAuditLogsCsv,
} from '../services/auditService.js';

test('sanitizeDataForAudit strips sensitive fields and masks secrets', () => {
  const input = {
    username: 'testuser',
    password: 'supersecretpassword123',
    passwordHash: '$2b$10$abcdef...',
    token: 'jwt.token.here',
    nested: {
      apiKey: 'xyz123',
      creditCard: '4111222233334444',
      validInfo: 'safe to keep',
    },
    array: [
      { pin: '1234', note: 'test' },
      'string-item',
    ],
  };

  const sanitized = sanitizeDataForAudit(input);

  assert.equal(sanitized.username, 'testuser');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.passwordHash, '[REDACTED]');
  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.nested.apiKey, '[REDACTED]');
  assert.equal(sanitized.nested.creditCard, '[REDACTED]');
  assert.equal(sanitized.nested.validInfo, 'safe to keep');
  assert.equal(sanitized.array[0].pin, '[REDACTED]');
  assert.equal(sanitized.array[0].note, 'test');
});

test('formatKarachiDateTime formats UTC date to Asia/Karachi time correctly', () => {
  // 2026-08-14 07:30:00 UTC = 12:30 PM PKT (UTC+5)
  const utcDate = new Date('2026-08-14T07:30:00.000Z');
  const formatted = formatKarachiDateTime(utcDate);

  assert.match(formatted, /^14-Aug-2026, 12:30:00 (am|pm|AM|PM)$/i);
});

test('generateAuditLogsCsv outputs valid CSV with headers and formatted values', () => {
  const sampleLogs = [
    {
      _id: 'log123456789',
      timestamp: new Date('2026-08-14T07:30:00.000Z'),
      userName: 'Sarfraz',
      userEmail: 'sarfraz@pixxtechnologies.com',
      userRole: 'ADMIN',
      action: 'CREATE',
      module: 'EXPENSE',
      recordType: 'PendingEntry',
      recordId: 'entry999',
      status: 'SUCCESS',
      description: 'Sarfraz created an expense of Rs. 5,000, for office utilities.',
      ipAddress: '192.168.1.10',
      userAgent: 'Mozilla/5.0 Chrome',
      metadata: { voucherNo: 'VN-101', amount: 5000 },
    },
  ];

  const csv = generateAuditLogsCsv(sampleLogs);

  assert.match(csv, /^Log ID,Timestamp \(Asia\/Karachi\),Timestamp \(UTC\),User Name,User Email,User Role,Module,Action,Record Type,Record ID,Status,Description,IP Address/);
  assert.match(csv, /"log123456789"/);
  assert.match(csv, /"Sarfraz"/);
  assert.match(csv, /"sarfraz@pixxtechnologies\.com"/);
  assert.match(csv, /"CREATE"/);
  assert.match(csv, /"EXPENSE"/);
  assert.match(csv, /"Sarfraz created an expense of Rs\. 5,000, for office utilities\."/);
});

test('user presence resolution determines status accurately', () => {
  const now = Date.now();

  const resolvePresence = (user) => {
    if (user.isDeleted) return 'DELETED';
    if (!user.isActive) return 'DISABLED';
    if (user.lastActiveAt && (now - new Date(user.lastActiveAt).getTime()) <= 300000) {
      return 'ONLINE';
    }
    if (!user.lastLoginAt) return 'OFFLINE';
    const daysSinceLogin = (now - new Date(user.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLogin > 7) return 'EXPIRED';
    return 'OFFLINE';
  };

  assert.equal(resolvePresence({ isDeleted: true, isActive: true }), 'DELETED');
  assert.equal(resolvePresence({ isDeleted: false, isActive: false }), 'DISABLED');
  assert.equal(resolvePresence({ isDeleted: false, isActive: true, lastActiveAt: new Date(now - 60000) }), 'ONLINE');
  assert.equal(resolvePresence({ isDeleted: false, isActive: true, lastActiveAt: new Date(now - 600000), lastLoginAt: new Date(now - 600000) }), 'OFFLINE');
  assert.equal(resolvePresence({ isDeleted: false, isActive: true, lastActiveAt: new Date(now - 800000000), lastLoginAt: new Date(now - 800000000) }), 'EXPIRED');
});
