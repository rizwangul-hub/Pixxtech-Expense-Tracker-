import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const Property = (await import('../models/Property.js')).default;
const RentDue = (await import('../models/RentDue.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const RentalAgreement = (await import('../models/RentalAgreement.js')).default;

const plaza = await Property.findOne({ plazaName: /4-C/i });
const unitNames = ['201', '301', '302', '402'];

for (const u of plaza.units) {
  if (unitNames.some(n => u.unitName.includes(n))) {
    console.log('\n======================================================');
    console.log(`UNIT: ${u.unitName} (id: ${u._id})`);
    console.log(`Unit Rent: ${u.rentAmount}, Agreed Rent: ${u.agreedRent}, Tenant: ${u.tenantName}`);

    const ag = await RentalAgreement.findOne({ unitId: u._id, status: 'ACTIVE' });
    console.log(`Active Agreement: monthlyRent=${ag?.monthlyRent}, rentDay=${ag?.rentDueDay}, tenantName=${ag?.tenantName}`);

    const dues = await RentDue.find({ unitId: u._id }).sort({ rentMonth: 1 }).lean();
    console.log('RentDue records:');
    dues.forEach(d => {
      console.log(`  month: ${d.rentMonth} | due: ${d.totalDue} | paid: ${d.paidAmount} | remaining: ${d.remainingDue} | status: ${d.status} | advance: ${d.advanceAmount}`);
    });

    const txs = await Transaction.find({
      unitId: u._id,
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }]
    }).sort({ date: 1 }).lean();
    console.log('Transactions:');
    txs.forEach(t => {
      console.log(`  date: ${t.date?.toISOString().split('T')[0]} | vn: ${t.voucherNo} | amt: ${t.amount} | rentMonth: ${t.rentMonth} | detail: "${t.detail}"`);
    });
  }
}

process.exit(0);
