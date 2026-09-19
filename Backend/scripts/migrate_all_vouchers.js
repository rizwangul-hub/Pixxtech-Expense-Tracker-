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
import Payroll from '../models/Payroll.js';
import OtherIncome from '../models/OtherIncome.js';

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB for Voucher Migration...');

  const txs = await Transaction.find({}).sort({ date: 1, createdAt: 1 });
  const pendings = await PendingEntry.find({}).sort({ date: 1, submittedAt: 1 });

  // Map to hold entries
  const allItems = [];

  // Add pending entries (not yet posted)
  for (const p of pendings) {
    if (!p.postedTransactionId) {
      allItems.push({
        type: 'PENDING',
        date: p.date || p.submittedAt || new Date(),
        createdAt: p.createdAt || p.submittedAt || new Date(),
        doc: p,
      });
    }
  }

  // Add posted transactions
  for (const t of txs) {
    allItems.push({
      type: 'TRANSACTION',
      date: t.date || t.createdAt || new Date(),
      createdAt: t.createdAt || new Date(),
      doc: t,
    });
  }

  // Sort chronologically by date ascending, then createdAt ascending
  allItems.sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  console.log(`Starting migration for ${allItems.length} total entries...\n`);

  let count = 0;
  for (let idx = 0; idx < allItems.length; idx++) {
    const item = allItems[idx];
    const seq = idx + 1;
    const d = new Date(item.date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const newVn = `PT-${String(seq).padStart(3, '0')}-${mm}-${yy}`;

    if (item.type === 'PENDING') {
      const pDoc = item.doc;
      const oldVn = pDoc.voucherNo || '(none)';
      pDoc.voucherNo = newVn;
      await pDoc.save();
      console.log(`Updated PendingEntry [${seq}] Old: ${oldVn} -> New: ${newVn}`);
      count++;
    } else if (item.type === 'TRANSACTION') {
      const txDoc = item.doc;
      const oldVn = txDoc.voucherNo;

      // Update transaction
      txDoc.voucherNo = newVn;
      await txDoc.save();

      // Update linked Voucher header if exists
      if (txDoc.voucherId) {
        await Voucher.findByIdAndUpdate(txDoc.voucherId, { voucherNumber: newVn });
      } else {
        await Voucher.updateMany({ voucherNumber: oldVn }, { voucherNumber: newVn });
      }

      // Update linked PendingEntry if exists
      await PendingEntry.updateMany({ postedTransactionId: txDoc._id }, { voucherNo: newVn });

      // Update linked Payroll if exists
      await Payroll.updateMany({ voucherNo: oldVn }, { voucherNo: newVn });

      // Update linked OtherIncome if exists
      await OtherIncome.updateMany({ voucherNo: oldVn }, { voucherNo: newVn });

      console.log(`Updated Transaction & Linked Docs [${seq}] Old: ${oldVn} -> New: ${newVn}`);
      count++;
    }
  }

  console.log(`\n✅ Migration Complete! Successfully updated ${count} voucher numbers to format PT-000-MM-YY.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
