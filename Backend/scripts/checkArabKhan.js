import 'dotenv/config';
import connectDB from '../config/db.js';
import Payroll from '../models/Payroll.js';
import Transaction from '../models/Transaction.js';

async function checkArab() {
  await connectDB();
  const payrolls = await Payroll.find({ employeeName: /Arab/i });
  console.log('Payroll records for Arab Khan:');
  console.log(JSON.stringify(payrolls, null, 2));

  const txs = await Transaction.find({ detail: /Arab/i });
  console.log('Transactions for Arab Khan:');
  console.log(JSON.stringify(txs, null, 2));
  process.exit(0);
}

checkArab();
