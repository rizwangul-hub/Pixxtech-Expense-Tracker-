import 'dotenv/config';
import connectDB from '../config/db.js';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';

async function debugABL() {
  await connectDB();
  const abl = await Account.findOne({ name: /ABL/i });
  console.log('ABL Account Doc:', abl);

  if (abl) {
    const txs = await Transaction.find({
      $or: [{ drAccountId: abl._id }, { crAccountId: abl._id }],
    }).lean();
    console.log(`Found ${txs.length} transactions for ABL:`);
    console.log(JSON.stringify(txs, null, 2));
  }
  process.exit(0);
}

debugABL();
