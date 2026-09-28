import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommunicationError,
  getCallTransition,
  getConversationContext,
  getIceServers,
  resolveConfiguredParticipants,
  validateAttachmentFile,
  validateMessageInput,
  validateSignalInput,
} from '../services/communicationService.js';
import { getCorsAllowedOrigins, isCorsOriginAllowed } from '../config/communicationCors.js';
import { getJwtSecret } from '../config/jwt.js';
import { protect } from '../middleware/auth.js';
import {
  groupExpenseTransactionsByReportHead,
  resolveTransactionAccountDisplay,
  buildHeadWiseReportItems,
} from '../services/ledgerService.js';

const admin = { _id: 'admin-1', email: 'ADMIN@example.com ', name: 'Khurshid', role: 'ADMIN', isActive: true };
const dataEntry = { _id: 'entry-2', email: 'entry@example.com', name: 'Sarfraz', role: 'DATA_ENTRY', isActive: true };

test('property expenses use their property or unit as the debit display', () => {
  const property = {
    _id: 'property-1',
    plazaName: 'Pixx Plaza',
    units: [{ _id: 'unit-1', unitName: 'Office 4' }],
  };
  const propertyExpense = resolveTransactionAccountDisplay({
    transactionType: 'EXPENSE',
    expenseClassification: 'PROPERTY_OWN_EXPENSE',
    propertyId: property,
    drAccountId: { name: 'Electricity Bill' },
    categoryId: { name: 'Electricity Bill' },
  });
  const unitExpense = resolveTransactionAccountDisplay({
    transactionType: 'EXPENSE',
    expenseClassification: 'UNIT_EXPENSE',
    propertyId: property,
    unitId: 'unit-1',
    drAccountId: { name: 'Maintenance Bill' },
    categoryId: { name: 'Maintenance Bill' },
  });
  const generalExpense = resolveTransactionAccountDisplay({
    transactionType: 'EXPENSE',
    expenseClassification: 'GENERAL_EXPENSE',
    drAccountId: { name: 'General Operations' },
    categoryId: { name: 'Office Supplies' },
  });

  assert.equal(propertyExpense.dr, 'Pixx Plaza');
  assert.equal(propertyExpense.head, 'Pixx Plaza');
  assert.equal(unitExpense.dr, 'Pixx Plaza - Office 4');
  assert.equal(unitExpense.head, 'Pixx Plaza - Office 4');
  assert.equal(generalExpense.dr, 'General Operations');
  assert.equal(generalExpense.head, 'Office Supplies');
});

test('expense reports group transactions under property, general, and salary heads', () => {
  const property = {
    _id: 'property-1',
    plazaName: 'Amin Park',
    units: [{ _id: 'unit-1', unitName: 'Flat 502' }],
  };
  const groups = groupExpenseTransactionsByReportHead([
    {
      _id: 'property-expense',
      amount: 100,
      expenseClassification: 'PROPERTY_OWN_EXPENSE',
      propertyId: property,
      categoryId: { name: 'Electricity Bill' },
      detail: 'Paid electricity bill',
    },
    {
      _id: 'unit-expense',
      amount: 200,
      expenseClassification: 'UNIT_EXPENSE',
      propertyId: property,
      unitId: 'unit-1',
      categoryId: { name: 'Maintenance' },
      detail: 'Paid maintenance charges',
    },
    {
      _id: 'general-expense',
      amount: 300,
      expenseClassification: 'GENERAL_EXPENSE',
      categoryId: {
        name: 'PTCL Bills',
        parentCategoryId: { _id: 'office-expenses', name: 'IT Office Expenses - Bahrain Office' },
      },
      detail: 'Paid PTCL bill',
    },
    {
      _id: 'salary-expense',
      amount: 400,
      expenseClassification: 'GENERAL_EXPENSE',
      categoryId: { name: 'Sabir Nawaz', parentCategoryId: { name: 'Salary' } },
      detail: 'Salary - Sabir Nawaz - August 2026 Salary',
    },
    {
      _id: 'salary-expense-2',
      amount: 150,
      expenseClassification: 'GENERAL_EXPENSE',
      categoryId: { name: 'Miss Nausheen' },
      detail: 'Salary - Miss Nausheen - August 2026 Salary',
    },
  ]);

  assert.deepEqual(
    groups.map(({ mainHeadName, totalSpent }) => [mainHeadName, totalSpent]),
    [
      ['Salary', 550],
      ['IT Office Expenses - Bahrain Office', 300],
      ['Amin Park - Flat 502', 200],
      ['Amin Park', 100],
    ]
  );
  assert.deepEqual(
    groups.find((group) => group.mainHeadName === 'Amin Park').expenses.map((expense) => expense.headName),
    ['Electricity Bill']
  );
  assert.deepEqual(
    groups.find((group) => group.mainHeadName === 'IT Office Expenses - Bahrain Office').expenses.map((expense) => expense.headName),
    ['PTCL Bills']
  );
  assert.equal(groups.find((group) => group.mainHeadName === 'Salary').expenses[0].transactions[0].detail,
    'Salary - Sabir Nawaz - August 2026 Salary');
  assert.equal(groups.find((group) => group.mainHeadName === 'Salary').transactionCount, 2);

  const propertyItems = buildHeadWiseReportItems(groups.find((group) => group.mainHeadName === 'Amin Park'));
  assert.deepEqual(propertyItems.map((item) => [item.detail, item.amount]), [['Electricity Bill', 100]]);
});

