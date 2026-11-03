import dotenv from 'dotenv';
dotenv.config({ path: './Backend/.env' });
import connectDB from '../config/db.js';
import { getRentalSummaryWithCarryForward } from '../services/rentalCarryForwardService.js';

await connectDB();

const summary = await getRentalSummaryWithCarryForward('2026-09');
const plaza = summary.plazas.find(p => p.plazaName.includes('4-C Plaza'));

for (const u of plaza.units) {
  if (['6aa7f0b90220e9e0c82d98ca', '6aa7f0b90220e9e0c82d98cb', '6aa7f0b90220e9e0c82d98cc', '6aa7f0b90220e9e0c82d98ce'].includes(u.unitId.toString())) {
    console.log(u.unitName);
    console.log(`  Agreed: ${u.agreedRent}, Prior: ${u.priorMonthReceivable}, CurDue: ${u.currentMonthActualRent}, Recvd: ${u.receivedAmount}, Outstanding: ${u.outstandingReceivable}, Advance: ${u.advanceRentReceived}, NetClosing: ${u.netClosingBalance}`);
    console.log(`  Date: ${u.receivedDate}`);
  }
}

process.exit(0);
