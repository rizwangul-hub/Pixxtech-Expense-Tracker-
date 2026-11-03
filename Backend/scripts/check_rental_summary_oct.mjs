import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const { getRentalSummaryWithCarryForward } = await import('../services/rentalCarryForwardService.js');
const Property = (await import('../models/Property.js')).default;
const RentDue = (await import('../models/RentDue.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const RentalAgreement = (await import('../models/RentalAgreement.js')).default;

const summary = await getRentalSummaryWithCarryForward('2026-10');
const plaza = summary.plazas.find(p => p.plazaName.includes('4-C'));

console.log('--- 4-C Plaza Units in Rental Summary (2026-10) ---');
plaza?.units?.forEach(u => {
  console.log(`Unit: ${u.unitName} | agreed: ${u.agreedRent} | prior: ${u.priorMonthReceivable} | curDue: ${u.currentMonthActualRent} | received: ${u.receivedAmount} | recDate: ${u.receivedDate} | receivable: ${u.outstandingReceivable} | advance: ${u.advanceRentReceived}`);
});

process.exit(0);
