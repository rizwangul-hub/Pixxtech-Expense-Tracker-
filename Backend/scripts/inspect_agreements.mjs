import dotenv from 'dotenv';
dotenv.config({ path: './Backend/.env' });
import connectDB from '../config/db.js';
import RentalAgreement from '../models/RentalAgreement.js';

await connectDB();

const unitIds = [
  '6aa7f0b90220e9e0c82d98ca', // 201
  '6aa7f0b90220e9e0c82d98cb', // 301
  '6aa7f0b90220e9e0c82d98cc', // 302
  '6aa7f0b90220e9e0c82d98ce', // 402
];

const agreements = await RentalAgreement.find({
  unitId: { $in: unitIds }
});

for (const a of agreements) {
  console.log({
    id: a._id.toString(),
    unitId: a.unitId.toString(),
    monthlyRent: a.monthlyRent,
    status: a.status,
    startDate: a.startDate?.toISOString()?.slice(0, 10),
    endDate: a.endDate?.toISOString()?.slice(0, 10),
  });
}

process.exit(0);
