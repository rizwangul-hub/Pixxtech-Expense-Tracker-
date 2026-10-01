import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const Transaction = (await import('../models/Transaction.js')).default;
const Account = (await import('../models/Account.js')).default;
const Category = (await import('../models/Category.js')).default;
const Property = (await import('../models/Property.js')).default;
const PendingEntry = (await import('../models/PendingEntry.js')).default;
await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/expense_tracker');

const clearingAccs = await Account.find({ name: /Clearing|External Parties/i }).lean();
console.log('Clearing Accounts:', clearingAccs.map(a => ({ id: a._id, name: a.name })));
const clearingIds = clearingAccs.map(a => a._id);

const txsWithClearingDr = await Transaction.find({ drAccountId: { $in: clearingIds } })
  .populate('categoryId', 'name isMainHead parentCategoryId')
  .populate('propertyId', 'plazaName units')
  .populate('crAccountId', 'name')
  .lean();

const { resolveTransactionAccountDisplay } = await import('../services/ledgerService.js');

const clearingDrs = [];
for (const tx of txsWithClearingDr) {
  const disp = resolveTransactionAccountDisplay(tx);
  clearingDrs.push({ vn: tx.voucherNo, drRaw: tx.drAccountId?.name, drDisp: disp.dr, cat: tx.categoryId?.name, type: tx.transactionType });
}

console.log('Total transactions with Clearing in drRaw:', clearingDrs.length);
console.log('Sample drDisp:');
clearingDrs.slice(0, 25).forEach(c => console.log(`${c.vn} -> drRaw: "${c.drRaw}" | drDisp: "${c.drDisp}"`));

await mongoose.disconnect();
