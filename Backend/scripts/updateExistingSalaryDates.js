import 'dotenv/config';
import connectDB from '../config/db.js';
import Transaction from '../models/Transaction.js';
import Payroll from '../models/Payroll.js';
import Voucher from '../models/Voucher.js';

async function updateSalaryDates() {
  await connectDB();
  console.log('--- Updating Existing Salary Payout Dates to Match Payroll Month ---');

  // Find all Payroll records for 2026-08 marked as PAID
  const paidPayrolls = await Payroll.find({ payrollMonth: '2026-08', paymentStatus: 'PAID' });
  console.log(`Found ${paidPayrolls.length} PAID payroll records for 2026-08.`);

  const targetDate = new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999)); // 2026-08-31

  for (const p of paidPayrolls) {
    p.paymentDate = targetDate;
    p.paidDate = targetDate;
    await p.save();

    if (p.transactionId) {
      const tx = await Transaction.findById(p.transactionId);
      if (tx) {
        tx.date = targetDate;
        // If status was mistakenly set to REVERSED during test, reset it if payroll is active PAID
        if (tx.status === 'REVERSED') {
          tx.status = 'POSTED';
        }
        await tx.save();
        console.log(`Updated Transaction ${tx.voucherNo} (${p.employeeName}) date to 2026-08-31.`);
      }

      if (p.voucherId) {
        const v = await Voucher.findById(p.voucherId);
        if (v) {
          v.voucherDate = targetDate;
          if (v.status === 'REVERSED') {
            v.status = 'POSTED';
          }
          await v.save();
        }
      }
    }
  }

  console.log('--- Completed Salary Dates Alignment ---');
  process.exit(0);
}

updateSalaryDates();
