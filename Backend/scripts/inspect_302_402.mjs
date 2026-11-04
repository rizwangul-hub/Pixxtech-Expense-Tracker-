import dotenv from 'dotenv';
dotenv.config({ path: './Backend/.env' });
import connectDB from '../config/db.js';
import Transaction from '../models/Transaction.js';
import Property from '../models/Property.js';
import RentalAgreement from '../models/RentalAgreement.js';
import RentDue from '../models/RentDue.js';

await connectDB();

const tx = await Transaction.findOne({ voucherNo: 'PT-250-10-26' }).lean();
console.log('PT-250-10-26:', tx);

const prop = await Property.findById('6aa7f0b90220e9e0c82d98c8').lean();
const u302 = prop.units.find(u => u._id.toString() === '6aa7f0b90220e9e0c82d98cc');
const u402 = prop.units.find(u => u._id.toString() === '6aa7f0b90220e9e0c82d98ce');
console.log('Unit 302:', u302);
console.log('Unit 402:', u402);

const ag302 = await RentalAgreement.findOne({ unitId: '6aa7f0b90220e9e0c82d98cc' }).lean();
const ag402 = await RentalAgreement.findOne({ unitId: '6aa7f0b90220e9e0c82d98ce' }).lean();
console.log('Ag 302:', ag302);
console.log('Ag 402:', ag402);

const dues302 = await RentDue.find({ unitId: '6aa7f0b90220e9e0c82d98cc' }).lean();
console.log('Dues 302:', dues302);

const dues402 = await RentDue.find({ unitId: '6aa7f0b90220e9e0c82d98ce' }).lean();
console.log('Dues 402:', dues402);

process.exit(0);
