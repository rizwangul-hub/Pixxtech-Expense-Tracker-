import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRentalReceivableSummary } from '../services/rentalReceivables.js';

const baseContext = () => ({
  properties: [
    {
      _id: 'property-1',
      plazaName: 'Test Plaza',
      units: [
        {
          _id: 'unit-1',
          unitName: 'Unit 1',
          tenantName: 'Tenant 1',
          agreedRent: 100,
          julyReceivable: 200,
        },
      ],
    },
  ],
  agreements: [
    {
      _id: 'agreement-1',
      propertyId: 'property-1',
      unitId: 'unit-1',
      monthlyRent: 100,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      status: 'ACTIVE',
    },
  ],
  dues: [
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-08',
      expectedRentAmount: 100,
      status: 'OVERDUE',
    },
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-09',
      expectedRentAmount: 100,
      status: 'PARTIAL',
    },
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-10',
      expectedRentAmount: 100,
      status: 'DUE',
    },
  ],
  receipts: [],
  rentTransactions: [],
});

test('monthly receivable carries arrears forward and deduplicates linked rent transactions', () => {
  const context = baseContext();
  context.receipts = [
    {
      _id: 'receipt-september',
      propertyId: 'property-1',
      unitId: 'unit-1',
      transactionId: 'transaction-september',
      receiptDate: new Date('2026-09-10T12:00:00.000Z'),
      rentMonth: '2026-09',
      amount: 80,
      allocatedCurrentMonth: 80,
      allocatedPreviousReceivable: 0,
      allocatedAdvance: 0,
      status: 'VERIFIED',
      receivingAccountId: { name: 'Bank Account' },
    },
    {
      _id: 'receipt-october',
      propertyId: 'property-1',
      unitId: 'unit-1',
      transactionId: 'transaction-october',
      receiptDate: new Date('2026-10-05T12:00:00.000Z'),
      rentMonth: '2026-10',
      amount: 150,
      allocatedCurrentMonth: 100,
      allocatedPreviousReceivable: 50,
      allocatedAdvance: 0,
      status: 'VERIFIED',
      receivingAccountId: { name: 'Cash in Hand' },
    },
  ];
  context.rentTransactions = [
    {
      _id: 'transaction-september',
      propertyId: 'property-1',
      unitId: 'unit-1',
      date: new Date('2026-09-10T12:00:00.000Z'),
      amount: 80,
      status: 'VERIFIED',
    },
    {
      _id: 'transaction-october',
      propertyId: 'property-1',
      unitId: 'unit-1',
      date: new Date('2026-10-05T12:00:00.000Z'),
      amount: 150,
      status: 'VERIFIED',
    },
  ];

  const summary = buildRentalReceivableSummary(context, '2026-10');
  const unit = summary.properties[0].units[0];

  assert.equal(unit.agreedRent, 100);
  assert.equal(unit.priorMonthReceivable, 320);
  assert.equal(unit.receivedAmount, 150);
  assert.equal(unit.outstandingReceivable, 270);
  assert.equal(summary.grandTotals.totalOutstandingReceivable, 270);
});

test('rent advances offset accumulated receivables and remain visible separately', () => {
  const context = baseContext();
  context.properties[0].units[0].julyReceivable = -50;
  context.agreements = [];
  context.dues = [
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-10',
      expectedRentAmount: 100,
      status: 'DUE',
    },
  ];
  context.receipts = [
    {
      _id: 'receipt-advance',
      propertyId: 'property-1',
      unitId: 'unit-1',
      receiptDate: new Date('2026-10-05T12:00:00.000Z'),
      amount: 100,
      status: 'VERIFIED',
      receivingAccountId: { name: 'Bank Account' },
    },
  ];

  const unit = buildRentalReceivableSummary(context, '2026-10').properties[0].units[0];
  assert.equal(unit.outstandingReceivable, 0);
  assert.equal(unit.advanceRentReceived, 50);
});

