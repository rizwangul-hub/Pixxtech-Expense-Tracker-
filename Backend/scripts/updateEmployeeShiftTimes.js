import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import Employee from '../models/Employee.js';

dotenv.config();

const specificRules = [
  // IT Office Specific Shift Times
  { matchName: 'Malik Naveed', dept: 'IT Office', time: '12:00' },
  { matchName: 'Saeed Sb', dept: 'IT Office', time: '12:00' },
  { matchName: 'Faiz Mujahid', dept: 'IT Office', time: '12:00' },
  { matchName: 'Gulzaib Hamid', dept: 'IT Office', time: '13:00' },
  { matchName: 'Samina Iqbal', dept: 'IT Office', time: '14:00' },
  { matchName: 'Miss Nausheen', dept: 'IT Office', time: '15:00' },
  { matchName: 'Nausheen', dept: 'IT Office', time: '15:00' },
  { matchName: 'Zulaikha Afzaal', dept: 'IT Office', time: '15:00' },
  { matchName: 'Abdul Rafey', dept: 'IT Office', time: '16:00' },

  // Bahria Town Office & 4A Driver Shift Times
  { matchName: 'Sabir Nawaz', dept: 'Bahria Town Office', desig: 'Admin Rider', time: '09:00' },
  { matchName: 'Majid Javed', dept: 'Bahria Town Office', time: '12:30' },
  { matchName: 'Zaffar Hussain', time: '07:00' },
];

async function updateShiftTimes() {
  await connectDB();
  const employees = await Employee.find({}).sort({ name: 1 });

  console.log('\n======================================================');
  console.log(' UPDATING ATTENDANCE WORKPLACES & SHIFT OPENING TIMES');
  console.log('======================================================\n');

  for (const emp of employees) {
    let matchedRule = specificRules.find(r => emp.name.toLowerCase().includes(r.matchName.toLowerCase()));

    if (matchedRule) {
      if (matchedRule.dept) emp.department = matchedRule.dept;
      if (matchedRule.desig) emp.designation = matchedRule.desig;
      emp.shiftOpeningTime = matchedRule.time;
    } else {
      if (emp.department === 'Bahria Town Office' || emp.department === 'Admin Rider') {
        emp.shiftOpeningTime = emp.designation === 'Admin Rider' ? '09:00' : '12:30';
      } else if (emp.department === 'IT Office') {
        emp.shiftOpeningTime = emp.shiftOpeningTime || '12:00';
      }
    }

    await emp.save();
    console.log(`✓ ${emp.name.padEnd(22)} | Dept: ${emp.department.padEnd(20)} | Desig: ${emp.designation.padEnd(18)} | Shift: ${emp.shiftOpeningTime}`);
  }

  console.log('\n======================================================\n');
  process.exit(0);
}

updateShiftTimes().catch(console.error);
