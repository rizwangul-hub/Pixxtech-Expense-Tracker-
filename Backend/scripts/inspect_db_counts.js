import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import OtherIncomeHead from '../models/OtherIncomeHead.js';

import Transaction from '../models/Transaction.js';
import RentReceived from '../models/RentReceived.js';
import RentDue from '../models/RentDue.js';
import OtherIncome from '../models/OtherIncome.js';
import Voucher from '../models/Voucher.js';
import PendingEntry from '../models/PendingEntry.js';
import MonthlyReport from '../models/MonthlyReport.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Payroll from '../models/Payroll.js';
import StaffLoan from '../models/StaffLoan.js';
import StaffLeave from '../models/StaffLeave.js';
import StaffAuditLog from '../models/StaffAuditLog.js';

dotenv.config();

async function inspectCounts() {
  await connectDB();
  const properties = await Property.find().lean();
  let totalUnits = 0;
  properties.forEach((p) => {
    if (Array.isArray(p.units)) totalUnits += p.units.length;
  });

  console.log('\n========================================');
  console.log('--- MASTER DATA (TO BE PRESERVED) ---');
  console.log('========================================');
  console.log('Users:', await User.countDocuments());
  console.log('Properties:', properties.length);
  console.log('Total Units (embedded):', totalUnits);
  console.log('Tenants:', await Tenant.countDocuments());
  console.log('Rental Agreements:', await RentalAgreement.countDocuments());
  console.log('Accounts (Bank & Cash Holders):', await Account.countDocuments());
  console.log('Categories (Expense Heads):', await Category.countDocuments());
  console.log('Other Income Heads:', await OtherIncomeHead.countDocuments());
  console.log('Employees:', await Employee.countDocuments());

  console.log('\n========================================');
  console.log('--- TRANSACTIONAL DATA (TO BE DELETED) ---');
  console.log('========================================');
  console.log('Transactions (Expenses/Transfers):', await Transaction.countDocuments());
  console.log('Rent Received Records:', await RentReceived.countDocuments());
  console.log('Rent Due Records:', await RentDue.countDocuments());
  console.log('Other Income Records:', await OtherIncome.countDocuments());
  console.log('Vouchers:', await Voucher.countDocuments());
  console.log('Pending Verification Entries:', await PendingEntry.countDocuments());
  console.log('Monthly Reports:', await MonthlyReport.countDocuments());
  console.log('Attendance Records:', await Attendance.countDocuments());
  console.log('Payroll Records:', await Payroll.countDocuments());
  console.log('Staff Loan Records:', await StaffLoan.countDocuments());
  console.log('Staff Leave Records:', await StaffLeave.countDocuments());
  console.log('Staff Audit Logs:', await StaffAuditLog.countDocuments());

  process.exit(0);
}

inspectCounts().catch((err) => {
  console.error(err);
  process.exit(1);
});
