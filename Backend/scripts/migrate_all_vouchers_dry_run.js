import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Transaction from '../models/Transaction.js';
import Voucher from '../models/Voucher.js';
import PendingEntry from '../models/PendingEntry.js';
import RentReceived from '../models/RentReceived.js';

async function dryRun() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const txs = await Transaction.find({}).sort({ date: 1, createdAt: 1 }).lean();
  const pendings = await PendingEntry.find({}).sort({ date: 1, submittedAt: 1 }).lean();
  const vouchers = await Voucher.find({}).sort({ voucherDate: 1, createdAt: 1 }).lean();

  // Map to hold entry units
  // Pending entries that are already posted will match a Transaction via postedTransactionId
  const postedTxIds = new Set(pendings.map(p => p.postedTransactionId?.toString()).filter(Boolean));

  // Collect all distinct operational entries
  const allItems = [];

  // Add pending entries (not yet posted)
  for (const p of pendings) {
    if (!p.postedTransactionId) {
      allItems.push({
        type: 'PENDING',
        date: p.date || p.submittedAt || new Date(),
        createdAt: p.createdAt || p.submittedAt || new Date(),
        id: p._id,
        item: p,
      });
    }
  }

  // Add posted transactions
  for (const t of txs) {
    allItems.push({
      type: 'TRANSACTION',
      date: t.date || t.createdAt || new Date(),
      createdAt: t.createdAt || new Date(),
      id: t._id,
      item: t,
    });
  }

  // Sort chronologically by date, then createdAt
  allItems.sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  console.log(`\nFound ${allItems.length} total distinct entries to re-sequence.\n`);

  allItems.forEach((entry, idx) => {
    const seq = idx + 1;
    const d = new Date(entry.date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const newVn = `PT-${String(seq).padStart(3, '0')}-${mm}-${yy}`;

    const oldVn = entry.item.voucherNo || entry.item.voucherNumber || '(none)';
    const detail = (entry.item.detail || entry.item.description || '').slice(0, 35);
    console.log(`[${seq.toString().padStart(2, ' ')}] ${entry.type.padEnd(11)} Date: ${d.toISOString().split('T')[0]} | Old VN: ${oldVn.padEnd(18)} -> New VN: ${newVn} | Detail: ${detail}`);
  });

  await mongoose.disconnect();
}

dryRun().catch(console.error);
