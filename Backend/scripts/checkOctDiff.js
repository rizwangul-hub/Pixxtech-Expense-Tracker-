import connectDB from '../config/db.js';
import Transaction from '../models/Transaction.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import Property from '../models/Property.js';
import { getUtcMonthDateRange } from '../services/salaryReportingService.js';

async function run() {
  await connectDB();
  const { startDate, endDate } = getUtcMonthDateRange(2026, 10);
  const accs = await Account.find({ name: { $in: ['ABL (Uraan Ventures)', 'Suspense Account', 'Cash in Hand (Majid Javed)'] } }).lean();

  for (const acc of accs) {
    console.log(`\n=================== ${acc.name} ===================`);
    const txs = await Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      $or: [{ drAccountId: acc._id }, { crAccountId: acc._id }],
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
    }).populate('categoryId propertyId').lean();

    let drSum = 0, crSum = 0;
    txs.forEach(t => {
      const isDr = t.drAccountId?.toString() === acc._id.toString();
      if (isDr) {
        drSum += t.amount;
        console.log(`DR: ${t.amount} | type=${t.transactionType} | repCat=${t.reportCategory} | cat=${t.categoryId?.name} | prop=${t.propertyId?.plazaName} | desc=${t.description || t.detail}`);
      } else {
        crSum += t.amount;
        console.log(`CR: ${t.amount} | type=${t.transactionType} | repCat=${t.reportCategory} | cat=${t.categoryId?.name} | prop=${t.propertyId?.plazaName} | desc=${t.description || t.detail}`);
      }
    });
    console.log(`TOTAL DR: ${drSum} | TOTAL CR: ${crSum}`);
  }

  // Also check if there are transactions for October with rent or other accounts that were dated slightly outside or in another account
  const allOctRent = await Transaction.find({
    date: { $gte: startDate, $lte: endDate },
    reportCategory: 'Rent',
    $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
  }).populate('drAccountId crAccountId').lean();

  console.log('\n=================== ALL OCT RENT TRANSACTIONS ===================');
  let rentSum = 0;
  allOctRent.forEach(t => {
    rentSum += t.amount;
    console.log(`RENT: ${t.amount} -> DR: ${t.drAccountId?.name} | CR: ${t.crAccountId?.name} | date: ${t.date.toISOString().split('T')[0]} | desc: ${t.description || t.detail}`);
  });
  console.log('TOTAL RENT SUM:', rentSum);

  process.exit(0);
}

run();
