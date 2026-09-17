import dotenv from 'dotenv';
import connectDB from '../config/db.js';

import User from '../models/User.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import OtherIncomeHead from '../models/OtherIncomeHead.js';
import Employee from '../models/Employee.js';

import Transaction from '../models/Transaction.js';
import RentReceived from '../models/RentReceived.js';
import RentDue from '../models/RentDue.js';
import OtherIncome from '../models/OtherIncome.js';
import Voucher from '../models/Voucher.js';
import PendingEntry from '../models/PendingEntry.js';
import MonthlyReport from '../models/MonthlyReport.js';
import Attendance from '../models/Attendance.js';
import Payroll from '../models/Payroll.js';
import StaffLoan from '../models/StaffLoan.js';
import StaffLeave from '../models/StaffLeave.js';
import StaffAuditLog from '../models/StaffAuditLog.js';

dotenv.config();

async function cleanupOperationalData() {
  console.log('\n========================================');
  console.log(' STARTING OPERATIONAL DATA CLEANUP');
  console.log('========================================\n');

  await connectDB();

  // 1. Delete Operational Transactions
  console.log('Clearing Transaction records...');
  const resTx = await Transaction.deleteMany({});
  console.log(`✓ Removed ${resTx.deletedCount} Transaction records.`);

  console.log('Clearing RentReceived records...');
  const resRentRec = await RentReceived.deleteMany({});
  console.log(`✓ Removed ${resRentRec.deletedCount} RentReceived records.`);

  console.log('Clearing RentDue records...');
  const resRentDue = await RentDue.deleteMany({});
  console.log(`✓ Removed ${resRentDue.deletedCount} RentDue records.`);

  console.log('Clearing OtherIncome records...');
  const resOtherInc = await OtherIncome.deleteMany({});
  console.log(`✓ Removed ${resOtherInc.deletedCount} OtherIncome records.`);

  console.log('Clearing Voucher records...');
  const resVouchers = await Voucher.deleteMany({});
  console.log(`✓ Removed ${resVouchers.deletedCount} Voucher records.`);

  console.log('Clearing Pending Verification Entries...');
  const resPending = await PendingEntry.deleteMany({});
  console.log(`✓ Removed ${resPending.deletedCount} PendingEntry records.`);

  console.log('Clearing Monthly Reports...');
  const resReports = await MonthlyReport.deleteMany({});
  console.log(`✓ Removed ${resReports.deletedCount} MonthlyReport records.`);

  console.log('Clearing Staff Attendance records...');
  const resAtt = await Attendance.deleteMany({});
  console.log(`✓ Removed ${resAtt.deletedCount} Attendance records.`);

  console.log('Clearing Staff Payroll records...');
  const resPay = await Payroll.deleteMany({});
  console.log(`✓ Removed ${resPay.deletedCount} Payroll records.`);

  console.log('Clearing Staff Loan records...');
  const resLoans = await StaffLoan.deleteMany({});
  console.log(`✓ Removed ${resLoans.deletedCount} StaffLoan records.`);

  console.log('Clearing Staff Leave records...');
  const resLeaves = await StaffLeave.deleteMany({});
  console.log(`✓ Removed ${resLeaves.deletedCount} StaffLeave records.`);

  console.log('Clearing Staff Audit Logs...');
  const resLogs = await StaffAuditLog.deleteMany({});
  console.log(`✓ Removed ${resLogs.deletedCount} StaffAuditLog records.`);

  // 2. Reset Account Balances to Opening Balances
  console.log('\nResetting Account balances to Opening Balances...');
  const accounts = await Account.find({});
  let resetAccountCount = 0;
  for (const acc of accounts) {
    acc.currentBalance = acc.openingBalance || 0;
    await acc.save();
    resetAccountCount++;
    console.log(`  - Account '${acc.name}': Current Balance reset to Opening Balance (Rs. ${acc.openingBalance})`);
  }
  console.log(`✓ Reset balances for ${resetAccountCount} accounts.`);

  // 3. Reset Employee Loan Balances to 0
  console.log('\nResetting Employee loan balances...');
  const employees = await Employee.find({});
  for (const emp of employees) {
    emp.loanBalance = 0;
    await emp.save();
  }
  console.log(`✓ Reset loan balances to 0 for ${employees.length} employees.`);

  // 4. Verify Master Data Status
  const properties = await Property.find().lean();
  let totalUnits = 0;
  properties.forEach((p) => {
    if (Array.isArray(p.units)) totalUnits += p.units.length;
  });

  console.log('\n========================================');
  console.log(' FINAL MASTER DATA PRESERVATION STATUS');
  console.log('========================================');
  console.log('✓ Users:', await User.countDocuments());
  console.log('✓ Properties:', properties.length);
  console.log('✓ Total Units (embedded):', totalUnits);
  console.log('✓ Tenants:', await Tenant.countDocuments());
  console.log('✓ Rental Agreements:', await RentalAgreement.countDocuments());
  console.log('✓ Accounts (Bank & Cash Holders):', await Account.countDocuments());
  console.log('✓ Categories (Expense Heads):', await Category.countDocuments());
  console.log('✓ Other Income Heads:', await OtherIncomeHead.countDocuments());
  console.log('✓ Employees:', await Employee.countDocuments());

  console.log('\n========================================');
  console.log(' FINAL TRANSACTIONAL DATA STATUS');
  console.log('========================================');
  console.log('✓ Transactions:', await Transaction.countDocuments());
  console.log('✓ Rent Received Records:', await RentReceived.countDocuments());
  console.log('✓ Rent Due Records:', await RentDue.countDocuments());
  console.log('✓ Other Income Records:', await OtherIncome.countDocuments());
  console.log('✓ Vouchers:', await Voucher.countDocuments());
  console.log('✓ Pending Verification Entries:', await PendingEntry.countDocuments());
  console.log('✓ Monthly Reports:', await MonthlyReport.countDocuments());
  console.log('✓ Attendance Records:', await Attendance.countDocuments());
  console.log('✓ Payroll Records:', await Payroll.countDocuments());
  console.log('✓ Staff Loan Records:', await StaffLoan.countDocuments());
  console.log('✓ Staff Leave Records:', await StaffLeave.countDocuments());

  console.log('\nSUCCESS: Database successfully reset for fresh real data entry from September!\n');
  process.exit(0);
}

cleanupOperationalData().catch((err) => {
  console.error('[Cleanup Error]:', err);
  process.exit(1);
});
