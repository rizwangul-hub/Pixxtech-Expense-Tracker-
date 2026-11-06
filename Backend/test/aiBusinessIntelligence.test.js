import test from 'node:test';
import assert from 'node:assert/strict';
import { installBusinessFixtures, fixtureId as id, fixtureUser as user } from './aiBusinessFixtures.js';
import { BUSINESS_HANDLERS as tools } from '../services/ai/businessToolExecutor.js';
import { ALL_ROWS, periodFor } from '../services/ai/businessCommon.js';
import { resolveEntity } from '../services/ai/businessDirectory.js';
import { getAccountRunningLedger, getHeadWiseExpenseReport } from '../services/ledgerService.js';
import { calculateMonthlyPayrollRecord } from '../services/staffPayrollService.js';
import { BUSINESS_TOOL_DECLARATIONS, validateBusinessArguments } from '../services/ai/businessToolCatalog.js';

const october = { month: 10, year: 2026 };
test('synthetic bank statement agrees with production ledger, isolates all accounts and retains full totals across pages', async t => {
  installBusinessFixtures(t);
  const result = await tools.getFinancialLedger({ kind: 'ACCOUNT', accountName: 'Bank Alfalah', ...october, pageSize: 2 }, user);
  const expected = await getAccountRunningLedger(id(11), periodFor(october).start, periodFor(october).end, { preserveEndInstant: true });
  assert.equal(result.report.entity.id, id(11));
  assert.deepEqual(result.report.summary, { openingBalance: 110000, totalDebit: 2500, totalCredit: 300, closingBalance: 107800, periodEntries: 3, matchingEntries: 3 });
  assert.equal(result.report.summary.closingBalance, expected.closingBalance);
  assert.equal(result.report.rows.length, 2);
  assert.equal(result.report.pagination.total, 3);
  const second = await tools.getFinancialLedger({ kind: 'ACCOUNT', accountId: id(11), ...october, pageSize: 2, page: 2 }, user);
  assert.deepEqual(second.report.rows.map(row => row.voucherNo), ['FIX-105']);
  assert.deepEqual(second.report.summary, result.report.summary);
  const withdrawals = await tools.getFinancialLedger({ kind: 'ACCOUNT', accountId: id(11), ...october, direction: 'WITHDRAWALS' }, user);
  assert.equal(withdrawals.report.pagination.total, 2);
  assert.equal(withdrawals.report.summary.closingBalance, 107800);
  for (const accountId of [11, 12, 13, 14]) {
    const response = await tools.getFinancialLedger({ kind: 'ACCOUNT', accountId: id(accountId), ...october }, user);
    const ledger = await getAccountRunningLedger(id(accountId), periodFor(october).start, periodFor(october).end, { preserveEndInstant: true });
    assert.equal(response.report.summary.closingBalance, ledger.closingBalance);
    assert.equal(response.report.rows.length, ledger.entries.length);
  }
  const cash = await tools.getFinancialLedger({ kind: 'ACCOUNT', accountName: 'Cash Hand Sabir', ...october }, user);
  assert.equal(cash.report.summary.openingBalance, 5000);
  assert.equal(cash.report.summary.closingBalance, 5400);
  assert.ok(!JSON.stringify(result).includes('PRIVATE-BANK-NUMBER'));
});

test('safe employee profile uses the real gross salary virtual and distinguishes individual recorded payroll', async t => {
  installBusinessFixtures(t);
  const profile = await tools.getEmployeeProfile({ employeeName: 'Rizwan Ullah' }, user);
  assert.equal(profile.employee.configuredGrossSalary, 55000);
  assert.equal(profile.employee.designation, 'Supervisor');
  const salary = await tools.getSalarySummary({ employeeId: id(1), ...october }, user);
  assert.equal(salary.netPayable, 50000);
  assert.equal(salary.currentLoanBalance, 6000);
  const missingPayroll = await tools.getSalarySummary({ employeeId: id(2), ...october }, user);
  assert.equal(missingPayroll.netPayable, null);
  assert.equal(missingPayroll.configuredGrossSalary, 42000);
  for (const secret of ['PRIVATE-IDENTIFIER', 'PRIVATE-ACCOUNT']) assert.ok(!JSON.stringify(profile).includes(secret));
});

test('salary ledger retains production accrual/payment dates and exact individual totals', async t => {
  installBusinessFixtures(t);
  const ledger = await tools.getEmployeeLedger({ employeeId: id(1), allTime: true }, user);
  assert.equal(ledger.summary.totalAccrued, 50000);
  assert.equal(ledger.summary.totalPaid, 30000);
  assert.equal(ledger.summary.pendingBalance, 20000);
  assert.deepEqual(ledger.report.rows.map(row => row.date), ['2026-10-31', '2026-11-01']);
  assert.equal(ledger.report.rows[0].voucherNo, null);
  assert.equal(ledger.report.rows[1].voucherNo, 'SAL-FIX-1');
  const month = await tools.getEmployeeLedger({ employeeId: id(1), ...october }, user);
  assert.equal(month.report.summary.totalCredit, 0);
  assert.equal(month.report.summary.closingBalance, 50000);
  const payroll = await tools.getPayrollHistory({ employeeId: id(1), ...october }, user);
  assert.equal(payroll.report.summary.remainingPayable, 20000);
});