test('prior-month advance rent is applied to a later month before reporting its receivable', () => {
  const context = baseContext();
  context.agreements = [];
  context.properties[0].units[0].julyReceivable = 0;
  context.dues = [
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-10',
      expectedRentAmount: 100,
      status: 'DUE',
    },
  ];
  context.receipts = [
    {
      _id: 'receipt-september-advance',
      propertyId: 'property-1',
      unitId: 'unit-1',
      receiptDate: new Date('2026-09-20T12:00:00.000Z'),
      rentMonth: '2026-09',
      amount: 40,
      allocatedCurrentMonth: 0,
      allocatedPreviousReceivable: 0,
      allocatedAdvance: 40,
      status: 'VERIFIED',
    },
  ];

  const unit = buildRentalReceivableSummary(context, '2026-10').properties[0].units[0];
  assert.equal(unit.outstandingReceivable, 60);
  assert.equal(unit.advanceRentReceived, 0);
});

test('prepaid rent for a future month does not clear the current month before its due month', () => {
  const context = baseContext();
  context.agreements = [];
  context.properties[0].units[0].julyReceivable = 0;
  context.dues = [
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-09',
      expectedRentAmount: 100,
      status: 'DUE',
    },
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-10',
      expectedRentAmount: 100,
      status: 'DUE',
    },
  ];
  context.receipts = [
    {
      _id: 'receipt-october-prepaid',
      propertyId: 'property-1',
      unitId: 'unit-1',
      receiptDate: new Date('2026-09-20T12:00:00.000Z'),
      rentMonth: '2026-10',
      amount: 100,
      allocatedCurrentMonth: 100,
      allocatedPreviousReceivable: 0,
      allocatedAdvance: 0,
      status: 'VERIFIED',
    },
  ];

  const september = buildRentalReceivableSummary(context, '2026-09').properties[0].units[0];
  const october = buildRentalReceivableSummary(context, '2026-10').properties[0].units[0];
  assert.equal(september.outstandingReceivable, 100);
  assert.equal(september.advanceRentReceived, 100);
  assert.equal(october.outstandingReceivable, 100);
  assert.equal(october.advanceRentReceived, 0);
});

test('month due snapshots take precedence over changed agreement rent and missing months use lease history', () => {
  const context = baseContext();
  context.agreements[0].monthlyRent = 120;
  context.dues = [
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-08',
      expectedRentAmount: 100,
      status: 'OVERDUE',
    },
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-09',
      expectedRentAmount: 110,
      status: 'OVERDUE',
    },
  ];

  const unit = buildRentalReceivableSummary(context, '2026-10').properties[0].units[0];
  assert.equal(unit.agreedRent, 120);
  assert.equal(unit.priorMonthReceivable, 410);
  assert.equal(unit.outstandingReceivable, 530);
});

test('reversed receipts, pending rent transactions, and unrelated transactions do not reduce receivable', () => {
  const context = baseContext();
  context.agreements = [];
  context.properties[0].units[0].julyReceivable = 0;
  context.dues = [
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      rentMonth: '2026-10',
      expectedRentAmount: 100,
      status: 'DUE',
    },
  ];
  context.receipts = [
    {
      propertyId: 'property-1',
      unitId: 'unit-1',
      receiptDate: new Date('2026-10-05T12:00:00.000Z'),
      amount: 70,
      status: 'REVERSED',
    },
  ];
  context.rentTransactions = [
    {
      _id: 'pending-rent',
      propertyId: 'property-1',
      unitId: 'unit-1',
      date: new Date('2026-10-06T12:00:00.000Z'),
      amount: 60,
      status: 'PENDING',
      reportCategory: 'Rent',
      transactionType: 'INCOME',
    },
    {
      _id: 'unrelated',
      propertyId: 'property-1',
      unitId: 'unit-1',
      date: new Date('2026-10-07T12:00:00.000Z'),
      amount: 90,
      status: 'VERIFIED',
      reportCategory: 'Other Income',
      transactionType: 'INCOME',
    },
  ];

  const unit = buildRentalReceivableSummary(context, '2026-10').properties[0].units[0];
  assert.equal(unit.receivedAmount, 0);
  assert.equal(unit.outstandingReceivable, 100);
});
