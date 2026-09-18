import mongoose from 'mongoose';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';
import { round2 } from '../services/ledgerService.js';

await mongoose.connect('mongodb+srv://rizwangul535_db_user:LYGTNebZbKQQ0csd@cluster0.wun93hu.mongodb.net/pixx_expense_tracker?retryWrites=true&w=majority');

console.log('=== AUDITING ALL ACCOUNTS & BALANCES ===');
const accounts = await Account.find({ isActive: true }).lean();

let mismatchCount = 0;

for (const acc of accounts) {
  const opening = round2(acc.openingBalance || 0);
  const curBal = round2(acc.currentBalance || 0);
  
  const drTxs = await Transaction.find({ drAccountId: acc._id, status: { $ne: 'REVERSED' } }).lean();
  const crTxs = await Transaction.find({ crAccountId: acc._id, status: { $ne: 'REVERSED' } }).lean();
  
  const totalDebits = round2(drTxs.reduce((s, t) => s + (t.amount || 0), 0));
  const totalCredits = round2(crTxs.reduce((s, t) => s + (t.amount || 0), 0));
  
  const calculated = round2(opening + totalDebits - totalCredits);
  const diff = round2(curBal - calculated);
  
  if (diff !== 0 && !acc.isClearing) mismatchCount++;
  
  console.log(JSON.stringify({
    name: acc.name,
    type: acc.type,
    isClearing: acc.isClearing || false,
    opening,
    totalInflow: totalDebits,
    totalOutflow: totalCredits,
    calculatedBalance: calculated,
    liveCurrentBalance: curBal,
    status: diff === 0 ? 'MATCH OK' : 'MISMATCH DIFF: ' + diff
  }));
}

console.log('\nTotal Non-Clearing Mismatches:', mismatchCount);
await mongoose.disconnect();
