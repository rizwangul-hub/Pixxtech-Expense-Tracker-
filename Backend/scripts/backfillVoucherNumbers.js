/**
 * backfillVoucherNumbers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot migration: assigns PT-XXX-MM-YY voucher numbers to every
 * PendingEntry that currently has an empty or missing voucherNo.
 *
 * Ordering: sorted by (date ASC, submittedAt ASC) — i.e. earliest transaction
 * date first, and for same-day entries creation time is the tiebreaker.
 *
 * Sequence numbers continue from the current maximum across all collections
 * (Voucher, Transaction, PendingEntry) so there are no collisions.
 *
 * Usage:
 *   node Backend/scripts/backfillVoucherNumbers.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import PendingEntry from '../models/PendingEntry.js';
import Transaction from '../models/Transaction.js';
import Voucher from '../models/Voucher.js';

// ── helpers ────────────────────────────────────────────────────────────────

const buildVoucherNo = (seq, date) => {
  const d = date ? new Date(date) : new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const padded = String(seq).padStart(3, '0');
  return `PT-${padded}-${mm}-${yy}`;
};

/** Returns the current max PT-sequence number across all three collections */
const getMaxSeq = async () => {
  const [vouchers, txs, pendings] = await Promise.all([
    Voucher.find({}, { voucherNumber: 1 }).lean().catch(() => []),
    Transaction.find({}, { voucherNo: 1 }).lean().catch(() => []),
    PendingEntry.find({}, { voucherNo: 1 }).lean().catch(() => []),
  ]);

  let max = 0;
  const extract = (vn) => {
    if (!vn || typeof vn !== 'string') return;
    const m = vn.trim().match(/^PT-(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  };

  vouchers.forEach((v) => extract(v.voucherNumber));
  txs.forEach((t) => extract(t.voucherNo));
  pendings.forEach((p) => extract(p.voucherNo));

  return max;
};

// ── main ───────────────────────────────────────────────────────────────────

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // 1. Find entries without a voucher number
  const missing = await PendingEntry.find({
    $or: [
      { voucherNo: { $exists: false } },
      { voucherNo: null },
      { voucherNo: '' },
    ],
  })
    .sort({ date: 1, submittedAt: 1, createdAt: 1 }) // date first, creation time tiebreaker
    .lean();

  console.log(`\n📋 Found ${missing.length} entries with no voucher number.\n`);

  if (missing.length === 0) {
    console.log('Nothing to do. Exiting.');
    await mongoose.disconnect();
    return;
  }

  // 2. Determine starting sequence
  let seq = await getMaxSeq();
  console.log(`🔢 Current max sequence: ${seq}. Will start assigning from ${seq + 1}.\n`);

  // 3. Assign voucher numbers
  const updates = [];
  for (const entry of missing) {
    seq += 1;
    const vn = buildVoucherNo(seq, entry.date || entry.submittedAt || entry.createdAt);
    updates.push({ id: entry._id, vn, date: entry.date, submittedAt: entry.submittedAt });
    console.log(
      `  ${String(seq).padStart(3, '0')}. [${entry.entryType}] ${
        (entry.date ? new Date(entry.date).toISOString().slice(0, 10) : '?')
      }  →  ${vn}   (${entry.detail?.slice(0, 40) || 'no detail'})`
    );
  }

  // 4. Bulk-write to database
  console.log('\n💾 Writing to database...');
  const bulkOps = updates.map(({ id, vn }) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { voucherNo: vn } },
    },
  }));

  const result = await PendingEntry.bulkWrite(bulkOps, { ordered: true });
  console.log(`\n✅ Done. ${result.modifiedCount} entries updated.`);

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB.\n');
};

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
