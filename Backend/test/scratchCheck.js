import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Category from '../models/Category.js';
import Account from '../models/Account.js';
import { generateBulkReceiptEvidencePDF, buildEvidenceDataForEntry, sortTransactionsByVoucher } from '../services/pdfReportService.js';

async function testPdfGeneration() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const [year, m] = '2026-09'.split('-').map(Number);
  const mStart = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
  const mEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

  const vouchersMap = new Map();

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

  const vouchers = sortTransactionsByVoucher(Array.from(vouchersMap.values()));
  console.log(`Found ${vouchers.length} vouchers for September 2026.`);
  console.log('Generating bulk PDF with pre-fetched base64 images...');

  const t0 = Date.now();
  const pdfBuf = await generateBulkReceiptEvidencePDF(vouchers, '2026-09');
  const elapsed = Date.now() - t0;

  console.log(`SUCCESS! Generated PDF buffer size: ${pdfBuf.length} bytes in ${elapsed}ms (${(elapsed/1000).toFixed(1)}s)`);

  await mongoose.disconnect();
}

testPdfGeneration().then(() => process.exit(0)).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
