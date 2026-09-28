import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatSalaryMonth,
  getSalaryPaymentDetail,
  getSalaryPaymentPeriod,
  getUtcMonthDateRange,
} from '../services/salaryReportingService.js';

const cases = [
  {
    name: 'August salary paid in August',
    salaryMonth: '2026-08',
    paymentDate: '2026-08-31T12:00:00.000Z',
    expectedFinancialMonth: '2026-08',
  },
  {
    name: 'Sabir Nawaz August salary paid in September',
    employeeName: 'Sabir Nawaz',
    salaryMonth: '2026-08',
    paymentDate: '2026-09-15T12:00:00.000Z',
    expectedFinancialMonth: '2026-09',
  },
  {
    name: 'September salary paid in September',
    salaryMonth: '2026-09',
    paymentDate: '2026-09-30T12:00:00.000Z',
    expectedFinancialMonth: '2026-09',
  },
  {
    name: 'October salary paid in September as advance',
    salaryMonth: '2026-10',
    paymentDate: '2026-09-25T12:00:00.000Z',
    expectedFinancialMonth: '2026-09',
  },
  {
    name: 'August salary paid in October',
    salaryMonth: '2026-08',
    paymentDate: '2026-10-02T12:00:00.000Z',
    expectedFinancialMonth: '2026-10',
  },
];

const isTransactionInMonth = (transaction, month) => {
  const { startDate, endDate } = getUtcMonthDateRange(...month.split('-').map(Number));
  const date = new Date(transaction.date);
  return date >= startDate && date <= endDate;
};

for (const scenario of cases) {
  test(`salary financial reporting uses payment date: ${scenario.name}`, () => {
    const payment = {
      date: scenario.paymentDate,
      amount: 38000,
      salaryForMonth: scenario.salaryMonth,
      employeeName: scenario.employeeName || 'Test Employee',
    };
    const paymentPeriod = getSalaryPaymentPeriod(payment.salaryForMonth, payment.date);

    assert.equal(paymentPeriod.salaryForMonth, scenario.salaryMonth);
    assert.equal(paymentPeriod.paymentMonth, scenario.expectedFinancialMonth);
    assert.equal(isTransactionInMonth(payment, scenario.expectedFinancialMonth), true);
    assert.equal(isTransactionInMonth(payment, scenario.salaryMonth), scenario.salaryMonth === scenario.expectedFinancialMonth);

    const reportMonths = ['2026-08', '2026-09', '2026-10']
      .filter((month) => isTransactionInMonth(payment, month));
    assert.deepEqual(reportMonths, [scenario.expectedFinancialMonth]);
  });
}

test('advance salary is explicitly labeled and retains its salary period', () => {
  const details = getSalaryPaymentDetail({
    employeeName: 'Sabir Nawaz',
    salaryMonth: '2026-10',
    paymentDate: '2026-09-25T12:00:00.000Z',
  });

  assert.match(details, /ADVANCE SALARY/);
  assert.match(details, /Sabir Nawaz/);
  assert.match(details, /October 2026 Salary/);
  assert.match(details, /paid 2026-09/);
  assert.equal(formatSalaryMonth('2026-08'), 'August 2026');
});

test('salary paid during its salary month is treated as an advance in that payment month', () => {
  const paymentDate = '2026-09-05T12:00:00.000Z';
  const period = getSalaryPaymentPeriod('2026-09', paymentDate);
  const detail = getSalaryPaymentDetail({
    employeeName: 'Sabir Nawaz',
    salaryMonth: '2026-09',
    paymentDate,
  });

  assert.equal(period.salaryForMonth, '2026-09');
  assert.equal(period.paymentMonth, '2026-09');
  assert.equal(period.classification, 'ADVANCE_SALARY');
  assert.match(detail, /^ADVANCE SALARY/);
  assert.match(detail, /September 2026 Salary/);
});

test('missing historical payment dates are flagged without inferring a salary-month date', () => {
  const paymentPeriod = getSalaryPaymentPeriod('2026-08', null);

  assert.equal(paymentPeriod.salaryForMonth, '2026-08');
  assert.equal(paymentPeriod.paymentMonth, null);
  assert.equal(paymentPeriod.requiresPaymentDateCorrection, true);
});