test('property expenses group under the property even when only the category has the property', () => {
  const property = { _id: 'property-2', plazaName: 'Pixx Plaza', units: [] };
  const groups = groupExpenseTransactionsByReportHead([
    {
      amount: 50,
      expenseClassification: 'PROPERTY_OWN_EXPENSE',
      categoryId: { name: 'Electricity Bill', propertyId: property },
      detail: 'Paid KE bill',
    },
    {
      amount: 25,
      expenseClassification: 'PROPERTY_OWN_EXPENSE',
      categoryId: { name: 'Entertainment', propertyId: property },
      detail: 'Guest tea',
    },
    {
      amount: 80,
      expenseClassification: 'GENERAL_EXPENSE',
      categoryId: {
        name: 'Foundation Repairs',
        parentCategoryId: { _id: 'foundation', name: 'Abida Ijaz Foundation' },
      },
      detail: 'Repair work',
    },
  ]);

  assert.deepEqual(
    groups.map(({ mainHeadName, totalSpent }) => [mainHeadName, totalSpent]),
    [
      ['Abida Ijaz Foundation', 80],
      ['Pixx Plaza', 75],
    ]
  );
  assert.deepEqual(
    groups.find((group) => group.mainHeadName === 'Pixx Plaza').expenses.map((expense) => expense.headName).sort(),
    ['Electricity Bill', 'Entertainment']
  );
});

test('JWT authentication has no built-in fallback secret', () => {
  const configuredSecret = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.equal(getJwtSecret(), null);
    let status;
    let response;
    protect(
      { headers: { authorization: 'Bearer test-token' }, query: {} },
      {
        status(code) {
          status = code;
          return this;
        },
        json(body) {
          response = body;
          return this;
        },
      },
      () => assert.fail('Authentication must stop when JWT_SECRET is missing.')
    );
    assert.equal(status, 503);
    assert.match(response.message, /JWT_SECRET is not configured/);
    process.env.JWT_SECRET = 'configured-secret';
    assert.equal(getJwtSecret(), 'configured-secret');
  } finally {
    if (configuredSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = configuredSecret;
  }
});

test('expense ledger debit display uses the assigned main expense head', () => {
  const display = resolveTransactionAccountDisplay({
    transactionType: 'EXPENSE',
    drAccountId: { name: 'External Parties / Operations Clearing' },
    crAccountId: { name: 'Bank Al Falah' },
    categoryId: {
      name: 'Foundation Repairs',
      isMainHead: false,
      parentCategoryId: { name: 'Abida Ijaz Foundation' },
    },
  });
  assert.equal(display.dr, 'Abida Ijaz Foundation');
  assert.equal(display.cr, 'Bank Al Falah');
});

test('participant resolution is exact, normalized, and fail-closed', () => {
  assert.deepEqual(
    resolveConfiguredParticipants(
      { adminEmail: ' admin@example.com ', dataEntryEmail: 'ENTRY@example.com' },
      [admin, dataEntry]
    ),
    [admin, dataEntry]
  );
  assert.throws(
    () => resolveConfiguredParticipants({ adminEmail: '', dataEntryEmail: 'entry@example.com' }, [admin, dataEntry]),
    (error) => error instanceof CommunicationError && error.status === 503
  );
  assert.throws(
    () => resolveConfiguredParticipants(
      { adminEmail: 'admin@example.com', dataEntryEmail: 'entry@example.com' },
      [{ ...admin, role: 'ADMIN_PUBLISHER' }, dataEntry]
    ),
    (error) => error.code === 'COMMUNICATION_CONFIG_ERROR'
  );
  assert.throws(
    () => getConversationContext([admin, dataEntry], 'someone-else'),
    (error) => error.status === 403
  );
  assert.equal(
    getConversationContext([admin, dataEntry], 'admin-1').channelName,
    getConversationContext([dataEntry, admin], 'entry-2').channelName
  );
});