test('loan history totals include all thirteen records and retain recorded per-employee balances', async t => {
  installBusinessFixtures(t);
  const report = await tools.getEmployeeLoanSummary({ employeeName: 'Rizwan Ullah', allTime: true, pageSize: 5 }, user);
  assert.equal(report.recordsCount, 13);
  assert.equal(report.totalDisbursed, 10000);
  assert.equal(report.totalRepaid, 4000);
  assert.equal(report.currentLoanBalance, 6000);
  assert.equal(report.report.pagination.pageCount, 3);
  assert.ok(report.report[ALL_ROWS].every(row => row.voucherNo === null));
  const page = await tools.getEmployeeLoanSummary({ employeeId: id(1), allTime: true, page: 3, pageSize: 5 }, user);
  assert.equal(page.report.rows.length, 3);
  assert.equal(page.report.rows.at(-1).runningBalance, 6000);
  const all = await tools.getFinancialLedger({ kind: 'LOAN', ...october }, user);
  assert.equal(all.report.summary.recordedRecoveries, 4000);
  assert.ok(all.report.rows.every(row => row.employee === 'Rizwan Ullah'));
});

test('property expense/head filtering agrees with production expense calculation without duplicate totals', async t => {
  installBusinessFixtures(t);
  const report = await tools.getFinancialLedger({ kind: 'EXPENSE', propertyId: id(21), categoryName: 'Electricity', ...october }, user);
  const source = await getHeadWiseExpenseReport(2026, 10, { propertyId: id(21), categoryId: id(31) });
  assert.equal(report.totalExpenses, 2000);
  assert.equal(report.totalExpenses, source.totalExpensesOverall);
  assert.equal(report.report.rows.length, 1);
  assert.equal(report.report.rows[0].voucherNo, 'FIX-102');
  const repairs = await tools.getFinancialLedger({ kind: 'EXPENSE', categoryName: 'Repairs', ...october }, user);
  assert.equal(repairs.totalExpenses, 100);
  const income = await tools.getFinancialLedger({ kind: 'INCOME', incomeHeadName: 'Consultancy', ...october }, user);
  assert.equal(income.report.summary.closingBalance, 1500);
  assert.equal(income.report.rows.length, 1);
});

test('actual transaction/voucher lookup preserves source metadata without exposing document URLs', async t => {
  installBusinessFixtures(t);
  const voucher = await tools.getVoucherDetails({ voucherNo: 'FIX-102' }, user);
  assert.equal(voucher.report.summary.totalAmount, 2000);
  assert.equal(voucher.report.summary.createdBy, 'Fixture accountant');
  assert.equal(voucher.report.rows[0].documentCount, 1);
  assert.equal(voucher.report.rows[0].description, 'Synthetic entry 102');
  assert.ok(!JSON.stringify(voucher).includes('PRIVATE-DOCUMENT-URL'));
  const entry = await tools.getTransactionDetails({ transactionId: id(102) }, user);
  assert.equal(entry.report.rows[0].creditAccount, 'Bank Al Falah (Kamran Ijaz Sb)');
  assert.equal(entry.report.rows[0].head, 'Electricity');
  const linked = await tools.searchTransactions({ employeeId: id(1), allTime: true }, user);
  assert.deepEqual(linked.report.rows.map(row => row.id), [id(109)]);
  const threshold = await tools.searchTransactions({ minAmount: 1000, ...october }, user);
  assert.deepEqual(threshold.report.rows.map(row => row.id), [id(102)]);
});

test('attendance summary agrees with production counter and does not turn missing dates into absences', async t => {
  const { data } = installBusinessFixtures(t);
  const result = await tools.getAttendanceReport({ employeeId: id(1), ...october, view: 'SUMMARY' }, user);
  const actual = calculateMonthlyPayrollRecord(data.Employee[0], data.Attendance, '2026-10');
  assert.equal(result.report.rows[0].presentDays, actual.presentDays);
  assert.equal(result.report.rows[0].presentDays, 2.5);
  assert.equal(result.report.rows[0].absentDays, 1);
  assert.equal(result.report.rows[0].leaveDays, 1);
  assert.equal(result.report.rows[0].lateDays, 1);
  assert.equal(result.report.summary.recordedAttendance, 5);
  const leave = await tools.getLeaveRecords({ employeeId: id(1), ...october }, user);
  assert.equal(leave.report.rows[0].recordedIntervalDays, 3);
  const absent = await tools.getAttendanceReport({ ...october, status: 'ABSENT' }, user);
  assert.equal(absent.report.rows.length, 1);
});

