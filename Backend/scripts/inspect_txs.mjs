import dotenv from 'dotenv';
dotenv.config({ path: './Backend/.env' });
import connectDB from '../config/db.js';
import Transaction from '../models/Transaction.js';
import RentDue from '../models/RentDue.js';
import Property from '../models/Property.js';

await connectDB();

const unitIds = [
  '6aa7f0b90220e9e0c82d98ca', // 201
  '6aa7f0b90220e9e0c82d98cb', // 301
  '6aa7f0b90220e9e0c82d98cc', // 302
  '6aa7f0b90220e9e0c82d98ce', // 402
];

console.log('--- TRANSACTIONS ---');
const txs = await Transaction.find({
  unitId: { $in: unitIds }
}).sort({ date: 1 });

for (const t of txs) {
  console.log({
    unitId: t.unitId.toString(),
    vn: t.voucherNo,
    date: t.date?.toISOString()?.slice(0, 10),
    amount: t.amount,
    rentMonth: t.rentMonth,
    status: t.status,
    detail: t.narration || t.description || t.detail
  });
}

console.log('--- RENT DUES ---');
const dues = await RentDue.find({
  unitId: { $in: unitIds }
}).sort({ rentMonth: 1 });

for (const d of dues) {
  console.log({
    unitId: d.unitId.toString(),
    month: d.rentMonth,
    expected: d.expectedRentAmount,
    paid: d.paidAmount,
    remaining: d.remainingAmount,
    status: d.status
  });
}

console.log('--- PROPERTIES / UNITS ---');
const prop = await Property.findById('6aa7f0b90220e9e0c82d98c8');
for (const u of prop.units) {
  if (unitIds.includes(u._id.toString())) {
    console.log({
      id: u._id.toString(),
      name: u.unitName,
      tenantName: u.tenantName,
      agreedRent: u.agreedRent,
      monthlyRent: u.monthlyRent,
      julyReceivable: u.julyReceivable
    });
  }
}

process.exit(0);
