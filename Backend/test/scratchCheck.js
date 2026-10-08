import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import { buildEvidenceDataForEntry, sortTransactionsByVoucher } from '../services/pdfReportService.js';

async function checkMonth(month) {
  const [year, m] = month.split('-').map(Number);
  const mStart = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
  const mEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

  const vouchersMap = new Map();

  // 1. PendingEntry
  const pEntries = await PendingEntry.find({
    $or: [
      { date: { $gte: mStart, $lte: mEnd } },
      { rentMonth: month },
      { 'entryData.month': month },
      { submittedAt: { $gte: mStart, $lte: mEnd } }
    ]
  })
  .populate('propertyId tenantId categoryId drAccountId crAccountId receivingAccountId submittedBy verifiedBy')
  .lean();

  for (const pe of pEntries) {
    const vData = buildEvidenceDataForEntry(pe);
    if (vData && vData.voucherNo) {
      vouchersMap.set(vData.voucherNo, vData);
    }
  }

  // 2. Transaction
  const txs = await Transaction.find({
    date: { $gte: mStart, $lte: mEnd },
    $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
  })
  .populate('propertyId tenantId categoryId drAccountId crAccountId createdBy')
  .lean();

  for (const tx of txs) {
    const vData = buildEvidenceDataForEntry(tx);
    if (vData && vData.voucherNo) {
      vouchersMap.set(vData.voucherNo, vData);
    }
  }

  const allVouchers = sortTransactionsByVoucher(Array.from(vouchersMap.values()));
  console.log(`Month: ${month} -> Total unique vouchers found: ${allVouchers.length}`);
  if (allVouchers.length > 0) {
    console.log(`  First 3: ${allVouchers.slice(0, 3).map(v => v.voucherNo).join(', ')}`);
    console.log(`  Last 3: ${allVouchers.slice(-3).map(v => v.voucherNo).join(', ')}`);
  }
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await checkMonth('2026-09');
  await checkMonth('2026-10');
  await mongoose.disconnect();
}

run().catch(console.error);
