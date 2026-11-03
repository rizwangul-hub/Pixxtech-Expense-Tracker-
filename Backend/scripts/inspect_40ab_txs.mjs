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
const Transaction = (await import('../models/Transaction.js')).default;

const txs = await Transaction.find({
  date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') },
  $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
})
  .populate('categoryId')
  .populate('propertyId')
  .lean();

console.log('--- ALL OCTOBER INCOME TRANSACTIONS ---');
const incomeTxs = txs.filter(t => t.transactionType === 'INCOME');
incomeTxs.forEach(t => {
  console.log(`[INCOME] VN: ${t.voucherNo} | Amt: ${t.amount} | Cat: ${t.categoryId?.name} | Prop: ${t.propertyId?.plazaName} | Detail: "${t.detail}" | ReceivedFrom: "${t.receivedFrom || ''}"`);
});

console.log('\n--- ALL OCTOBER EXPENSE TRANSACTIONS WITH 40AB / 48AB / G1-G6 / SHOP / METER / ADVENT / PARTNER ---');
const expenseTxs = txs.filter(t => t.transactionType === 'EXPENSE');
expenseTxs.forEach(t => {
  const text = `${t.voucherNo || ''} ${t.detail || ''} ${t.notes || ''} ${t.paidTo || ''} ${t.categoryId?.name || ''} ${t.propertyId?.plazaName || ''}`.toLowerCase();
  if (text.includes('40') || text.includes('48') || text.includes('g1') || text.includes('g2') || text.includes('g3') || text.includes('g4') || text.includes('g5') || text.includes('g6') || text.includes('shop') || text.includes('meter') || text.includes('partner') || text.includes('paint') || text.includes('saad') || text.includes('manzor') || text.includes('manzoor') || text.includes('token') || text.includes('cylinder') || text.includes('rishwat')) {
    console.log(`[EXPENSE] VN: ${t.voucherNo} | Amt: ${t.amount} | Cat: ${t.categoryId?.name} | Prop: ${t.propertyId?.plazaName} | Detail: "${t.detail}" | PaidTo: "${t.paidTo || ''}"`);
  }
});

process.exit(0);
