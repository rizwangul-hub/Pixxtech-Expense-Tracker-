import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const Transaction = (await import('../models/Transaction.js')).default;
const Property = (await import('../models/Property.js')).default;
const Category = (await import('../models/Category.js')).default;
const Account = (await import('../models/Account.js')).default;

const txs = await Transaction.find({
  date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') },
  $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
})
  .populate('categoryId')
  .populate('drAccountId')
  .populate('crAccountId')
  .populate('propertyId')
  .lean();

console.log('--- ALL OCTOBER INFLOW TRANSACTIONS ---');
txs.filter(t => t.drAccountId && t.transactionType !== 'TRANSFER').forEach(t => {
  console.log(`[INFLOW] Dr: ${t.drAccountId.name.padEnd(25)} | Amt: ${String(t.amount).padEnd(8)} | Cat: ${(t.categoryId?.name || '').padEnd(20)} | Prop: ${(t.propertyId?.plazaName || '').padEnd(20)} | Det: "${t.detail}"`);
});

console.log('\n--- ALL OCTOBER OUTFLOW TRANSACTIONS ---');
txs.filter(t => t.crAccountId && t.transactionType === 'EXPENSE').forEach(t => {
  console.log(`[OUTFLOW] Cr: ${t.crAccountId.name.padEnd(25)} | Amt: ${String(t.amount).padEnd(8)} | Cat: ${(t.categoryId?.name || '').padEnd(25)} | Prop: ${(t.propertyId?.plazaName || '').padEnd(20)} | Det: "${t.detail}"`);
});

process.exit(0);
