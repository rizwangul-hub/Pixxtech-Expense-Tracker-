// Synthetic fixtures only. No connection, seed, or mutation of a business database.
import Account from '../models/Account.js';
import Employee from '../models/Employee.js';
import Category from '../models/Category.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import Transaction from '../models/Transaction.js';
import Voucher from '../models/Voucher.js';
import Payroll from '../models/Payroll.js';
import StaffLoan from '../models/StaffLoan.js';
import Attendance from '../models/Attendance.js';
import StaffLeave from '../models/StaffLeave.js';
import RentalAgreement from '../models/RentalAgreement.js';
import RentDue from '../models/RentDue.js';
import RentReceived from '../models/RentReceived.js';
import OtherIncomeHead from '../models/OtherIncomeHead.js';
import OtherIncome from '../models/OtherIncome.js';
import PendingEntry from '../models/PendingEntry.js';
import User from '../models/User.js';

export const fixtureId = number => number.toString(16).padStart(24, '0');
export const fixtureUser = { _id: fixtureId(900), role: 'DATA_ENTRY', isActive: true, tokenVersion: 0 };
const key = value => String(value?._id ?? value ?? '');
const clone = value => structuredClone(value);
const get = (object, path) => path.split('.').reduce((value, part) => value?.[part], object);
const equal = (left, right) => right === null ? left == null : key(left) === key(right);

export function fixtureMatches(row, query = {}) {
  return Object.entries(query).every(([field, expected]) => {
    if (field === '$or') return expected.some(condition => fixtureMatches(row, condition));
    if (field === '$and') return expected.every(condition => fixtureMatches(row, condition));
    if (field === '$nor') return !expected.some(condition => fixtureMatches(row, condition));
    const actual = get(row, field);
    if (expected instanceof RegExp) return expected.test(String(actual ?? ''));
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && !expected._id) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$in') return value.some(item => item instanceof RegExp ? item.test(String(actual ?? '')) : equal(actual, item));
        if (operator === '$nin') return !value.some(item => equal(actual, item));
        if (operator === '$ne') return !equal(actual, value);
        if (operator === '$exists') return (actual !== undefined) === value;
        if (operator === '$gte') return actual >= value;
        if (operator === '$lte') return actual <= value;
        if (operator === '$gt') return actual > value;
        if (operator === '$lt') return actual < value;
        throw new Error(`Unsupported fixture query operator: ${operator}`);
      });
    }
    return equal(actual, expected);
  });
}

function projection(row, fields) {
  if (!fields) return clone(row);
  const included = typeof fields === 'string' ? fields.split(/\s+/).filter(Boolean) : Object.keys(fields).filter(field => fields[field]);
  if (included.some(field => field.startsWith('-'))) throw new Error('Fixture projections must be positive allowlists.');
  return Object.fromEntries([...new Set(['_id', ...included.map(field => field.split('.')[0])])].filter(field => row[field] !== undefined).map(field => [field, clone(row[field])]));
}

