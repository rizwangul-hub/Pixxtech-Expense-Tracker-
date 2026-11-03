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

export function is40ABTransaction(tx) {
  if (!tx) return false;
  const catName = (tx.categoryId?.name || '').toLowerCase();
  const detail = (tx.detail || '').toLowerCase();
  const notes = (tx.notes || '').toLowerCase();
  const propName = (tx.propertyId?.plazaName || '').toLowerCase();
  const text = `${catName} ${detail} ${notes} ${propName}`;

  // 1. Explicit 40-AB or 48-AB
  if (/(?:40|48)\s*[-_]?\s*ab\b/i.test(text)) return true;

  // 2. Shops G1 to G6
  if (/\bg[1-6]\b/i.test(text) || /\bg-[1-6]\b/i.test(text) || /\bshop\b/i.test(catName)) return true;

  // 3. Saad Manzoor / Saad Manzor
  if (text.includes('saad manzoor') || text.includes('saad manzor')) return true;

  // 4. 40AB Partners: Rana Muhammad Zeeshan, Adnan Saleem
  if (text.includes('rana muhammad zeeshan') || text.includes('adnan saleem')) return true;

  // 5. Specific categories
  if (catName.includes('g1') || catName.includes('g2') || catName.includes('g3') || catName.includes('g4') || catName.includes('g5') || catName.includes('g6')) return true;

  return false;
}

// Check if any matched transaction belongs to another plaza (like 289-Q, 299-Q, 4-C Bahria, 48-CCA, Anarkali, Rizwan Abuzar)
console.log('--- Checking for plaza conflicts ---');
txs.forEach(t => {
  if (is40ABTransaction(t)) {
    if (t.propertyId && t.propertyId.plazaName && !t.propertyId.plazaName.includes('40')) {
      console.log(`[WARNING CONFLICT]: Plaza: "${t.propertyId.plazaName}" | Detail: "${t.detail}" | Cat: "${t.categoryId?.name}"`);
    }
  }
});

process.exit(0);
