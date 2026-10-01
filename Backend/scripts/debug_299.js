import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import Property from '../models/Property.js';
import RentDue from '../models/RentDue.js';
import RentReceived from '../models/RentReceived.js';
import Transaction from '../models/Transaction.js';

await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/expense_tracker');

const prop = await Property.findOne({ plazaName: /299/i }).lean();
console.log('Property 299-Q Plaza DHA Units:');
prop.units.forEach(u => console.log({ _id: u._id, unitName: u.unitName, tenantName: u.tenantName, agreedRent: u.agreedRent }));

const secondFloorUnit = prop.units.find(u => /second/i.test(u.unitName) || /2nd/i.test(u.unitName));
console.log('\nSecond floor unit:', secondFloorUnit);

const dues = await RentDue.find({ propertyId: prop._id }).lean();
console.log('\nAll Dues for 299:');
dues.forEach(d => {
  const u = prop.units.find(un => un._id.toString() === d.unitId?.toString());
  console.log({
    dueId: d._id,
    month: d.rentMonth,
    unitName: u ? u.unitName : d.unitId,
    tenantName: u ? u.tenantName : '',
    status: d.status,
    expected: d.expectedRentAmount,
    paid: d.paidAmount,
    remaining: d.remainingAmount,
    agreementId: d.agreementId,
    unitId: d.unitId
  });
});

const receipts = await RentReceived.find({ propertyId: prop._id }).lean();
console.log('\nRentReceived for 299:');
receipts.forEach(r => console.log({ id: r._id, unitId: r.unitId, month: r.rentMonth, amount: r.amount, date: r.receivedDate, status: r.status }));

const txs = await Transaction.find({ propertyId: prop._id, transactionType: 'INCOME' }).lean();
console.log('\nIncome Transactions for 299:');
txs.forEach(t => console.log({ id: t._id, unitId: t.unitId, date: t.date, rentMonth: t.rentMonth, amount: t.amount, desc: t.description, cat: t.reportCategory, type: t.transactionType, status: t.status }));

await mongoose.disconnect();