test('message request validation constrains type, IDs, and lengths', () => {
  assert.deepEqual(validateMessageInput({ clientMessageId: 'client-1', type: 'TEXT', text: ' hello ' }), {
    clientMessageId: 'client-1',
    type: 'TEXT',
    text: 'hello',
    attachmentId: null,
  });
  assert.throws(() => validateMessageInput({ clientMessageId: 'x', type: 'TEXT' }), CommunicationError);
  assert.throws(() => validateMessageInput({ clientMessageId: 'x', type: 'VIDEO' }), CommunicationError);
  assert.throws(
    () => validateMessageInput({ clientMessageId: 'x', type: 'IMAGE', attachmentId: 'a', text: 'x'.repeat(1001) }),
    CommunicationError
  );
});

test('attachment validation verifies both limits and file signatures', () => {
  assert.equal(
    validateAttachmentFile({
      originalname: 'test.PNG',
      mimetype: 'image/png',
      size: 8,
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    }).resourceType,
    'image'
  );
  assert.throws(
    () =>
      validateAttachmentFile({
        originalname: 'disguised.jpg',
        mimetype: 'image/jpeg',
        size: 4,
        buffer: Buffer.from('not an image'),
      }),
    CommunicationError
  );
  assert.throws(
    () =>
      validateAttachmentFile({
        originalname: 'too-large.png',
        mimetype: 'image/png',
        size: 10 * 1024 * 1024 + 1,
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    (error) => error.status === 413
  );
});

test('call transitions enforce actor and state rules', () => {
  const ringing = { caller: 'admin-1', callee: 'entry-2', status: 'RINGING', startedAt: null };
  assert.equal(getCallTransition(ringing, 'entry-2', 'accept').status, 'ACCEPTED');
  assert.throws(() => getCallTransition(ringing, 'admin-1', 'accept'), (error) => error.status === 409);
  assert.throws(() => getCallTransition(ringing, 'entry-2', 'cancel'), (error) => error.status === 409);
  assert.throws(
    () => getCallTransition({ ...ringing, status: 'DECLINED' }, 'entry-2', 'accept'),
    (error) => error.status === 409
  );
});

test('signaling input is bounded and TURN configuration fails closed', () => {
  assert.equal(
    validateSignalInput({
      kind: 'ice-candidate',
      payload: { candidate: 'candidate', sdpMid: 'audio', sdpMLineIndex: 0 },
    }).kind,
    'ice-candidate'
  );
  assert.equal(
    validateSignalInput({ kind: 'ice-candidate', payload: { candidate: '' } }).kind,
    'ice-candidate'
  );
  assert.throws(
    () => validateSignalInput({ kind: 'offer', payload: { type: 'offer', sdp: 'x'.repeat(16 * 1024) } }),
    (error) => error.status === 413
  );
  assert.throws(() => validateSignalInput(null), CommunicationError);
  assert.deepEqual(getIceServers({}), [{ urls: ['stun:stun.l.google.com:19302'] }]);
  assert.throws(
    () => getIceServers({ TURN_URLS: 'turn:turn.example.com:3478' }),
    (error) => error.status === 503
  );
  assert.deepEqual(
    getIceServers({
      TURN_URLS: 'turns:turn.example.com:5349',
      TURN_USERNAME: 'temporary',
      TURN_CREDENTIAL: 'credential',
    })[0].urls,
    ['turns:turn.example.com:5349']
  );
});

test('CORS allows only trusted or explicitly configured origins with credentials', () => {
  const env = { CORS_ORIGIN: 'https://custom.example, http://localhost:5173/' };
  assert.equal(isCorsOriginAllowed('https://pixxtech-expense-tracker-fz2h.vercel.app', env), true);
  assert.equal(isCorsOriginAllowed('https://pixxtech-expense-tracker.vercel.app', env), true);
  assert.equal(isCorsOriginAllowed('https://custom.example', env), true);
  assert.equal(isCorsOriginAllowed('http://localhost:5173', env), true);
  assert.equal(isCorsOriginAllowed('https://evil.example', env), false);
  assert.equal(isCorsOriginAllowed('https://custom.example.attacker.tld', env), false);
  assert.equal(isCorsOriginAllowed('null', env), false);
  assert.equal(isCorsOriginAllowed(undefined, env), true);
  assert.equal(getCorsAllowedOrigins({ CORS_ORIGIN: 'https://custom.example/path' }).has('https://custom.example/path'), false);
});
