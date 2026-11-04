import connectDB from '../config/db.js';
import Transaction from '../models/Transaction.js';
import Account from '../models/Account.js';
import { getUtcMonthDateRange } from '../services/salaryReportingService.js';
import { is40ABTransaction } from '../services/ledgerService.js';

async function check() {
  await connectDB();
  const { startDate, endDate } = getUtcMonthDateRange(2026, 10);
  console.log('Date range:', startDate.toISOString(), 'to', endDate.toISOString());

  const txs = await Transaction.find({
    date: { $gte: startDate, $lte: endDate },
    $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
  }).populate('drAccountId crAccountId categoryId propertyId').lean();

  console.log('Total transactions in Oct 2026:', txs.length);

  const accounts = await Account.find({}).lean();
  for (const acc of accounts) {
    const drTxs = txs.filter(t => t.drAccountId?._id?.toString() === acc._id.toString());
    const crTxs = txs.filter(t => t.crAccountId?._id?.toString() === acc._id.toString());
    if (drTxs.length > 0 || crTxs.length > 0) {
      console.log('\n=== ACCOUNT:', acc.name, '===');
      console.log('  Total Inflow (Dr):', drTxs.reduce((s,t)=>s+t.amount,0));
      console.log('  Total Outflow (Cr):', crTxs.reduce((s,t)=>s+t.amount,0));
      drTxs.forEach(t => {
        const is40 = is40ABTransaction(t);
        console.log(`    DR: amt=${t.amount} type=${t.transactionType} repCat=${t.reportCategory} cat=${t.categoryId?.name} prop=${t.propertyId?.plazaName} 40AB=${is40} desc=${t.description || t.detail || ''}`);
      });
      crTxs.forEach(t => {
        const is40 = is40ABTransaction(t);
        console.log(`    CR: amt=${t.amount} type=${t.transactionType} repCat=${t.reportCategory} cat=${t.categoryId?.name} prop=${t.propertyId?.plazaName} 40AB=${is40} desc=${t.description || t.detail || ''}`);
      });
    }
  }
  process.exit(0);
}

check();
