import connectDB from '../config/db.js';
import MonthlyReport from '../models/MonthlyReport.js';

async function check() {
  await connectDB();
  const report = await MonthlyReport.findOne({ month: '2026-10' }).lean();
  console.log('summarySnapshot:', JSON.stringify(report.summarySnapshot, null, 2));
  process.exit(0);
}

check();
