import connectDB from '../config/db.js';
import MonthlyReport from '../models/MonthlyReport.js';

async function check() {
  await connectDB();
  const report = await MonthlyReport.findOne({ month: '2026-10' }).lean();
  if (!report) {
    console.log('No MonthlyReport found for 2026-10');
  } else {
    console.log('MonthlyReport 2026-10 found, status:', report.status);
    console.log('Keys in report:', Object.keys(report));
    if (report.matrix) {
      console.log('report.matrix rows count:', report.matrix.rows?.length);
      console.log('report.matrix grandTotal:', report.matrix.grandTotal);
      report.matrix.rows?.forEach(r => console.log(' ', r.accountName, 'in:', r.totalInput, 'out:', r.totalOutput));
    }
  }
  process.exit(0);
}

check();