export function installBusinessFixtures(t) {
  const id = fixtureId;
  const models = { Account, Employee, Category, Property, Tenant, Transaction, Voucher, Payroll, StaffLoan, Attendance, StaffLeave, RentalAgreement, RentDue, RentReceived, OtherIncomeHead, OtherIncome, PendingEntry, User };
  const data = Object.fromEntries(Object.keys(models).map(name => [name, []]));
  data.User = [{ _id: id(900), name: 'Fixture accountant', password: 'never-return-this' }];
  data.Employee = [
    { _id: id(1), name: 'Rizwan Ullah', employeeCode: 'FIX-001', designation: 'Supervisor', department: 'Operations', employmentStatus: 'ACTIVE', basicSalary: 50000, allowance: 5000, loanBalance: 6000, isActive: true, cnic: 'PRIVATE-IDENTIFIER', bankAccountNumber: 'PRIVATE-ACCOUNT' },
    { _id: id(2), name: 'Sabir Nawaz', employeeCode: 'FIX-002', basicSalary: 40000, allowance: 0, fuelAllowance: 2000, loanBalance: 0, isActive: true },
    { _id: id(3), name: 'Rizwan Ali', employeeCode: 'FIX-003', basicSalary: 45000, loanBalance: 0, isActive: true },
  ];
  data.Account = [
    { _id: id(11), name: 'Bank Al Falah (Kamran Ijaz Sb)', bankName: 'Bank Alfalah', ownerName: 'Kamran Ijaz', type: 'BANK', openingBalance: 100000, isActive: true, accountNumber: 'PRIVATE-BANK-NUMBER' },
    { _id: id(12), name: 'UBL Main', bankName: 'UBL', type: 'BANK', openingBalance: 20000, isActive: true },
    { _id: id(13), name: 'Cash Hand Sabir', cashHolder: 'Sabir', type: 'CASH', openingBalance: 5000, isActive: true },
    { _id: id(14), name: 'Allied Bank', bankName: 'Allied Bank', type: 'BANK', openingBalance: 0, isActive: true },
    { _id: id(15), name: 'Expense clearing', type: 'SUSPENSE', openingBalance: 0, isActive: true },
  ];
  data.Property = [{ _id: id(21), plazaName: 'Fixture Plaza', propertyCode: 'FIX-P1', address: 'Synthetic Lahore address', city: 'Lahore', isActive: true, units: [{ _id: id(22), unitName: 'Shop G1', status: 'OCCUPIED', tenantName: 'Fixture Tenant', agreedRent: 10000 }, { _id: id(23), unitName: 'Shop G2', status: 'VACANT' }] }];
  data.Category = [{ _id: id(31), name: 'Electricity', type: 'EXPENSE', propertyId: id(21) }, { _id: id(32), name: 'Repairs', type: 'EXPENSE' }, { _id: id(33), name: 'Salary', type: 'EXPENSE' }, { _id: id(34), name: 'Rent', type: 'INCOME', isRentalHead: true }];
  const tx = (number, date, amount, dr, cr, rest = {}) => ({ _id: id(number), date: new Date(date), amount, drAccountId: id(dr), crAccountId: id(cr), detail: `Synthetic entry ${number}`, voucherNo: `FIX-${number}`, transactionType: 'TRANSFER', status: 'POSTED', createdBy: id(900), ...rest });
  data.Transaction = [
    tx(101, '2026-09-20T09:00:00Z', 10000, 11, 12),
    tx(102, '2026-10-01T00:00:00Z', 2000, 15, 11, { categoryId: id(31), propertyId: id(21), unitId: id(22), transactionType: 'EXPENSE', voucherId: id(201), attachments: [{ originalName: 'synthetic-bill.pdf', url: 'PRIVATE-DOCUMENT-URL' }] }),
    tx(103, '2026-10-02T00:00:00Z', 500, 13, 11),
    tx(104, '2026-10-03T00:00:00Z', 100, 15, 13, { transactionType: 'EXPENSE', categoryId: id(32) }),
    tx(105, '2026-10-31T18:59:59.999Z', 300, 11, 12),
    tx(106, '2026-10-31T19:00:00.000Z', 700, 11, 12),
    tx(107, '2026-10-04T00:00:00Z', 999999, 11, 12, { status: 'void' }),
    tx(108, '2026-10-04T00:00:00Z', 999999, 11, 12, { status: 'REVERSED' }),
    tx(109, '2026-10-31T19:30:00Z', 30000, 15, 11, { transactionType: 'EXPENSE', categoryId: id(33), voucherNo: 'SAL-FIX-1' }),
  ];
  data.Voucher = [{ _id: id(201), voucherNumber: 'FIX-102', voucherDate: new Date('2026-10-01T00:00:00Z'), voucherType: 'PAYMENT', status: 'POSTED', totalAmount: 2000, totalDebit: 2000, totalCredit: 2000, isBalanced: true, createdBy: id(900), checkedBy: 'Fixture checker' }];
  data.Payroll = [{ _id: id(301), employeeId: id(1), employeeName: 'Rizwan Ullah', payrollMonth: '2026-10', basicSalary: 50000, grossSalary: 55000, totalDeduction: 5000, netPayable: 50000, totalInstallmentsPaid: 30000, paymentStatus: 'PARTIAL_PAYMENT', salaryInstallments: [{ amount: 30000, paymentDate: new Date('2026-10-31T19:30:00Z'), voucherNo: 'SAL-FIX-1', transactionId: id(109) }] }];
  data.StaffLoan = [{ _id: id(401), employeeId: id(1), date: new Date('2026-09-15T00:00:00Z'), type: 'DISBURSEMENT', amount: 10000, previousBalance: 0, newBalance: 10000 }, ...Array.from({ length: 12 }, (_, index) => ({ _id: id(402 + index), employeeId: id(1), date: new Date(`2026-10-${String(index + 1).padStart(2, '0')}T00:00:00Z`), type: 'REPAYMENT', amount: index < 11 ? 300 : 700, previousBalance: 10000 - index * 300, newBalance: index < 11 ? 10000 - (index + 1) * 300 : 6000 }))];
  data.Attendance = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE'].map((status, index) => ({ _id: id(501 + index), employeeId: id(1), dateStr: `2026-10-0${index + 1}`, status, arrivalTime: '09:15', lateMinutes: status === 'LATE' ? 15 : 0 }));
  data.StaffLeave = [{ _id: id(601), employeeId: id(1), startDate: new Date('2026-09-30T00:00:00Z'), endDate: new Date('2026-10-02T00:00:00Z'), days: 3, leaveType: 'CASUAL', status: 'APPROVED' }];
  data.Tenant = [{ _id: id(701), fullName: 'Fixture Tenant', status: 'ACTIVE', cnic: 'PRIVATE-TENANT-ID' }];
  data.RentalAgreement = [{ _id: id(711), agreementNumber: 'FIX-AGR', tenantId: id(701), propertyId: id(21), unitId: id(22), monthlyRent: 10000, status: 'ACTIVE', startDate: new Date('2026-09-01T00:00:00Z') }];
  data.RentDue = [{ _id: id(721), tenantId: id(701), propertyId: id(21), unitId: id(22), dueDate: new Date('2026-09-01T00:00:00Z'), rentMonth: '2026-09', expectedRentAmount: 10000, status: 'PARTIAL' }];
  data.RentReceived = [{ _id: id(731), tenantId: id(701), receiptNumber: 'FIX-RCPT', receiptDate: new Date('2026-09-10T00:00:00Z'), rentMonth: '2026-09', amount: 4000, status: 'RECEIVED' }, { _id: id(732), tenantId: id(701), receiptDate: new Date('2026-10-01T00:00:00Z'), amount: 1000, status: 'RECEIVED' }, { _id: id(733), tenantId: id(701), receiptDate: new Date('2026-10-02T00:00:00Z'), amount: 99999, status: 'REVERSED' }];
  data.OtherIncomeHead = [{ _id: id(741), name: 'Consultancy', code: 'FIX-INC', isActive: true }];
  data.OtherIncome = [{ _id: id(751), incomeHeadId: id(741), headName: 'Consultancy', receiptDate: new Date('2026-10-01T00:00:00Z'), amount: 1500, status: 'POSTED', receivedFrom: 'Fixture customer' }, { _id: id(752), incomeHeadId: id(741), receiptDate: new Date('2026-10-01T00:00:00Z'), amount: 999999, status: 'VOID' }];
  data.PendingEntry = [{ _id: id(761), submittedBy: id(900), date: new Date('2026-10-01T00:00:00Z'), amount: 500, status: 'PENDING_VERIFICATION' }, { _id: id(762), submittedBy: id(901), date: new Date('2026-10-01T00:00:00Z'), amount: 999, status: 'PENDING_VERIFICATION' }];
  const refs = { employeeId: 'Employee', categoryId: 'Category', parentCategoryId: 'Category', propertyId: 'Property', tenantId: 'Tenant', drAccountId: 'Account', crAccountId: 'Account', createdBy: 'User' };
  const populate = (row, spec) => {
    const field = spec.path, model = refs[field];
    if (!model || !row[field]) return;
    const record = data[model].find(item => equal(item._id, row[field]));
    if (!record) { row[field] = null; return; }
    row[field] = projection(record, spec.select);
    for (const child of Array.isArray(spec.populate) ? spec.populate : spec.populate ? [spec.populate] : []) populate(row[field], child);
  };
  const reads = [];
  function query(name, filter, single, initialProjection, count = false) {
    reads.push({ model: name, filter });
    let fields = initialProjection, sorting = {}, offset = 0, limit = Infinity, populated = [];
    const result = {
      select(value) { fields = value; return this; }, sort(value) { sorting = value; return this; }, skip(value) { offset = value; return this; }, limit(value) { limit = value; return this; }, maxTimeMS() { return this; },
      populate(path, select) { populated.push(typeof path === 'object' ? path : { path, select }); return this; },
      async lean() {
        let rows = data[name].filter(row => fixtureMatches(row, filter));
        if (count) return rows.length;
        rows.sort((left, right) => { for (const [field, direction] of Object.entries(sorting)) { const a = get(left, field), b = get(right, field); if (a < b) return -direction; if (a > b) return direction; } return 0; });
        rows = rows.slice(offset, offset + limit).map(row => projection(row, fields));
        for (const row of rows) for (const spec of populated) populate(row, spec);
        return single ? rows[0] ?? null : rows;
      },
      then(resolve, reject) { return this.lean().then(resolve, reject); },
    };
    return result;
  }
  for (const [name, model] of Object.entries(models)) {
    t.mock.method(model, 'find', (filter = {}, fields) => query(name, filter, false, fields));
    t.mock.method(model, 'findOne', (filter = {}, fields) => query(name, filter, true, fields));
    t.mock.method(model, 'findById', (recordId, fields) => query(name, { _id: recordId }, true, fields));
    t.mock.method(model, 'countDocuments', (filter = {}) => query(name, filter, false, '', true));
    for (const method of ['create', 'insertMany', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany']) t.mock.method(model, method, () => { throw new Error(`Assistant attempted a forbidden ${name}.${method} mutation`); });
  }
  return { data, reads };
}
