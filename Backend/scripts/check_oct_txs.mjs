import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const Property = (await import('../models/Property.js')).default;
const Category = (await import('../models/Category.js')).default;
const Account = (await import('../models/Account.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;

const txs = await Transaction.find({
  date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') },
  $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
})
  .populate('categoryId')
  .populate('drAccountId')
  .populate('crAccountId')
  .populate('propertyId')
  .lean();

console.log('Total October transactions:', txs.length);

const keywords = ['40', '48', 'ab', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'token', 'saad', 'manzoor', 'manzor', 'security'];

const matched = txs.filter(t => {
  const str = `${t.voucherNo || ''} ${t.detail || ''} ${t.notes || ''} ${t.receivedFrom || ''} ${t.paidTo || ''} ${t.propertyId?.plazaName || ''} ${t.categoryId?.name || ''}`.toLowerCase();
  return keywords.some(k => str.includes(k));
});

console.log(`Matched ${matched.length} transactions with keywords:`);
matched.forEach(t => {
  console.log({
    vn: t.voucherNo,
    type: t.transactionType,
    repCat: t.reportCategory,
    detail: t.detail,
    amount: t.amount,
    dr: t.drAccountId?.name,
    cr: t.crAccountId?.name,
    cat: t.categoryId?.name,
    prop: t.propertyId?.plazaName
  });
});

process.exit(0);
