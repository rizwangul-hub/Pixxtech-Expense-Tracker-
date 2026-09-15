import dotenv from 'dotenv';
dotenv.config();
import connectDB from '../config/db.js';
import { getMonthlyOpeningClosingMatrix, getHeadWiseExpenseReport } from '../services/ledgerService.js';
import Property from '../models/Property.js';

async function verify() {
  await connectDB();
  console.log('\n--- VERIFYING AUGUST 2026 FINANCIAL FIGURES ---');
  
  const matrix = await getMonthlyOpeningClosingMatrix('2026-08');
  console.log('\n1. Cash & Bank Matrix:');
  console.log('Total Opening Balance: PKR', matrix.grandTotal.openingBalance.toLocaleString());
  console.log('Total Inflows / Rent:  PKR', matrix.grandTotal.totalInput.toLocaleString());
  console.log('Total Expenses:        PKR', matrix.grandTotal.totalOutput.toLocaleString());
  console.log('Net Monthly Movement:  PKR', (matrix.grandTotal.totalInput - matrix.grandTotal.totalOutput).toLocaleString());
  console.log('Closing Balance:       PKR', matrix.grandTotal.closingBalance.toLocaleString());

  const expenseReport = await getHeadWiseExpenseReport('2026-08');
  console.log('\n2. Expense Heads Total: PKR', expenseReport.totalExpensesOverall.toLocaleString());
  console.log('Number of Active Heads:', expenseReport.heads.length);

  const properties = await Property.find();
  let totalDues = 0;
  let totalReceivable = 0;
  properties.forEach(p => {
    p.units.forEach(u => {
      totalDues += u.currentDues || 0;
      totalReceivable += u.receivables || 0;
    });
  });
  console.log('\n3. Tenancy Register:');
  console.log('Total Properties:', properties.length);
  console.log('Total Current Dues: PKR', totalDues.toLocaleString());
  console.log('Total Receivables:  PKR', totalReceivable.toLocaleString());

  console.log('\n-----------------------------------------------');
  process.exit(0);
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
