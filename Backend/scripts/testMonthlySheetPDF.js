import 'dotenv/config';
import connectDB from '../config/db.js';
import { generateMonthlySalarySheetPDF } from '../controllers/payrollController.js';

const mockRes = () => {
  const res = {};
  res.headers = {};
  res.setHeader = (key, val) => {
    res.headers[key] = val;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.send = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

async function testMonthlySheetPDF() {
  console.log('====================================================');
  console.log('TESTING MONTHLY SALARY SHEET PDF GENERATION');
  console.log('====================================================\n');

  try {
    await connectDB();

    const req = {
      query: { month: '2026-08' },
    };
    const res = mockRes();

    await generateMonthlySalarySheetPDF(req, res);

    console.log(`Response Status Code: ${res.statusCode || 200}`);
    console.log(`Response Content-Type: ${res.headers['Content-Type']}`);
    console.log(`Response Content-Disposition: ${res.headers['Content-Disposition']}`);
    
    if (Buffer.isBuffer(res.body)) {
      console.log(`PDF Buffer Size: ${(res.body.length / 1024).toFixed(2)} KB`);
      console.log('SUCCESS: Monthly Salary Sheet PDF successfully generated!');
    } else if (typeof res.body === 'string' && res.body.includes('<!DOCTYPE html>')) {
      console.log(`HTML Fallback Size: ${(res.body.length / 1024).toFixed(2)} KB`);
      console.log('SUCCESS: HTML Fallback rendered cleanly!');
    } else {
      console.error('Unexpected response body:', res.body);
    }
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  }
}

testMonthlySheetPDF();
