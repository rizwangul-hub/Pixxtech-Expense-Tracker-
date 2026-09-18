import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import { downloadSalarySheetExcel } from '../controllers/payrollController.js';

dotenv.config();

async function testExcel() {
  await connectDB();
  console.log('Testing Excel Salary Sheet generation with ExcelJS...');

  const req = { query: { month: '2026-08' } };
  const res = {
    setHeader: (k, v) => console.log(`Header: ${k} = ${v}`),
    status: (code) => ({
      send: (body) => console.log(`Response status ${code}, buffer size: ${body.byteLength} bytes`),
    }),
  };

  await downloadSalarySheetExcel(req, res);
  process.exit(0);
}

testExcel().catch(console.error);
