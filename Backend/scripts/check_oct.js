import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import RentDue from '../models/RentDue.js';
import RentReceived from '../models/RentReceived.js';
import Transaction from '../models/Transaction.js';
import Property from '../models/Property.js';
import { syncRentDueWithCollections } from '../controllers/rentDueController.js';

await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/expense_tracker');

await syncRentDueWithCollections({ month: '2026-10' });

const prop = await Property.findOne({ plazaName: /299/i }).lean();
const secondFloor = prop.units.find(u => /second/i.test(u.unitName));

const dueOct = await RentDue.findOne({ rentMonth: '2026-10', unitId: secondFloor._id }).lean();
console.log('October RentDue for 2nd floor:', dueOct);

const rrOct = await RentReceived.find({
  $or: [
    { rentMonth: '2026-10' },
    { unitId: secondFloor._id }
  ]
}).lean();
console.log('RentReceived matching October or 2nd floor:', rrOct);

const txOct = await Transaction.find({
  $or: [
    { rentMonth: '2026-10' },
    { unitId: secondFloor._id }
  ]
}).lean();
console.log('Transactions matching October or 2nd floor:', txOct.map(t => ({ id: t._id, date: t.date, rentMonth: t.rentMonth, amount: t.amount, unitId: t.unitId, desc: t.description })));

await mongoose.disconnect();
