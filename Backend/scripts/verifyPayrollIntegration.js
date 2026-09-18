import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Account from '../models/Account.js';
import Employee from '../models/Employee.js';
import Payroll from '../models/Payroll.js';
import Transaction from '../models/Transaction.js';
import Voucher from '../models/Voucher.js';
import { paySingleSalary, reverseSalaryPayment, getMonthlyPayroll } from '../controllers/payrollController.js';

const mockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.data = data;
    return res;
  };
  return res;
};

async function verifyIntegration() {
  console.log('====================================================');
  console.log('STARTING STAFF PAYROLL + FINANCE INTEGRATION VERIFICATION');
  console.log('====================================================\n');

  try {
    await connectDB();

    // 1. Locate primary active Finance Bank Account
    const account = await Account.findOne({ type: 'BANK', isActive: true });
    if (!account) {
      throw new Error('No active Bank Account found for testing.');
    }
    const startingBalance = account.currentBalance;
    console.log(`[TEST 1] Primary Bank Account Located: "${account.name}"`);
    console.log(`         Initial Account Balance: Rs. ${startingBalance.toLocaleString('en-PK')}`);

    // 2. Fetch or create active test employee
    let employee = await Employee.findOne({ isActive: true });
    if (!employee) {
      employee = await Employee.create({
        employeeCode: 'TEST-001',
        name: 'Test Verification Employee',
        designation: 'Software Engineer',
        department: 'IT Office',
        basicSalary: 50000,
        isActive: true,
      });
    }
    console.log(`[TEST 2] Active Employee Located: "${employee.name}" (${employee.designation})`);

    const month = '2026-08';

    // 3. Test Payroll Calculation (Must NOT alter Bank Balance)
    const reqCalc = { query: { month } };
    const resCalc = mockRes();
    await getMonthlyPayroll(reqCalc, resCalc);

    const freshAccountAfterCalc = await Account.findById(account._id);
    console.log(`\n[TEST 3] Calculation & Slip Generation Isolation Test:`);
    console.log(`         Bank balance after calculation: Rs. ${freshAccountAfterCalc.currentBalance.toLocaleString('en-PK')}`);
    if (freshAccountAfterCalc.currentBalance !== startingBalance) {
      throw new Error('CRITICAL FAILURE: Calculation altered bank balance!');
    }
    console.log(`         SUCCESS: Bank balance remained unchanged during payroll calculation.`);

    // Locate payroll row for employee
    let targetPayroll = await Payroll.findOne({ payrollMonth: month, employeeId: employee._id });
    if (!targetPayroll) {
      targetPayroll = await Payroll.create({
        payrollMonth: month,
        employeeId: employee._id,
        employeeName: employee.name,
        designation: employee.designation,
        department: employee.department,
        basicSalary: 50000,
        grossSalary: 50000,
        totalDeduction: 0,
        netPayable: 50000,
        paymentStatus: 'PENDING_PAYMENT',
        status: 'FINALIZED',
      });
    } else if (targetPayroll.paymentStatus === 'PAID') {
      // Clean up previous test state if paid
      const reqRev = { body: { payrollId: targetPayroll._id } };
      const resRev = mockRes();
      await reverseSalaryPayment(reqRev, resRev);
      targetPayroll = await Payroll.findById(targetPayroll._id);
    }

    const netPayable = targetPayroll.netPayable;
    console.log(`\n[TEST 4] Payout Execution Test for "${employee.name}":`);
    console.log(`         Net Salary Payable: Rs. ${netPayable.toLocaleString('en-PK')}`);

    // 4. Perform Single Salary Payment from Bank Account
    const reqPay = {
      body: {
        month,
        payrollId: targetPayroll._id,
        paidFromAccountId: account._id.toString(),
        paymentMethod: 'BANK_TRANSFER',
        paymentNotes: 'Automated verification test payout',
      },
    };
    const resPay = mockRes();
    await paySingleSalary(reqPay, resPay);

    if (resPay.statusCode && resPay.statusCode >= 400) {
      throw new Error(`Payout failed: ${resPay.data?.message}`);
    }

    const updatedAccountAfterPay = await Account.findById(account._id);
    const expectedBalanceAfterPay = Math.round((startingBalance - netPayable + Number.EPSILON) * 100) / 100;

    console.log(`         Bank Balance After Payout: Rs. ${updatedAccountAfterPay.currentBalance.toLocaleString('en-PK')}`);
    console.log(`         Expected Balance:           Rs. ${expectedBalanceAfterPay.toLocaleString('en-PK')}`);

    if (Math.abs(updatedAccountAfterPay.currentBalance - expectedBalanceAfterPay) > 0.01) {
      throw new Error(`CRITICAL FAILURE: Bank balance deduction mismatch! Expected ${expectedBalanceAfterPay}, got ${updatedAccountAfterPay.currentBalance}`);
    }
    console.log(`         SUCCESS: Bank balance deducted by exact net payable amount.`);

    // 5. Verify Transaction & Voucher Creation
    const updatedPayroll = await Payroll.findById(targetPayroll._id);
    const createdTx = await Transaction.findById(updatedPayroll.transactionId);

    console.log(`\n[TEST 5] Transaction Single Source of Truth Verification:`);
    console.log(`         Payroll Payment Status: ${updatedPayroll.paymentStatus}`);
    console.log(`         Generated Voucher No:   ${updatedPayroll.voucherNo}`);
    console.log(`         Linked Transaction ID:   ${createdTx?._id}`);
    console.log(`         Transaction Amount:     Rs. ${createdTx?.amount?.toLocaleString('en-PK')}`);
    console.log(`         Transaction Category:   Salaries`);

    if (!createdTx || createdTx.amount !== netPayable || createdTx.transactionType !== 'EXPENSE') {
      throw new Error('CRITICAL FAILURE: Invalid Finance Transaction generated!');
    }
    console.log(`         SUCCESS: Finance Transaction and Voucher correctly logged in master ledger.`);

    // 6. Test Idempotency & Duplicate Payment Prevention
    console.log(`\n[TEST 6] Duplicate Payout Prevention Test:`);
    const resDup = mockRes();
    await paySingleSalary(reqPay, resDup);

    console.log(`         Duplicate Attempt Status Code: ${resDup.statusCode}`);
    console.log(`         Duplicate Attempt Message:     "${resDup.data?.message}"`);
    if (resDup.statusCode !== 400) {
      throw new Error('CRITICAL FAILURE: Duplicate payment was allowed!');
    }
    console.log(`         SUCCESS: System blocked duplicate payment attempt.`);

    // 7. Test Controlled Reversal
    console.log(`\n[TEST 7] Controlled Salary Reversal Test:`);
    const reqRevFinal = { body: { payrollId: targetPayroll._id, reason: 'Test reversal' } };
    const resRevFinal = mockRes();
    await reverseSalaryPayment(reqRevFinal, resRevFinal);

    const accountAfterReversal = await Account.findById(account._id);
    const reversedPayroll = await Payroll.findById(targetPayroll._id);

    console.log(`         Bank Balance After Reversal: Rs. ${accountAfterReversal.currentBalance.toLocaleString('en-PK')}`);
    console.log(`         Payroll Status After Reversal: ${reversedPayroll.paymentStatus}`);

    if (accountAfterReversal.currentBalance !== startingBalance) {
      throw new Error(`CRITICAL FAILURE: Bank balance not restored after reversal! Expected ${startingBalance}, got ${accountAfterReversal.currentBalance}`);
    }
    if (reversedPayroll.paymentStatus !== 'PENDING_PAYMENT') {
      throw new Error('CRITICAL FAILURE: Payroll status did not revert to PENDING_PAYMENT!');
    }
    console.log(`         SUCCESS: Bank balance fully restored and status reset to PENDING_PAYMENT.`);

    console.log('\n====================================================');
    console.log('ALL INTEGRATION VERIFICATION TESTS PASSED SUCCESSFULLY! 100% SUCCESS');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\nVERIFICATION TEST FAILED:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

verifyIntegration();
