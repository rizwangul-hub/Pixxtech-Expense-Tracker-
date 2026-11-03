import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const Transaction = (await import('../models/Transaction.js')).default;
const Account = (await import('../models/Account.js')).default;
const Category = (await import('../models/Category.js')).default;

const ubl = await Account.findOne({ name: 'UBL (Uraan Ventures)' });
const txs = await Transaction.find({
  date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') },
  drAccountId: ubl._id,
  $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
}).populate('categoryId').lean();

console.log('UBL debits (Inflow):');
let total = 0;
txs.forEach(t => {
  console.log(`VN: ${t.voucherNo} | amt: ${t.amount} | cat: ${t.categoryId?.name} | detail: "${t.detail}"`);
  total += t.amount;
});
console.log('Total UBL debits:', total);

process.exit(0);
