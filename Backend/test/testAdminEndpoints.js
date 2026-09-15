import dotenv from 'dotenv';
dotenv.config();
import connectDB from '../config/db.js';
import Transaction from '../models/Transaction.js';
import Property from '../models/Property.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import User from '../models/User.js';

async function testEndpoints() {
  await connectDB();
  console.log('Testing Admin Endpoints Logic...');

  // 1. Test getMasterLedger logic
  const query = {};
  const [totalCount, transactions] = await Promise.all([
    Transaction.countDocuments(query),
    Transaction.find(query)
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type currentBalance')
      .populate('crAccountId', 'name type currentBalance')
      .populate('propertyId', 'plazaName')
      .populate('createdBy', 'name email role')
      .sort({ date: -1, voucherNo: -1 })
      .limit(100)
      .lean(),
  ]);
  console.log(`✓ Master Ledger query succeeded: ${transactions.length} transactions loaded (total in DB: ${totalCount})`);

  // 2. Test getRentalIncomeSummary logic
  const properties = await Property.find({})
    .populate('units.defaultReceivingAccountId', 'name type currentBalance')
    .sort({ plazaName: 1 })
    .lean();

  const rentTransactions = await Transaction.find({
    propertyId: { $ne: null },
  })
    .populate('drAccountId', 'name type')
    .lean();

  let grandTotalAgreed = 0;
  let grandTotalReceived = 0;

  for (const plaza of properties) {
    for (const unit of plaza.units || []) {
      const agreed = unit.agreedRent || 0;
      const prior = unit.julyReceivable || 0;
      const currentDue = agreed;

      const matchingTxs = rentTransactions.filter(
        (t) =>
          t.propertyId?.toString() === plaza._id.toString() &&
          t.unitId?.toString() === unit._id.toString()
      );
      const totalReceived = matchingTxs.reduce((sum, t) => sum + t.amount, 0);
      grandTotalAgreed += agreed;
      grandTotalReceived += totalReceived;
    }
  }
  console.log(`✓ Rental Income Summary query succeeded: ${properties.length} plazas evaluated. Total agreed: PKR ${grandTotalAgreed.toLocaleString()}, Total received: PKR ${grandTotalReceived.toLocaleString()}`);

  console.log('ALL ADMIN ENDPOINTS QUERIES PASSED WITHOUT ERRORS!');
  process.exit(0);
}

testEndpoints().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
