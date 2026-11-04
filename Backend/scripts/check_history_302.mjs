import dotenv from 'dotenv';
dotenv.config({ path: './Backend/.env' });
import connectDB from '../config/db.js';
import Transaction from '../models/Transaction.js';
import RentDue from '../models/RentDue.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Property from '../models/Property.js';

await connectDB();

console.log('--- ALL TRANSACTIONS FOR 302 ---');
const txs = await Transaction.find({ unitId: '6aa7f0b90220e9e0c82d98cc' }).lean();
console.log(txs.map(t => ({ vn: t.voucherNo, date: t.date, amt: t.amount, rentMonth: t.rentMonth, desc: t.detail })));

console.log('--- ALL AGREEMENTS FOR 302 ---');
const ags = await RentalAgreement.find({ unitId: '6aa7f0b90220e9e0c82d98cc' }).lean();
console.log(ags.map(a => ({ num: a.agreementNumber, rent: a.monthlyRent, prev: a.previousRent, status: a.status })));

process.exit(0);
