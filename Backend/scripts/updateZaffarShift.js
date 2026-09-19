import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  
  const emp = await Employee.findOne({ name: new RegExp('Zaffar Hussain', 'i') });
  if (emp) {
    emp.shiftOpeningTime = '07:00';
    emp.staffLocation = 'Bahria Town Office';
    await emp.save();
    console.log(`✅ Updated employee ${emp.name}: shiftOpeningTime = 07:00, staffLocation = Bahria Town Office`);

    const attRes = await Attendance.updateMany(
      { employeeId: emp._id },
      { $set: { shiftOpeningTime: '07:00' } }
    );
    console.log(`✅ Updated ${attRes.modifiedCount} existing attendance records for ${emp.name}`);
  } else {
    console.log('❌ Employee Zaffar Hussain not found.');
  }

  await mongoose.disconnect();
}

run().catch(console.error);
