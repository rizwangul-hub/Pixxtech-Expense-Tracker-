import dotenv from 'dotenv';
dotenv.config({ path: './Backend/.env' });
import connectDB from '../config/db.js';
import Property from '../models/Property.js';
import RentalAgreement from '../models/RentalAgreement.js';
import { getAgreedMonthlyRent } from '../services/rentPricing.js';

await connectDB();

const prop = await Property.findById('6aa7f0b90220e9e0c82d98c8').lean();
const agreements = await RentalAgreement.find({ status: 'ACTIVE' }).lean();
const agreementsByUnitId = new Map(agreements.map(a => [a.unitId.toString(), a]));

for (const u of prop.units) {
  const ag = agreementsByUnitId.get(u._id.toString());
  console.log(u.unitName, 'unit.agreedRent:', typeof u.agreedRent, u.agreedRent, 'agreement:', ag?.monthlyRent, 'computed:', getAgreedMonthlyRent(u, ag));
}

process.exit(0);
