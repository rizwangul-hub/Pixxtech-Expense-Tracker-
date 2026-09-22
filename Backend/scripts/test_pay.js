import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { paySingleSalary } from '../controllers/payrollController.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });

await mongoose.connect(process.env.MONGO_URI);
console.log('Connected to MongoDB');

const p = await mongoose.connection.db.collection('payrolls').findOne({ payrollMonth: '2026-08' });
const acc = await mongoose.connection.db.collection('accounts').findOne({ isActive: true });
const adminUser = await mongoose.connection.db.collection('users').findOne({ role: 'ADMIN' });
const deUser = await mongoose.connection.db.collection('users').findOne({ role: 'DATA_ENTRY' });

console.log('Admin:', adminUser ? { id: adminUser._id, role: adminUser.role } : null);
console.log('Data Entry:', deUser ? { id: deUser._id, role: deUser.role } : null);
console.log('Payroll:', p ? { id: p._id, name: p.employeeName, month: p.payrollMonth, net: p.netPayable, status: p.paymentStatus } : null);
console.log('Account:', acc ? { id: acc._id, name: acc.name, bal: acc.currentBalance } : null);

const reqAdmin = {
  body: {
    month: '2026-08',
    payrollId: String(p._id),
    employeeId: String(p.employeeId),
    paidFromAccountId: String(acc._id),
    paymentMethod: 'BANK_TRANSFER',
    paymentNotes: 'Test payout',
    paymentAmount: 10000,
  },
  user: adminUser,
};

const resAdmin = {
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { console.log('ADMIN RES:', this.statusCode, data); },
};

try {
  await paySingleSalary(reqAdmin, resAdmin);
} catch (err) {
  console.error('paySingleSalary threw:', err);
}

await mongoose.disconnect();
