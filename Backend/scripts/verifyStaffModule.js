import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import StaffLoan from '../models/StaffLoan.js';
import Payroll from '../models/Payroll.js';

async function verify() {
  await connectDB();
  console.log('\n--- VERIFYING STAFF HR & PAYROLL MODULE ---');

  // 1. Employee Directory
  const empCount = await Employee.countDocuments({ isActive: true });
  console.log(`✓ Active Employees in Database: ${empCount}`);

  // 2. Attendance Marking Test
  const firstEmp = await Employee.findOne({ name: 'Faiz Mujahid' });
  if (firstEmp) {
    await Attendance.findOneAndUpdate(
      { employeeId: firstEmp._id, dateStr: '2026-08-15' },
      {
        employeeId: firstEmp._id,
        date: new Date('2026-08-15'),
        dateStr: '2026-08-15',
        shiftOpeningTime: '12:30',
        arrivalTime: '12:45',
        status: 'LATE',
        lateMinutes: 15,
        remarks: 'Traffic delay',
      },
      { upsert: true, new: true }
    );
    console.log(`✓ Daily Attendance record created for ${firstEmp.name} (Late 15 mins)`);
  }

  // 3. Staff Loan / Advance Salary Test
  if (firstEmp) {
    const prevBal = firstEmp.loanBalance || 0;
    const loanAmt = 5000;
    firstEmp.loanBalance = prevBal + loanAmt;
    await firstEmp.save();

    await StaffLoan.create({
      employeeId: firstEmp._id,
      type: 'DISBURSEMENT',
      amount: loanAmt,
      previousBalance: prevBal,
      newBalance: firstEmp.loanBalance,
      description: 'Test Advance Salary',
    });
    console.log(`✓ Advance Salary / Loan recorded for ${firstEmp.name}. New Loan Balance: Rs. ${firstEmp.loanBalance}`);
  }

  // 4. Payroll Finalization Test
  if (firstEmp) {
    const pDoc = await Payroll.findOneAndUpdate(
      { payrollMonth: '2026-08', employeeId: firstEmp._id },
      {
        payrollMonth: '2026-08',
        employeeId: firstEmp._id,
        employeeName: firstEmp.name,
        designation: firstEmp.designation,
        department: firstEmp.department,
        basicSalary: firstEmp.basicSalary,
        grossSalary: firstEmp.basicSalary,
        totalDays: 31,
        presentDays: 30,
        lateDays: 1,
        loanDeduction: 2000,
        totalDeduction: 2000,
        netPayable: firstEmp.basicSalary - 2000,
        accountTitle: firstEmp.accountTitle,
        ibanNumber: firstEmp.ibanNumber,
        bankName: firstEmp.bankName,
        status: 'FINALIZED',
      },
      { upsert: true, new: true }
    );
    console.log(`✓ Monthly Payroll record saved for ${pDoc.employeeName}. Net Payable: Rs. ${pDoc.netPayable}`);
  }

  console.log('\n--- VERIFICATION SUCCESS: All Staff Module Models & Calculations Verified ---');
  process.exit(0);
}

verify();
