import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import Employee from '../models/Employee.js';
import { generateSalarySlipPDF } from '../controllers/payrollController.js';

dotenv.config();

async function testSlip() {
  await connectDB();
  const emp = await Employee.findOne();
  console.log('Testing PDF slip generation for employee:', emp.name);

  const req = { params: { employeeId: emp._id.toString() }, query: { month: '2026-08' } };
  const res = {
    setHeader: (k, v) => console.log(`Header: ${k} = ${v}`),
    status: (code) => ({
      send: (body) => console.log(`Response status ${code}, body length: ${typeof body === 'string' ? body.length : body.byteLength}`),
    }),
  };

  await generateSalarySlipPDF(req, res);
  process.exit(0);
}

testSlip().catch(console.error);
