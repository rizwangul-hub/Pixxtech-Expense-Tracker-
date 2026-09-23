import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Account from './models/Account.js';
import Transaction from './models/Transaction.js';
import Voucher from './models/Voucher.js';

dotenv.config();

async function run() {
  await connectDB();
  console.log('Connected to DB');

  const accs = await Account.find({ name: /Al Falah|Kamran/i }).lean();
  console.log('Accounts:', JSON.stringify(accs.map(a => ({
    id: a._id,
    name: a.name,
    openingBalance: a.openingBalance,
    currentBalance: a.currentBalance,
    openingBalanceDate: a.openingBalanceDate
  })), null, 2));

  const accounts = await Account.find({}).sort({ type: 1, name: 1 }).lean();
  const activeTransactions = await Transaction.find({ status: { $ne: 'REVERSED' } })
    .select('drAccountId crAccountId amount')
    .lean();
  const netMovementByAccount = new Map();
  activeTransactions.forEach((tx) => {
    const amount = Number(tx.amount) || 0;
    const drId = tx.drAccountId?.toString();
    const crId = tx.crAccountId?.toString();
    if (drId) netMovementByAccount.set(drId, (netMovementByAccount.get(drId) || 0) + amount);
    if (crId) netMovementByAccount.set(crId, (netMovementByAccount.get(crId) || 0) - amount);
  });

  console.log('\n--- ACCOUNTS AS RETURNED BY getAccounts ---');
  for (const acc of accounts) {
    const liveBal = (acc.openingBalance || 0) + (netMovementByAccount.get(acc._id.toString()) || 0);
    console.log(`${acc.name} (${acc.type}):`);
    console.log(`   openingBalance: ${acc.openingBalance}`);
    console.log(`   currentBalance (in DB): ${acc.currentBalance}`);
    console.log(`   liveBalance (computed): ${liveBal}`);
    console.log(`   netMovement: ${netMovementByAccount.get(acc._id.toString()) || 0}`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
