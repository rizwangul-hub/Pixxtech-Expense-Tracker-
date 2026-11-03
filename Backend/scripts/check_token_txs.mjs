import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const Transaction = (await import('../models/Transaction.js')).default;
const PendingEntry = (await import('../models/PendingEntry.js')).default;

const allTxs = await Transaction.find({
  $or: [
    { detail: /token/i },
    { notes: /token/i }
  ]
}).lean();
console.log('Transactions with token:', allTxs.length);
allTxs.forEach(t => console.log(t.voucherNo, t.date, t.amount, t.detail));

const pendings = await PendingEntry.find({
  $or: [
    { detail: /token/i },
    { 'entryData.detail': /token/i }
  ]
}).lean();
console.log('Pending entries with token:', pendings.length);
pendings.forEach(p => console.log(p.voucherNo, p.date, p.amount, p.detail));

process.exit(0);
