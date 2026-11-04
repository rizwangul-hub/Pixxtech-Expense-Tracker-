import connectDB from '../config/db.js';
import RentReceived from '../models/RentReceived.js';
import Account from '../models/Account.js';
import Property from '../models/Property.js';

async function check() {
  await connectDB();
  const rents = await RentReceived.find({ rentMonth: '2026-10' })
    .populate('propertyId receivingAccountId')
    .lean();

  console.log('Total RentReceived for 2026-10:', rents.length);
  let total = 0;
  rents.forEach(r => {
    total += r.amount;
    console.log(`${r.amount.toString().padStart(8)} | ${r.propertyId?.plazaName} | unit=${r.unitId} | acc=${r.receivingAccountId?.name} | date=${r.receiptDate?.toISOString()?.slice(0,10)}`);
  });
  console.log('TOTAL:', total);
  process.exit(0);
}

check();
