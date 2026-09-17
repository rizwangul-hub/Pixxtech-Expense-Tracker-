import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import Account from '../models/Account.js';

dotenv.config();

const targetBalances = [
  { matchName: 'Bank Al Falah (Kamran Ijaz Sb)', balance: 8907740.18 },
  { matchName: 'UBL (Kamran Ijaz Sb)', balance: 48276.29 },
  { matchName: 'UBL (Uraan Ventures)', balance: 613113.79 },
  { matchName: 'ABL (Kamran Ijaz Sb)', balance: 1458786.16 },
  { matchName: 'ABL (Uraan Ventures)', balance: 1405494.36 },
  { matchName: 'Cash in Hand (Sarfaraz Sb)', balance: 1653.00 },
  { matchName: 'Cash in Hand (Malik Naveed)', balance: 0.00 },
  { matchName: 'Cash in Hand (Sabir Nawaz)', balance: 1024.00 },
  { matchName: 'Cash in Hand (Majid Javed)', balance: 617.00 },
  { matchName: 'External Parties / Operations Clearing', balance: 0.00 },
];

async function updateBalances() {
  await connectDB();
  console.log('\n======================================================');
  console.log(' UPDATING ACCOUNT OPENING & CURRENT BALANCES');
  console.log('======================================================\n');

  let grandTotal = 0;

  for (const item of targetBalances) {
    const account = await Account.findOne({ name: item.matchName });
    if (account) {
      account.openingBalance = item.balance;
      account.currentBalance = item.balance;
      await account.save();
      grandTotal += item.balance;
      console.log(`✓ Updated '${account.name}': Opening = Rs. ${item.balance.toLocaleString()} | Current = Rs. ${item.balance.toLocaleString()}`);
    } else {
      console.warn(`⚠️ Account not found: '${item.matchName}'`);
    }
  }

  console.log('\n======================================================');
  console.log(` GRAND TOTAL OPENING & CLOSING BALANCE: Rs. ${grandTotal.toLocaleString()}`);
  console.log('======================================================\n');

  process.exit(0);
}

updateBalances().catch((err) => {
  console.error('[Update Error]:', err);
  process.exit(1);
});
