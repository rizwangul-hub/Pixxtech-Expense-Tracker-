import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Account from '../models/Account.js';

async function verify() {
  await connectDB();
  console.log('\n--- VERIFYING ACCOUNT CLOSING BALANCES ---');

  const accounts = await Account.find({ isActive: true, isClearing: { $ne: true } }).sort({ type: 1, name: 1 }).lean();

  let grandOpening = 0;
  let grandClosing = 0;

  for (const acc of accounts) {
    const opening = acc.openingBalance || 0;
    const closing = acc.currentBalance || 0;
    grandOpening += opening;
    grandClosing += closing;

    console.log(`- ${acc.name.padEnd(32)} | Opening: Rs. ${opening.toLocaleString('en-PK').padStart(14)} | Closing: Rs. ${closing.toLocaleString('en-PK').padStart(14)}`);
  }

  console.log('-----------------------------------------------------------------------------');
  console.log(`GRAND TOTAL OPENING BALANCE: Rs. ${grandOpening.toLocaleString('en-PK')}`);
  console.log(`GRAND TOTAL CLOSING BALANCE: Rs. ${grandClosing.toLocaleString('en-PK')}`);

  if (Math.abs(grandClosing - 12436704.78) < 0.01) {
    console.log('\n✓ SUCCESS: Grand Total Closing Balance matches exact report amount of Rs. 12,436,704.78!');
  } else {
    console.error(`\nX MISMATCH: Expected Rs. 12,436,704.78, but got Rs. ${grandClosing}`);
  }

  process.exit(0);
}

verify();
