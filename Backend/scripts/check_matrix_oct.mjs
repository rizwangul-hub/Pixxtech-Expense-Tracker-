import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const { getMonthlyOpeningClosingMatrix } = await import('../services/ledgerService.js');

const matrix = await getMonthlyOpeningClosingMatrix('2026-10');
console.log('Grand total for 2026-10:');
console.log(matrix.grandTotal);
console.log('\nAccount Rows:');
matrix.rows.forEach(r => {
  console.log(`${r.accountName.padEnd(30)} | Op: ${r.openingBalance} | RentIn: ${r.rentalIncome} | OtherIn: ${r.otherInput} | TotIn: ${r.totalInput} | RentEx: ${r.rentalExpenses} | OtherEx: ${r.otherExpenses} | TotOut: ${r.totalOutput} | Cl: ${r.closingBalance}`);
});

process.exit(0);
