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
const { round2 } = await import('../services/ledgerService.js');
const { getUtcMonthDateRange } = await import('../services/salaryReportingService.js');
const { isOwnerPersonalTransaction } = await import('../services/expenseClassificationService.js');

function is40ABTransaction(tx) {
  const catName = (tx.categoryId?.name || '').toLowerCase();
  const detail = (tx.detail || '').toLowerCase();
  const notes = (tx.notes || '').toLowerCase();
  const propName = (tx.propertyId?.plazaName || '').toLowerCase();
  const text = `${catName} ${detail} ${notes} ${propName}`;

  if (/40\s*[-_]?\s*ab/i.test(text) || /48\s*[-_]?\s*ab/i.test(text)) return true;
  if (/\bg[1-6]\b/i.test(text) || /\bg-[1-6]\b/i.test(text) || /shop\s*shutter/i.test(text) || /sanitary.*shop/i.test(text)) return true;
  if (text.includes('saad manzoor') || text.includes('saad manzor')) return true;
  if (text.includes('rana muhammad zeeshan') || text.includes('adnan saleem')) return true;
  if (catName.includes('g1') || catName.includes('g2') || catName.includes('g3') || catName.includes('g4') || catName.includes('g5') || catName.includes('g6')) return true;

  return false;
}

const { startDate: startOfMonth, endDate: endOfMonth } = getUtcMonthDateRange(2026, 10);

const accounts = await Account.find({ isActive: true, isClearing: { $ne: true } })
  .sort({ type: 1, name: 1 })
  .lean();

const priorTransactions = await Transaction.find({
  date: { $lt: startOfMonth },
  $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
}).lean();

const priorMovements = new Map();
for (const acc of accounts) {
  priorMovements.set(acc._id.toString(), { debits: 0, credits: 0 });
}

for (const tx of priorTransactions) {
  const drId = tx.drAccountId?.toString();
  const crId = tx.crAccountId?.toString();
  if (priorMovements.has(drId)) priorMovements.get(drId).debits += tx.amount;
  if (priorMovements.has(crId)) priorMovements.get(crId).credits += tx.amount;
}

const monthTransactions = await Transaction.find({
  date: { $gte: startOfMonth, $lte: endOfMonth },
  $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
})
  .populate('categoryId')
  .populate('propertyId')
  .lean();

const rows = [];
const grandTotal = {
  openingBalance: 0,
  rentalIncome: 0,
  input40AB: 0,
  otherInput: 0,
  totalInput: 0,
  rentalExpenses: 0,
  expense40AB: 0,
  otherExpenses: 0,
  totalOutput: 0,
  closingBalance: 0,
};

for (const account of accounts) {
  const accId = account._id.toString();
  const prior = priorMovements.get(accId) || { debits: 0, credits: 0 };
  const openingBalance = round2(account.openingBalance + prior.debits - prior.credits);

  let rentalIncome = 0;
  let input40AB = 0;
  let otherInput = 0;
  let rentalExpenses = 0;
  let expense40AB = 0;
  let otherExpenses = 0;
  let transferOut = 0;

  for (const tx of monthTransactions) {
    const isDr = tx.drAccountId?.toString() === accId;
    const isCr = tx.crAccountId?.toString() === accId;
    const cat = tx.categoryId;
    const isRentalCat = cat?.isRentalHead || cat?.name === 'Rental Income';
    const isPropertyTied = !!tx.propertyId;
    const is40AB = is40ABTransaction(tx);

    if (isDr) {
      if (is40AB) {
        input40AB += tx.amount;
      } else if (isRentalCat || isPropertyTied) {
        rentalIncome += tx.amount;
      } else {
        otherInput += tx.amount;
      }
    }

    if (isCr) {
      if (tx.transactionType === 'EXPENSE') {
        if (is40AB) {
          expense40AB += tx.amount;
        } else {
          const isOwnerPersonal =
            tx.sourceModule === 'OWNER_PERSONAL' ||
            tx.reportCategory === 'Owner Personal' ||
            isOwnerPersonalTransaction(tx);
          if (isOwnerPersonal) {
            otherExpenses += tx.amount;
          } else {
            rentalExpenses += tx.amount;
          }
        }
      } else {
        transferOut += tx.amount;
      }
    }
  }

  rentalIncome = round2(rentalIncome);
  input40AB = round2(input40AB);
  otherInput = round2(otherInput);
  const totalInput = round2(rentalIncome + input40AB + otherInput);

  rentalExpenses = round2(rentalExpenses);
  expense40AB = round2(expense40AB);
  otherExpenses = round2(otherExpenses);
  transferOut = round2(transferOut);
  const totalOutput = round2(rentalExpenses + expense40AB + otherExpenses + transferOut);
  const closingBalance = round2(openingBalance + totalInput - totalOutput);

  rows.push({
    name: account.name,
    openingBalance,
    rentalIncome,
    input40AB,
    otherInput,
    totalInput,
    rentalExpenses,
    expense40AB,
    otherExpenses,
    totalOutput,
    closingBalance,
  });

  grandTotal.openingBalance += openingBalance;
  grandTotal.rentalIncome += rentalIncome;
  grandTotal.input40AB += input40AB;
  grandTotal.otherInput += otherInput;
  grandTotal.totalInput += totalInput;
  grandTotal.rentalExpenses += rentalExpenses;
  grandTotal.expense40AB += expense40AB;
  grandTotal.otherExpenses += otherExpenses;
  grandTotal.totalOutput += totalOutput;
  grandTotal.closingBalance += closingBalance;
}

for (const k of Object.keys(grandTotal)) grandTotal[k] = round2(grandTotal[k]);

console.log('GRAND TOTAL:');
console.log(grandTotal);

console.log('\nROWS:');
rows.forEach(r => {
  console.log(`${r.name.padEnd(30)} | Op: ${String(r.openingBalance).padEnd(10)} | RentIn: ${String(r.rentalIncome).padEnd(9)} | 40ABIn: ${String(r.input40AB).padEnd(9)} | OthIn: ${String(r.otherInput).padEnd(9)} | TotIn: ${String(r.totalInput).padEnd(10)} | RentEx: ${String(r.rentalExpenses).padEnd(10)} | 40ABEx: ${String(r.expense40AB).padEnd(10)} | OthEx: ${String(r.otherExpenses).padEnd(9)} | TotOut: ${String(r.totalOutput).padEnd(10)} | Cl: ${r.closingBalance}`);
});

process.exit(0);
