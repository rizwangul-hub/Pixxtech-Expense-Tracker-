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

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const txs = await Transaction.find({}).sort({ date: 1, createdAt: 1 }).lean();
  const vouchers = await Voucher.find({}).sort({ voucherDate: 1, createdAt: 1 }).lean();
  const pendings = await PendingEntry.find({}).sort({ date: 1, submittedAt: 1 }).lean();

  console.log(`Total Transactions: ${txs.length}`);
  console.log(`Total Vouchers: ${vouchers.length}`);
  console.log(`Total Pending Entries: ${pendings.length}`);

  console.log('\n--- Transactions ---');
  txs.forEach((t, idx) => {
    console.log(`${idx + 1}. ID: ${t._id}, date: ${t.date?.toISOString().split('T')[0]}, voucherNo: '${t.voucherNo}', detail: '${t.detail?.slice(0, 30)}'`);
  });

  console.log('\n--- Vouchers ---');
  vouchers.forEach((v, idx) => {
    console.log(`${idx + 1}. ID: ${v._id}, voucherNumber: '${v.voucherNumber}'`);
  });

  console.log('\n--- Pending Entries ---');
  pendings.forEach((p, idx) => {
    console.log(`${idx + 1}. ID: ${p._id}, date: ${p.date?.toISOString().split('T')[0]}, voucherNo: '${p.voucherNo}', detail: '${p.detail?.slice(0, 30)}'`);
  });

  await mongoose.disconnect();
}

check().catch(console.error);