test('properties, embedded units, tenants and receivable opening balances use actual relationships', async t => {
  installBusinessFixtures(t);
  const property = await tools.getPropertyDetails({ propertyName: 'Fixture Plaza' }, user);
  assert.equal(property.report.summary.registeredUnits, 2);
  assert.equal(property.report.summary.vacantUnits, 1);
  assert.equal(property.report.rows[0].tenant, 'Fixture Tenant');
  const vacant = await tools.getPropertyDetails({ propertyId: id(21), unitStatus: 'VACANT' }, user);
  assert.equal(vacant.report.rows[0].unit, 'Shop G2');
  await assert.rejects(tools.getPropertyDetails({ propertyId: id(21), unitId: id(999) }, user));
  const tenant = await tools.getTenantDetails({ tenantName: 'Fixture Tenant' }, user);
  assert.equal(tenant.report.rows[0].agreement, 'FIX-AGR');
  assert.ok(!JSON.stringify(tenant).includes('PRIVATE-TENANT-ID'));
  const ledger = await tools.getFinancialLedger({ kind: 'TENANT', tenantId: id(701), ...october }, user);
  assert.equal(ledger.report.summary.openingBalance, 6000);
  assert.equal(ledger.report.summary.closingBalance, 5000);
});

test('dynamic exact/partial/fuzzy matching detects ambiguity and missing entities', async t => {
  installBusinessFixtures(t);
  assert.equal((await resolveEntity('employee', { name: 'Rizwan' }, user)).kind, 'AMBIGUOUS');
  assert.equal((await resolveEntity('employee', { name: 'Rizwan Ulah' }, user)).record._id, id(1));
  assert.equal((await resolveEntity('employee', { name: 'Nobody' }, user)).kind, 'NOT_FOUND');
  assert.equal((await resolveEntity('account', { name: 'Bank Al Falah' }, user)).record._id, id(11));
  await assert.rejects(resolveEntity('employee', { name: 'Sabir Nawaz', id: id(1) }, user));
});

test('universal search pages real counts across all entity and record families', async t => {
  installBusinessFixtures(t);
  for (const entityType of ['employee', 'account', 'property', 'unit', 'tenant', 'category', 'incomeHead', 'transaction', 'voucher', 'payroll', 'loan', 'attendance']) {
    const response = await tools.searchBusinessData({ entityType, pageSize: 1, allTime: true }, user);
    assert.ok(response.report.pagination.total > 0, entityType);
    assert.equal(response.report.rows.length, 1, entityType);
    assert.equal(response.report.rows[0].entityType, entityType);
    if (response.report.pagination.hasNext) {
      const next = await tools.searchBusinessData({ entityType, pageSize: 1, page: 2, allTime: true }, user);
      assert.notEqual(next.report.rows[0].id, response.report.rows[0].id, entityType);
    }
  }
});

test('verification permissions limit data-entry records to their actual submitter', async t => {
  installBusinessFixtures(t);
  const own = await tools.getVerificationRecords(october, user);
  assert.equal(own.report.rows.length, 1);
  assert.equal(own.report.rows[0].amount, 500);
  const verifier = await tools.getVerificationRecords(october, { ...user, role: 'VERIFICATION_MANAGER' });
  assert.equal(verifier.report.rows.length, 2);
});

test('duplicate candidates are labeled and all tools reject unauthorized access before reads', async t => {
  const { data, reads } = installBusinessFixtures(t);
  data.Transaction.push({ ...data.Transaction[1], _id: id(199), voucherNo: 'FIX-DUP' });
  const candidates = await tools.findDuplicateTransactions(october, user);
  assert.equal(candidates.report.rows.length, 1);
  assert.equal(candidates.report.rows[0].count, 2);
  const before = reads.length;
  for (const declaration of BUSINESS_TOOL_DECLARATIONS) {
    await assert.rejects(tools[declaration.name]({}, { ...user, role: 'GUEST' }));
  }
  assert.equal(reads.length, before);
  for (const args of [{ kind: 'ACCOUNT', accountId: { $ne: null } }, { kind: 'ACCOUNT', page: 0 }, { kind: 'ACCOUNT', month: 13 }, { kind: 'ACCOUNT', startDate: '2026-10-32', endDate: '2026-11-01' }, { kind: 'ACCOUNT', query: {} }]) {
    assert.throws(() => validateBusinessArguments(BUSINESS_TOOL_DECLARATIONS.find(tool => tool.name === 'getFinancialLedger'), args));
  }
});
