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

// Function to test if a transaction belongs to 40-AB / 48-AB
function is40ABTransaction(tx) {
  const catName = (tx.categoryId?.name || '').toLowerCase();
  const detail = (tx.detail || '').toLowerCase();
  const notes = (tx.notes || '').toLowerCase();
  const propName = (tx.propertyId?.plazaName || '').toLowerCase();
  const text = `${catName} ${detail} ${notes} ${propName}`;

  // Patterns for 40-AB / 48-AB:
  // 1. Explicit 40-AB or 48-AB or 40AB or 48AB
  if (/40\s*[-_]?\s*ab/i.test(text) || /48\s*[-_]?\s*ab/i.test(text)) return true;

  // 2. Shops G1 to G6 (e.g. G1 shop, G2 shop, G3 shop, G4 shop, G5 shop, G6 shop, G2, G3 & G5, etc.)
  if (/\bg[1-6]\b/i.test(text) || /\bg-[1-6]\b/i.test(text) || /shop\s*shutter/i.test(text) || /sanitary.*shop/i.test(text)) return true;

  // 3. Saad Manzoor (Saad Manzor / residential flat rent 40AB)
  if (text.includes('saad manzoor') || text.includes('saad manzor')) return true;

  // 4. Partners of 40AB: Rana Muhammad Zeeshan, Adnan Saleem
  if (text.includes('rana muhammad zeeshan') || text.includes('adnan saleem')) return true;

  // 5. Specific categories created for 40AB shops:
  // "G3 Shop", "G1 Shop", "G4 Shop", "G3 shop", "G3 Meter Charges", "G5 Shop Meter charges", "Repair Shutter 40AB Shop", "Sanitary Material 40AB Shop"
  if (catName.includes('g1') || catName.includes('g2') || catName.includes('g3') || catName.includes('g4') || catName.includes('g5') || catName.includes('g6')) return true;

  return false;
}

console.log('--- MATCHED 40-AB TRANSACTIONS IN OCTOBER ---');
let total40ABIn = 0;
let total40ABOut = 0;

txs.forEach(t => {
  if (is40ABTransaction(t)) {
    const isIncome = t.transactionType === 'INCOME';
    const isExpense = t.transactionType === 'EXPENSE';
    if (isIncome) total40ABIn += t.amount;
    if (isExpense) total40ABOut += t.amount;
    console.log(`${(t.transactionType || '').padEnd(8)} | VN: ${t.voucherNo?.padEnd(14)} | Amt: ${String(t.amount).padEnd(8)} | Dr: ${(t.drAccountId?.name || '').padEnd(25)} | Cr: ${(t.crAccountId?.name || '').padEnd(25)} | Cat: ${(t.categoryId?.name || '').padEnd(25)} | Det: "${t.detail}"`);
  }
});

console.log('\nTotal 40-AB Income:', total40ABIn);
console.log('Total 40-AB Expense:', total40ABOut);

process.exit(0);
