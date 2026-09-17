import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Employee from '../models/Employee.js';

const INITIAL_EMPLOYEES = [
  // Office 4C / Bahria Town Office
  {
    name: 'Fahad Rashid',
    designation: 'Manager Accounts',
    department: 'Bahria Town Office',
    basicSalary: 205000,
    accountTitle: 'Fahad Rashid',
    ibanNumber: 'PK13ABPA0020007134700014',
    bankName: 'Allied Bank',
  },
  {
    name: 'Sarfaraz',
    designation: 'Accountant',
    department: 'Bahria Town Office',
    basicSalary: 35000,
    accountTitle: 'Muhammad Rafey Khan',
    ibanNumber: 'PK11ALFH0046001008112613',
    bankName: 'Bank Alfalah',
  },
  {
    name: 'Khursheed',
    designation: 'Officer',
    department: 'Bahria Town Office',
    basicSalary: 110000,
    accountTitle: 'Khushid Anwar',
    ibanNumber: 'PK95BKIP0204500059910001',
    bankName: 'Bank Islami',
  },
  {
    name: 'Majid Javed',
    designation: 'Officer',
    department: 'Bahria Town Office',
    basicSalary: 56355,
    accountTitle: 'Majid Javed',
    ibanNumber: 'PK80ABPA0020117346700014',
    bankName: 'Allied Bank',
  },

  // IT Office (Amin Park)
  {
    name: 'Saeed Sb',
    designation: 'SEO',
    department: 'IT Office',
    basicSalary: 40000,
    accountTitle: 'Armghan Saeed',
    ibanNumber: 'PK17MUCB1511535981011000',
    bankName: 'Muslim Commercial Bank',
  },
  {
    name: 'Faiz Mujahid',
    designation: 'Graphic Designer',
    department: 'IT Office',
    basicSalary: 50000,
    accountTitle: 'Faiz Mujahid',
    ibanNumber: 'PK50MEZN0002390110541808',
    bankName: 'Meezan Bank',
  },
  {
    name: 'Miss Nausheen',
    designation: 'IT Manager',
    department: 'IT Office',
    basicSalary: 32000,
    accountTitle: 'Nosheen mustafa',
    ibanNumber: 'PK53UNIL0110002010819485',
    bankName: 'United Bank Limited',
  },
  {
    name: 'Adeel Ahmad',
    designation: 'Office Boy',
    department: 'IT Office',
    basicSalary: 20000,
    accountTitle: 'Adeel Ahmad',
    ibanNumber: '',
    bankName: 'Cash',
  },
  {
    name: 'Armaghan',
    designation: 'Software Engineer',
    department: 'IT Office',
    basicSalary: 35000,
    accountTitle: 'Armghan Saeed',
    ibanNumber: 'PK11ABPA0010091045790016',
    bankName: 'Allied Bank',
  },
  {
    name: 'Faiza Aslam',
    designation: 'Software Engineer',
    department: 'IT Office',
    basicSalary: 35000,
    accountTitle: 'Faiza Aslam',
    ibanNumber: 'PK29 MUCB 1137 6901 0100 9077',
    bankName: 'Muslim Commercial Bank',
  },
  {
    name: 'Abdul Rafey',
    designation: 'Software Engineer',
    department: 'IT Office',
    basicSalary: 25000,
    accountTitle: 'Muhammad Rafey Khan',
    ibanNumber: 'PK11ALFH0046001008112613',
    bankName: 'Bank Alfalah',
  },
  {
    name: 'Hafsa',
    designation: 'Software Engineer',
    department: 'IT Office',
    basicSalary: 25000,
    accountTitle: 'Hafsa Iftikhar',
    ibanNumber: 'PK87 MUCB 1582753441011612',
    bankName: 'Muslim Commercial Bank',
  },
  {
    name: 'Zulaikha Afzaal',
    designation: 'Software Engineer',
    department: 'IT Office',
    basicSalary: 5000,
    accountTitle: 'Zulaikha Afzaal',
    ibanNumber: '0302 4358263',
    bankName: 'Jazz Cash',
  },
  {
    name: 'Samina Iqbal',
    designation: 'Internee',
    department: 'IT Office',
    basicSalary: 15000,
    accountTitle: 'Samina Iqbal',
    ibanNumber: '03234335365',
    bankName: 'Jazz Cash',
  },
  {
    name: 'Amna Babar',
    designation: 'Internee',
    department: 'IT Office',
    basicSalary: 7000,
    accountTitle: 'Amina Babar',
    ibanNumber: '03234668098',
    bankName: 'Jazz Cash',
  },
  {
    name: 'Eman Khurram',
    designation: 'Internee',
    department: 'IT Office',
    basicSalary: 7000,
    accountTitle: 'Khurram',
    ibanNumber: '0321 4702940',
    bankName: 'Jazz Cash',
  },

  // Security Guards & Admin
  {
    name: 'Sabir Nawaz',
    designation: 'Security Guard',
    department: 'Security Guard',
    basicSalary: 38000,
    accountTitle: 'Sabir Nawaz',
    ibanNumber: '',
    bankName: 'Cash',
    fuelAllowance: 7000,
  },
  {
    name: 'Arab Khan',
    designation: 'Security Guard',
    department: 'Security Guard',
    basicSalary: 30000,
    accountTitle: 'Arab Khan',
    ibanNumber: '',
    bankName: 'Cash',
  },
  {
    name: 'Malik Naveed',
    designation: 'Admin Rider',
    department: 'Admin Rider',
    basicSalary: 35000,
    accountTitle: 'Malik Naveed',
    ibanNumber: '',
    bankName: 'Cash',
    fuelAllowance: 5000,
  },

  // 4A Home
  {
    name: 'Muhammad Rafique',
    designation: 'Gardener',
    department: '4A Home',
    basicSalary: 15000,
    accountTitle: 'Muhammad Rafique',
    ibanNumber: '',
    bankName: 'Cash',
  },
];

async function seed() {
  await connectDB();
  console.log('\n--- SEEDING PIXX TECHNOLOGIES STAFF SAMPLE DATA ---');

  for (const emp of INITIAL_EMPLOYEES) {
    const existing = await Employee.findOne({ name: emp.name });
    if (existing) {
      await Employee.findByIdAndUpdate(existing._id, {
        designation: emp.designation,
        department: emp.department,
        basicSalary: emp.basicSalary,
        fuelAllowance: emp.fuelAllowance || 0,
        accountTitle: emp.accountTitle,
        ibanNumber: emp.ibanNumber,
        bankName: emp.bankName,
      });
      console.log(`✓ Updated staff profile: ${emp.name} (${emp.designation} - ${emp.department})`);
    } else {
      await Employee.create({
        name: emp.name,
        designation: emp.designation,
        department: emp.department,
        basicSalary: emp.basicSalary,
        fuelAllowance: emp.fuelAllowance || 0,
        accountTitle: emp.accountTitle,
        ibanNumber: emp.ibanNumber,
        bankName: emp.bankName,
        isActive: true,
      });
      console.log(`+ Created staff profile: ${emp.name} (${emp.designation} - ${emp.department})`);
    }
  }

  const count = await Employee.countDocuments({ isActive: true });
  console.log(`\n--- SEED COMPLETE: Total Active Employees in Database: ${count} ---`);
  process.exit(0);
}

seed();
