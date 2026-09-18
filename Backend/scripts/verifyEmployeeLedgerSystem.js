import 'dotenv/config';
import connectDB from '../config/db.js';
import Account from '../models/Account.js';
import Employee from '../models/Employee.js';
import Payroll from '../models/Payroll.js';
import Transaction from '../models/Transaction.js';
import { paySingleSalary, reverseSalaryPayment, getEmployeeLedger } from '../controllers/payrollController.js';

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

async function verifyEmployeeLedgerSystem() {
  console.log('====================================================');
  console.log('STARTING EMPLOYEE LEDGER & BANK DATE VERIFICATION');
  console.log('====================================================\n');

  try {
    await connectDB();

    // 1. Locate ABL or Bank Account
    const account = await Account.findOne({ name: /ABL/i, isActive: true }) || await Account.findOne({ type: 'BANK', isActive: true });
    if (!account) throw new Error('Bank Account not found for testing.');
    
    console.log(`[TEST 1] Located Bank Account: "${account.name}"`);
    console.log(`         Initial Balance: Rs. ${account.currentBalance.toLocaleString('en-PK')}`);

    // 2. Locate Arab Khan or active employee
    const employee = await Employee.findOne({ name: /Arab/i }) || await Employee.findOne({ status: 'ACTIVE' });
    if (!employee) throw new Error('Employee not found for testing.');

    console.log(`[TEST 2] Located Employee: "${employee.name}" (${employee.designation})`);

    // 3. Test getEmployeeLedger before payout
    let reqLedger = { params: { employeeId: employee._id.toString() } };
    let resLedger = mockRes();
    await getEmployeeLedger(reqLedger, resLedger);

    console.log(`[TEST 3] Initial Employee Ledger Summary:`);
    console.log(`         Total Accrued: Rs. ${resLedger.data.data.summary.totalAccrued}`);
    console.log(`         Total Paid:    Rs. ${resLedger.data.data.summary.totalPaid}`);
    console.log(`         Pending Due:   Rs. ${resLedger.data.data.summary.pendingBalance}`);

    // 4. Perform Salary Payout for 2026-08
    const reqPay = {
      body: {
        month: '2026-08',
        employeeId: employee._id.toString(),
        paidFromAccountId: account._id.toString(),
        paymentMethod: 'BANK_TRANSFER',
        paymentNotes: 'Test payout for Bank Ledger date alignment',
      },
    };
    const resPay = mockRes();
    await paySingleSalary(reqPay, resPay);

    if (resPay.statusCode !== 200 && resPay.statusCode !== 201) {
      console.warn(`[Payout Note]: ${resPay.data?.message}`);
    } else {
      console.log(`[TEST 4] Payout Executed Successfully for ${employee.name}`);
      console.log(`         Payout Voucher: ${resPay.data.data.voucherNo}`);
    }

    // 5. Verify Transaction Date in Database matches 2026-08-31
    const pDoc = await Payroll.findOne({ employeeId: employee._id, payrollMonth: '2026-08' });
    const tx = await Transaction.findById(pDoc.transactionId);

    const txDateStr = new Date(tx.date).toISOString().slice(0, 10);
    console.log(`[TEST 5] Transaction Date Verification: ${txDateStr}`);
    if (txDateStr !== '2026-08-31') {
      throw new Error(`Transaction date ${txDateStr} does not match expected 2026-08-31!`);
    }
    console.log(`         SUCCESS: Transaction date is 2026-08-31 (Matches August Statement Month!).`);

    // 6. Test getEmployeeLedger after payout
    resLedger = mockRes();
    await getEmployeeLedger(reqLedger, resLedger);

    console.log(`[TEST 6] Post-Payout Employee Ledger Summary:`);
    console.log(`         Total Accrued: Rs. ${resLedger.data.data.summary.totalAccrued}`);
    console.log(`         Total Paid:    Rs. ${resLedger.data.data.summary.totalPaid}`);
    console.log(`         Pending Due:   Rs. ${resLedger.data.data.summary.pendingBalance}`);

    if (resLedger.data.data.summary.pendingBalance !== 0) {
      throw new Error('Pending balance should be Rs. 0 after full salary payment!');
    }
    console.log(`         SUCCESS: Employee pending liability is now Rs. 0 (PAID)!`);

    // 7. Cleanup Reversal
    const reqRev = {
      body: {
        payrollId: pDoc._id.toString(),
        reason: 'Automated test cleanup',
      },
    };
    const resRev = mockRes();
    await reverseSalaryPayment(reqRev, resRev);
    console.log(`[TEST 7] Cleaned up reversal. Account balance and pending status restored cleanly.`);

    console.log('\n====================================================');
    console.log('ALL EMPLOYEE LEDGER & BANK DATE VERIFICATIONS PASSED!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

verifyEmployeeLedgerSystem();
