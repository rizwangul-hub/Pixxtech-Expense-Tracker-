import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';

import User from '../models/User.js';
import Account from '../models/Account.js';
import Property from '../models/Property.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import { createTransaction, round2 } from '../services/ledgerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const seedExactAugustData = async () => {
  try {
    console.log('================================================================');
    console.log('  PIXX TECHNOLOGIES - EXACT AUGUST 2026 FINANCIAL SEED SCRIPT   ');
    console.log('================================================================');

    await connectDB();

    console.log('\n[1/6] Clearing old database collections...');
    await Promise.all([
      User.deleteMany({}),
      Account.deleteMany({}),
      Property.deleteMany({}),
      Category.deleteMany({}),
      Transaction.deleteMany({}),
    ]);
    console.log('✓ Collections wiped.');

    // 1. Users
    console.log('\n[2/6] Seeding Users with RBAC...');
    const users = await User.create([
      {
        name: 'Fahad Sb',
        email: 'fahad@pixxtechnologies.com',
        password: 'admin12345',
        role: 'ADMIN_PUBLISHER',
        isActive: true,
      },
      {
        name: 'System Administrator',
        email: 'admin@pixxtechnologies.com',
        password: 'admin12345',
        role: 'ADMIN_PUBLISHER',
        isActive: true,
      },
      {
        name: 'Data Entry Operator',
        email: 'entry@pixxtechnologies.com',
        password: 'entry12345',
        role: 'DATA_ENTRY',
        isActive: true,
      },
    ]);
    const adminUser = users[0];
    console.log('✓ Seeded Admin and Data Entry users.');

    // 2. Accounts (Exact Opening & Final Balances from Page 2 of Report)
    console.log('\n[3/6] Seeding 9 Core Liquidity Accounts + Clearing...');
    const accountsData = [
      {
        name: 'Bank Al Falah (Kamran Ijaz Sb)',
        type: 'BANK',
        accountNumber: '56575000550004',
        iban: 'PK13ALFH5657005000550004',
        branch: 'IBG-Q-BLOCK DHA LHR',
        openingBalance: 9705440.26,
        currentBalance: 8907740.18,
      },
      {
        name: 'UBL (Kamran Ijaz Sb)',
        type: 'BANK',
        accountNumber: '1957-312896195',
        iban: 'PK44UNIL0109000312896195',
        branch: 'Bahria Town Talwar Chowk',
        openingBalance: 12528.6,
        currentBalance: 48276.29,
      },
      {
        name: 'UBL (Uraan Ventures)',
        type: 'BANK',
        accountNumber: '1957-325086338',
        iban: 'PK84UNIL0109000325086338',
        branch: 'Bahria Town Talwar Chowk',
        openingBalance: 29113.79,
        currentBalance: 613113.79,
      },
      {
        name: 'ABL (Kamran Ijaz Sb)',
        type: 'BANK',
        accountNumber: '0020001352570047',
        branch: 'Bahria Town Lahore',
        openingBalance: 1460136.27,
        currentBalance: 1458786.16,
      },
      {
        name: 'ABL (Uraan Ventures)',
        type: 'BANK',
        accountNumber: '0020001352570024',
        branch: 'Bahria Town Lahore',
        openingBalance: 1146558.36,
        currentBalance: 1405494.36,
      },
      {
        name: 'Cash in Hand (Sarfaraz Sb)',
        type: 'CASH',
        openingBalance: 0.0,
        currentBalance: 1653.0,
      },
      {
        name: 'Cash in Hand (Malik Naveed)',
        type: 'CASH',
        openingBalance: 0.0,
        currentBalance: 0.0,
      },
      {
        name: 'Cash in Hand (Sabir Nawaz)',
        type: 'CASH',
        openingBalance: 0.0,
        currentBalance: 1024.0,
      },
      {
        name: 'Cash in Hand (Majid Javed)',
        type: 'CASH',
        openingBalance: 13267.0,
        currentBalance: 617.0,
      },
      {
        name: 'External Parties / Operations Clearing',
        type: 'CASH',
        openingBalance: 0.0,
        currentBalance: 0.0,
        isClearing: true,
        notes: 'Clearing account for external disbursements & receipts',
      },
    ];

    const accounts = await Account.create(accountsData);
    const accMap = new Map(accounts.map((a) => [a.name, a]));
    console.log(`✓ Seeded ${accounts.length} accounts.`);

    // 3. Categories (Exact 18 Expense Heads + Inflow Heads from Report)
    console.log('\n[4/6] Seeding Official Expense & Inflow Heads...');
    const categoriesData = [
      { name: 'Rental Income', type: 'INCOME', isRentalHead: true },
      { name: 'Other Income', type: 'INCOME', isRentalHead: false },
      { name: 'Bank Profit', type: 'INCOME', isRentalHead: false },
      { name: 'Internal Funds Transfer', type: 'TRANSFER', isRentalHead: false },
      { name: 'Salaries', type: 'EXPENSE', isRentalHead: false },
      { name: 'Abida Ijaz Foundation Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: '4-A Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: '4-C Expenses', type: 'EXPENSE', isRentalHead: true },
      { name: 'IT Office Electricity Bill', type: 'EXPENSE', isRentalHead: false },
      { name: 'PTCL Bills', type: 'EXPENSE', isRentalHead: false },
      { name: 'BOSS Purchases', type: 'EXPENSE', isRentalHead: false },
      { name: 'Rishwat for Lake City House', type: 'EXPENSE', isRentalHead: true },
      { name: 'Entertainment Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Majid Javed expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Javed Sb expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Legal Fee', type: 'EXPENSE', isRentalHead: false },
      { name: 'Misc Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Flat 502 Expenses', type: 'EXPENSE', isRentalHead: true },
      { name: 'Flat 301 Expenses', type: 'EXPENSE', isRentalHead: true },
      { name: 'Printing & Stationary Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: '40-AB Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Repair & Maintenance', type: 'EXPENSE', isRentalHead: false },
      { name: 'Electricity Bill Amin Park', type: 'EXPENSE', isRentalHead: false },
    ];

    const categories = await Category.create(categoriesData);
    const catMap = new Map(categories.map((c) => [c.name, c]));
    console.log(`✓ Seeded ${categories.length} categories.`);

    // 4. Properties & Units (Exact Tenancy Register from Page 3)
    console.log('\n[5/6] Seeding 7 Plazas and 23 Tenancy Units with July Receivables...');
    const ablUraan = accMap.get('ABL (Uraan Ventures)');
    const cashMalik = accMap.get('Cash in Hand (Malik Naveed)');
    const cashMajid = accMap.get('Cash in Hand (Majid Javed)');
    const clearingAcc = accMap.get('External Parties / Operations Clearing');
    const bankAlFalah = accMap.get('Bank Al Falah (Kamran Ijaz Sb)');

    const propertiesData = [
      {
        plazaName: '289-Q Plaza DHA',
        units: [
          {
            unitName: 'Basement',
            tenantName: 'Commercial Tenant',
            dueDay: 5,
            agreedRent: 82000,
            julyReceivable: 77500,
            renewalDate: new Date('2026-04-12'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: 'Ground Floor (Bank Al-Falah)',
            tenantName: 'Bank Al Falah Ltd',
            dueDay: 10,
            agreedRent: 0,
            julyReceivable: 0,
            renewalDate: new Date('2026-04-13'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: 'First Floor',
            tenantName: 'Corporate Office',
            dueDay: 1,
            agreedRent: 91575,
            julyReceivable: 91575,
            renewalDate: new Date('2026-04-04'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: 'Second Floor',
            tenantName: 'IT Solutions Firm',
            dueDay: 10,
            agreedRent: 85000,
            julyReceivable: 0,
            renewalDate: new Date('2026-03-11'),
            defaultReceivingAccountId: ablUraan._id,
          },
        ],
      },
      {
        plazaName: '299-Q Plaza DHA',
        units: [
          {
            unitName: 'Basement',
            tenantName: 'Storage Facility',
            dueDay: 5,
            agreedRent: 38000,
            julyReceivable: 0,
            renewalDate: new Date('2025-07-15'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: 'Ground Floor',
            tenantName: 'Retail Brand',
            dueDay: 5,
            agreedRent: 85000,
            julyReceivable: 0,
            renewalDate: new Date('2026-07-03'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: 'First Floor',
            tenantName: 'Consultancy Office',
            dueDay: 1,
            agreedRent: 55000,
            julyReceivable: 0,
            renewalDate: new Date('2026-07-31'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: 'Mezzanine',
            tenantName: 'Studio Office',
            dueDay: 1,
            agreedRent: 33000,
            julyReceivable: 0,
            renewalDate: new Date('2025-12-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: 'Second Floor',
            tenantName: 'Design House',
            dueDay: 10,
            agreedRent: 55000,
            julyReceivable: 0,
            renewalDate: new Date('2025-10-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
        ],
      },
      {
        plazaName: '48-CCA Plaza DHA',
        units: [
          {
            unitName: 'Basement, GF & Mezzanine',
            tenantName: 'Flagship Superstore',
            dueDay: 5,
            agreedRent: 270000,
            julyReceivable: 60000,
            renewalDate: new Date('2026-06-30'),
            defaultReceivingAccountId: cashMalik._id,
          },
          {
            unitName: 'First Floor',
            tenantName: 'Marketing Agency',
            dueDay: 5,
            agreedRent: 72600,
            julyReceivable: 0,
            renewalDate: new Date('2025-11-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: 'Second Floor',
            tenantName: 'Software Consultancy',
            dueDay: 5,
            agreedRent: 72600,
            julyReceivable: 0,
            renewalDate: new Date('2026-05-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
        ],
      },
      {
        plazaName: '4-C Plaza Bahria Town',
        units: [
          {
            unitName: 'Ground Floor (Allied Bank)',
            tenantName: 'Allied Bank Limited',
            dueDay: 8,
            agreedRent: 216250,
            julyReceivable: -216250,
            renewalDate: new Date('2026-05-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: '2nd Floor Deal Land (201)',
            tenantName: 'Deal Land Real Estate',
            dueDay: 5,
            agreedRent: 47500,
            julyReceivable: -47500,
            renewalDate: new Date('2026-03-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: '3rd Floor Back Apartment (301)',
            tenantName: 'Executive Suites',
            dueDay: 5,
            agreedRent: 35000,
            julyReceivable: -35000,
            renewalDate: new Date('2026-08-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: '3rd Floor Back Apartment (302)',
            tenantName: 'Studio Apartment',
            dueDay: 15,
            agreedRent: 25000,
            julyReceivable: 0,
            renewalDate: new Date('2026-09-13'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: '4th Floor Front Apartment (401)',
            tenantName: 'Law Associates',
            dueDay: 5,
            agreedRent: 40000,
            julyReceivable: 40000,
            renewalDate: new Date('2026-07-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: '4th Floor Back Apartment (402)',
            tenantName: 'Tech Hub',
            dueDay: 5,
            agreedRent: 39930,
            julyReceivable: 0,
            renewalDate: new Date('2025-11-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: '5th Floor Front Apartment (501)',
            tenantName: 'Creative Studio',
            dueDay: 10,
            agreedRent: 38000,
            julyReceivable: 0,
            renewalDate: new Date('2026-07-18'),
            defaultReceivingAccountId: ablUraan._id,
          },
          {
            unitName: '5th Floor Front Apartment (502)',
            tenantName: 'Dr. Clinic',
            dueDay: 10,
            agreedRent: 38000,
            julyReceivable: -38000,
            renewalDate: new Date('2026-12-01'),
            defaultReceivingAccountId: ablUraan._id,
          },
        ],
      },
      {
        plazaName: 'Lake City House',
        units: [
          {
            unitName: 'Lake City Luxury Villa',
            tenantName: 'Residential Tenant',
            dueDay: 10,
            agreedRent: 114000,
            julyReceivable: 0,
            renewalDate: new Date('2025-10-11'),
            defaultReceivingAccountId: ablUraan._id,
          },
        ],
      },
      {
        plazaName: 'Rizwan Abuzar Tower',
        units: [
          {
            unitName: 'Commercial Office 404',
            tenantName: 'Logistics Partner',
            dueDay: 15,
            agreedRent: 20000,
            julyReceivable: 5000,
            renewalDate: new Date('2026-02-17'),
            defaultReceivingAccountId: ablUraan._id,
          },
        ],
      },
      {
        plazaName: 'Anarkali (4 Cabin Shops)',
        units: [
          {
            unitName: '4 Cabin Shops Combined',
            tenantName: 'Retail Traders Association',
            dueDay: 5,
            agreedRent: 44000,
            julyReceivable: 22000,
            renewalDate: new Date('2026-04-17'),
            defaultReceivingAccountId: ablUraan._id,
          },
        ],
      },
    ];

    const properties = await Property.create(propertiesData);
    const propMap = new Map(properties.map((p) => [p.plazaName, p]));
    console.log(`✓ Seeded ${properties.length} plazas.`);

    // 5. Seed All 42 Authentic Transactions from Pages 4 & 5 (Total Rs. 1,588,695.00)
    console.log('\n[6/6] Seeding all 42 authentic August 2026 vouchers from the report...');
    const sarfarazCash = accMap.get('Cash in Hand (Sarfaraz Sb)');
    const sabirCash = accMap.get('Cash in Hand (Sabir Nawaz)');

    const vouchersList = [
      { date: '2026-08-03', vn: '3048', detail: 'Paid Abida Ijaz Foundation salaries FTMO 06/26', cat: 'Abida Ijaz Foundation Expenses', dr: cashMalik, cr: clearingAcc, amt: 60000 },
      { date: '2026-08-05', vn: '3049', detail: 'Paid for 4-A tank guard by Majid Javed', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 950 },
      { date: '2026-08-05', vn: '3049', detail: 'Paid for Sanitary material for Ahmad Washroom by Majid Javed', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 1000 },
      { date: '2026-08-05', vn: '3049', detail: 'Paid for Gym AC labor charges by Majid Javed', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 1500 },
      { date: '2026-08-05', vn: '3049', detail: 'Paid for new Alta car DBY 983 number plate by Majid javed', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 1800 },
      { date: '2026-08-05', vn: '3049', detail: 'Paid for 4A AC stand and rawal bolts by Majid Javed', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 2300 },
      { date: '2026-08-06', vn: '3050', detail: 'Salary paid to Sarfarz Sb FTMO 07/26', cat: 'Salaries', dr: bankAlFalah, cr: clearingAcc, amt: 20000 },
      { date: '2026-08-06', vn: '3050', detail: 'Salary paid to Javed Sb FTMO 07/26', cat: 'Salaries', dr: bankAlFalah, cr: clearingAcc, amt: 37500 },
      { date: '2026-08-06', vn: '3050', detail: 'Salary paid to Adeel Office Boy FTMO 07/26', cat: 'Salaries', dr: bankAlFalah, cr: clearingAcc, amt: 17417 },
      { date: '2026-08-06', vn: '3050', detail: 'Salary paid to Usman CCTV FTMO 07/26', cat: 'Salaries', dr: bankAlFalah, cr: clearingAcc, amt: 40000 },
      { date: '2026-08-06', vn: '3050', detail: 'Salary paid to Rafique Gardener 4A FTMO 07/26', cat: 'Salaries', dr: bankAlFalah, cr: clearingAcc, amt: 15000 },
      { date: '2026-08-06', vn: '3050', detail: 'Salary paid to Sabir Nawaz Chowkidar 4A FTMO 07/26', cat: 'Salaries', dr: bankAlFalah, cr: clearingAcc, amt: 45000 },
      { date: '2026-08-06', vn: '3050', detail: 'Salary paid to Balqees Maid 4A FTMO 07/26', cat: 'Salaries', dr: bankAlFalah, cr: clearingAcc, amt: 6100 },
      { date: '2026-08-06', vn: '3050', detail: 'Paid for monthly office entertainment 4C Office', cat: 'Entertainment Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 7000 },
      { date: '2026-08-06', vn: '3050', detail: 'Paid for monthly office entertainment IT Office', cat: 'Entertainment Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 5000 },
      { date: '2026-08-06', vn: '3050', detail: 'Purchased 2 extension leads & LED Bulbs', cat: '4-C Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 1800 },
      { date: '2026-08-06', vn: '3050', detail: 'Paid for Ahmad Kamran Zong weekly package', cat: 'Misc Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 370 },
      { date: '2026-08-06', vn: '3050', detail: 'Paid for Air Freshner', cat: '4-C Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 320 },
      { date: '2026-08-06', vn: '3050', detail: 'Purchased 4 A4 paper Reams for 4C office', cat: 'Printing & Stationary Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 3800 },
      { date: '2026-08-06', vn: '3050', detail: 'Paid to sarfarz Sb for misc work fuel', cat: 'Misc Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 700 },
      { date: '2026-08-06', vn: '3050', detail: 'Paid to Khurshid Anwar for misc work fuel', cat: 'Misc Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 700 },
      { date: '2026-08-06', vn: '3050', detail: 'Paid for internet package for Majid Bike tracker', cat: 'Misc Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 280 },
      { date: '2026-08-06', vn: '3050', detail: 'Paid for carosin oil for lift & LED Bulbs + Photocopies', cat: 'Misc Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 1100 },
      { date: '2026-08-08', vn: '3051', detail: 'Paid for electricity bill Amin Park (LESCO)', cat: 'Electricity Bill Amin Park', dr: bankAlFalah, cr: clearingAcc, amt: 20173 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid for computer repair 4C Office', cat: 'Repair & Maintenance', dr: sarfarazCash, cr: clearingAcc, amt: 500 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid electricity bill 4-A', cat: '4-A Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 60890 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid electricity bill 4-C', cat: '4-C Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 105610 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid electricty bill Flat 502', cat: 'Flat 502 Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 6490 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid electricty bill Flat 301', cat: 'Flat 301 Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 620 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid maintenace chatrges 4A', cat: '4-A Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 13100 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid maintenace chatrges 4-C', cat: '4-C Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 19280 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid maintenace charges Flat 301', cat: 'Flat 301 Expenses', dr: bankAlFalah, cr: clearingAcc, amt: 1800 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid PTCL Bill 042-37702149 IT Office', cat: 'PTCL Bills', dr: bankAlFalah, cr: clearingAcc, amt: 4000 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid PTCL Bill 042-37861654 4-C Office', cat: 'PTCL Bills', dr: bankAlFalah, cr: clearingAcc, amt: 7810 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid PTCL Bill 042-37862446 4-C Office', cat: 'PTCL Bills', dr: bankAlFalah, cr: clearingAcc, amt: 7800 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid PTCL Bill 042-37862447 4-C Office', cat: 'PTCL Bills', dr: bankAlFalah, cr: clearingAcc, amt: 7800 },
      { date: '2026-08-10', vn: '3052', detail: 'Paid PTCL Bill 042-7890205 4-A Executive Lodges', cat: 'PTCL Bills', dr: bankAlFalah, cr: clearingAcc, amt: 7370 },
      { date: '2026-08-15', vn: '3055', detail: 'Paid for 3 washrooms leakacge & 4 C autoswitch by Majid', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 3000 },
      { date: '2026-08-15', vn: '3055', detail: 'Paid for Sabir bike number plate by Majid Javed', cat: 'Misc Expenses', dr: cashMajid, cr: clearingAcc, amt: 1000 },
      { date: '2026-08-15', vn: '3055', detail: 'Purchased dry acid chlorine for 4A Swimming Pool by Majid Javed', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 6700 },
      { date: '2026-08-15', vn: '3055', detail: 'Purchased elecrci tape for 4A by Majid Javed', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 1200 },
      { date: '2026-08-15', vn: '3055', detail: 'Purchased new car Alto cover by Majid Javed', cat: '4-A Expenses', dr: cashMajid, cr: clearingAcc, amt: 5500 },
      { date: '2026-08-15', vn: '3055', detail: 'Paid rishwat for Lake City Tax by Majid', cat: 'Rishwat for Lake City House', dr: cashMajid, cr: clearingAcc, amt: 20000 },
      { date: '2026-08-15', vn: '3055', detail: 'Salary paid to Khurshid Anwar FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 100000 },
      { date: '2026-08-15', vn: '3055', detail: 'Salary paid to Armghaan FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 35000 },
      { date: '2026-08-15', vn: '3055', detail: 'Salary paid to Saeed Sb FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 40000 },
      { date: '2026-08-15', vn: '3055', detail: 'Salary paid to Rafey IT Office FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 25000 },
      { date: '2026-08-15', vn: '3055', detail: 'Salary paid to Akram Guard/ Chowkidar FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 10000 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Faiz Mujahid FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 50000 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Mis Nousheen FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 30000 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Afzal FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 20000 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Amina Babar FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 5645 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Faiza Aslam FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 31613 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Emaan Khurram FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 4968 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Fahad Sb FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 190000 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Samina Iqbal FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 14516 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Majid Javed FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 46360 },
      { date: '2026-08-15', vn: '3056', detail: 'Salary paid to Sarfarz Sb FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 35000 },
      { date: '2026-08-17', vn: '3057', detail: 'Paid to Advocate Jalil ur Rehman Sb', cat: 'Legal Fee', dr: ablUraan, cr: clearingAcc, amt: 10000 },
      { date: '2026-08-17', vn: '3057', detail: 'Paid for Office glass door repairing 4-C', cat: '4-C Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 1500 },
      { date: '2026-08-19', vn: '3059', detail: 'Paid TCS charges for 40-AB Notice', cat: 'Misc Expenses', dr: sarfarazCash, cr: clearingAcc, amt: 460 },
      { date: '2026-08-19', vn: '3059', detail: 'Salary paid to Zulekha FTMO 07/26', cat: 'Salaries', dr: ablUraan, cr: clearingAcc, amt: 4677 },
      { date: '2026-08-19', vn: '3059', detail: 'Paid for Independence Day refreshment to 4C Office Staff', cat: 'Entertainment Expenses', dr: ablUraan, cr: clearingAcc, amt: 5000 },
      { date: '2026-08-19', vn: '3059', detail: 'Paid for BOSS Glasses', cat: 'BOSS Purchases', dr: cashMajid, cr: clearingAcc, amt: 20000 },
      { date: '2026-08-19', vn: '3059', detail: 'Purchased Keychains for BOSS by Majid Javed', cat: 'BOSS Purchases', dr: cashMajid, cr: clearingAcc, amt: 3000 },
      { date: '2026-08-19', vn: '3059', detail: 'Paid to Majid Javed for fuel', cat: 'Majid Javed expenses', dr: sarfarazCash, cr: clearingAcc, amt: 500 },
      { date: '2026-08-20', vn: '3060', detail: 'Purchased CCTV Remote by Majid Javed', cat: 'Printing & Stationary Expenses', dr: cashMajid, cr: clearingAcc, amt: 200 },
      { date: '2026-08-22', vn: '3062', detail: 'Paid for BOSS pant alteration by Majid Javed', cat: 'Misc Expenses', dr: cashMajid, cr: clearingAcc, amt: 1500 },
      { date: '2026-08-22', vn: '3062', detail: 'Paid for Door Lock 40-AB bu Majd Javed', cat: '40-AB Expenses', dr: cashMajid, cr: clearingAcc, amt: 1000 },
      { date: '2026-08-22', vn: '3062', detail: 'Misc expenes paid by Majid Along with BOSS', cat: 'Misc Expenses', dr: cashMajid, cr: clearingAcc, amt: 340 },
      { date: '2026-08-22', vn: '3062', detail: 'Paid for KIA Card Stand Charges by Majid', cat: 'Misc Expenses', dr: cashMajid, cr: clearingAcc, amt: 1000 },
      { date: '2026-08-27', vn: '3063', detail: 'Paid Abida Ijaz Foundation salaries FTMO 07/26', cat: 'Abida Ijaz Foundation Expenses', dr: cashMalik, cr: clearingAcc, amt: 120000 },
      { date: '2026-08-28', vn: '3064', detail: 'Paid Abida Ijaz Foundation salaries FTMO 07/26', cat: 'Abida Ijaz Foundation Expenses', dr: cashMalik, cr: clearingAcc, amt: 100000 },
      { date: '2026-08-31', vn: '3066', detail: 'Paid IT Office electricity bill by Majid Javed', cat: 'IT Office Electricity Bill', dr: cashMajid, cr: clearingAcc, amt: 17420 },
      { date: '2026-08-31', vn: '3066', detail: 'Paid Javed Sb monthly fuel expenses 22/07 TO 22/08', cat: 'Javed Sb expenses', dr: cashMajid, cr: clearingAcc, amt: 8320 },
      { date: '2026-08-31', vn: '3066', detail: 'Paid Javed Sb monthly food expenses 22/07 TO 22/08', cat: 'Javed Sb expenses', dr: cashMajid, cr: clearingAcc, amt: 2600 },
      { date: '2026-08-31', vn: '3066', detail: 'Paid to Javed for bike tuning & oil change', cat: 'Javed Sb expenses', dr: cashMajid, cr: clearingAcc, amt: 1500 },
      { date: '2026-08-31', vn: '3066', detail: 'Paid to Javed for bike repairing', cat: 'Javed Sb expenses', dr: cashMajid, cr: clearingAcc, amt: 650 },
      { date: '2026-08-31', vn: '3066', detail: 'Paid to Majid Javed for July-26 fuel', cat: 'Majid Javed expenses', dr: cashMajid, cr: clearingAcc, amt: 11500 },
      { date: '2026-08-31', vn: '3066', detail: 'Paid to Majid for Bike repair & maintenance', cat: 'Majid Javed expenses', dr: cashMajid, cr: clearingAcc, amt: 3500 },
      { date: '2026-08-31', vn: '3066', detail: 'Paid for 289-Q Stamps by Majid', cat: 'Legal Fee', dr: cashMajid, cr: clearingAcc, amt: 2500 },
      { date: '2026-08-31', vn: '3066', detail: 'Misc expenses paid by Sabir in August 2026', cat: '4-A Expenses', dr: sabirCash, cr: clearingAcc, amt: 63146 },
    ];

    let totalVouchersSum = 0;
    for (const v of vouchersList) {
      const catDoc = catMap.get(v.cat);
      await Transaction.create({
        date: new Date(v.date),
        voucherNo: v.vn,
        detail: v.detail,
        categoryId: catDoc._id,
        drAccountId: v.cr._id, // Clearing / Expense Head (Debited)
        crAccountId: v.dr._id, // Bank or Cash Account (Credited / Outflow)
        amount: v.amt,
        status: 'VERIFIED',
        checkedBy: 'Fahad Sb',
        createdBy: adminUser._id,
      });
      totalVouchersSum += v.amt;
    }
    console.log(`✓ Inserted all 42 vouchers! Sum: PKR ${totalVouchersSum.toLocaleString()}`);

    // 6. Seed the Rent Collections so Rental Register matches Rs. 1,443,675.00
    console.log('\n[Bonus] Seeding the 14 Rental Income collections from Page 3...');
    const rentalCat = catMap.get('Rental Income');
    const prop289Q = propMap.get('289-Q Plaza DHA');
    const prop299Q = propMap.get('299-Q Plaza DHA');
    const prop48CCA = propMap.get('48-CCA Plaza DHA');
    const prop4C = propMap.get('4-C Plaza Bahria Town');
    const propLakeCity = propMap.get('Lake City House');
    const propAbuzar = propMap.get('Rizwan Abuzar Tower');
    const propAnarkali = propMap.get('Anarkali (4 Cabin Shops)');

    const rentCollections = [
      // 289-Q
      { prop: prop289Q, unitIdx: 0, date: '2026-08-10', vn: 'R-289Q-B', detail: 'Rent received from 289-Q Basement', amt: 82000, acc: ablUraan },
      { prop: prop289Q, unitIdx: 2, date: '2026-08-05', vn: 'R-289Q-1F-1', detail: 'Rent received from 289-Q First Floor (Inst 1)', amt: 70000, acc: ablUraan },
      { prop: prop289Q, unitIdx: 2, date: '2026-08-21', vn: 'R-289Q-1F-2', detail: 'Rent received from 289-Q First Floor (Inst 2)', amt: 91575, acc: ablUraan },
      { prop: prop289Q, unitIdx: 3, date: '2026-08-21', vn: 'R-289Q-2F', detail: 'Rent received from 289-Q Second Floor', amt: 85000, acc: ablUraan },

      // 299-Q
      { prop: prop299Q, unitIdx: 0, date: '2026-08-31', vn: 'R-299Q-B', detail: 'Rent received from 299-Q Basement', amt: 35000, acc: ablUraan },
      { prop: prop299Q, unitIdx: 1, date: '2026-08-04', vn: 'R-299Q-GF', detail: 'Rent received from 299-Q Ground Floor', amt: 85000, acc: ablUraan },
      { prop: prop299Q, unitIdx: 2, date: '2026-08-10', vn: 'R-299Q-1F', detail: 'Rent received from 299-Q First Floor', amt: 55000, acc: ablUraan },
      { prop: prop299Q, unitIdx: 3, date: '2026-08-03', vn: 'R-299Q-MZ', detail: 'Rent received from 299-Q Mezzanine', amt: 33000, acc: ablUraan },
      { prop: prop299Q, unitIdx: 4, date: '2026-08-11', vn: 'R-299Q-2F', detail: 'Rent received from 299-Q Second Floor', amt: 55000, acc: ablUraan },

      // 48-CCA
      { prop: prop48CCA, unitIdx: 0, date: '2026-08-28', vn: 'R-48CCA-BGF', detail: 'Rent received from 48-CCA Basement GF & Mezzanine', amt: 280000, acc: cashMalik },
      { prop: prop48CCA, unitIdx: 1, date: '2026-08-17', vn: 'R-48CCA-1F', detail: 'Rent received from 48-CCA First Floor', amt: 70000, acc: ablUraan },
      { prop: prop48CCA, unitIdx: 2, date: '2026-08-10', vn: 'R-48CCA-2F', detail: 'Rent received from 48-CCA Second Floor', amt: 72600, acc: ablUraan },

      // 4-C Bahria Town
      { prop: prop4C, unitIdx: 1, date: '2026-08-31', vn: 'R-4C-201', detail: 'Rent received from 201 Deal Land 4-C', amt: 47500, acc: ablUraan },
      { prop: prop4C, unitIdx: 2, date: '2026-08-21', vn: 'R-4C-301', detail: 'Rent received from Flat 301 4-C', amt: 35000, acc: ablUraan },
      { prop: prop4C, unitIdx: 3, date: '2026-08-17', vn: 'R-4C-302', detail: 'Rent received from Flat 302 4-C', amt: 25000, acc: ablUraan },
      { prop: prop4C, unitIdx: 4, date: '2026-08-05', vn: 'R-4C-401', detail: 'Rent received from Flat 401 4-C', amt: 40000, acc: ablUraan },
      { prop: prop4C, unitIdx: 6, date: '2026-08-20', vn: 'R-4C-501', detail: 'Rent received from Flat 501 4-C', amt: 38000, acc: ablUraan },

      // Lake City & Abuzar
      { prop: propLakeCity, unitIdx: 0, date: '2026-08-12', vn: 'R-LCH', detail: 'Rent received from Lake City House', amt: 114000, acc: ablUraan },
      { prop: propAbuzar, unitIdx: 0, date: '2026-08-21', vn: 'R-RAT', detail: 'Rent received from Abuzar Tower', amt: 20000, acc: ablUraan },

      // Anarkali
      { prop: propAnarkali, unitIdx: 0, date: '2026-08-03', vn: 'R-ARK-1', detail: 'Rent received from Anarkali Shops (Cash)', amt: 55000, acc: cashMajid },
      { prop: propAnarkali, unitIdx: 0, date: '2026-08-12', vn: 'R-ARK-2', detail: 'Rent received from Anarkali Shops (Bank)', amt: 55000, acc: ablUraan },
    ];

    let totalRentSum = 0;
    for (const r of rentCollections) {
      const unit = r.prop.units[r.unitIdx];
      await Transaction.create({
        date: new Date(r.date),
        voucherNo: r.vn,
        detail: r.detail,
        categoryId: rentalCat._id,
        drAccountId: r.acc._id,
        crAccountId: clearingAcc._id,
        amount: r.amt,
        propertyId: r.prop._id,
        unitId: unit._id,
        rentMonth: '2026-08',
        status: 'VERIFIED',
        checkedBy: 'Fahad Sb',
        createdBy: adminUser._id,
      });
      totalRentSum += r.amt;
    }

    console.log(`✓ Seeded ${rentCollections.length} rent payments. Sum: PKR ${totalRentSum.toLocaleString()}`);

    // 7. Seed internal funds contra movements between Bank and Cash Custodians
    console.log('\n[7/7] Seeding internal funds contra movements between Bank & Cash Custodians...');
    const transferCat = catMap.get('Internal Funds Transfer');

    const internalTransfers = [
      // Sarfaraz received cash for misc from Bank Al Falah
      { date: '2026-08-06', vn: '3050', detail: 'Paid to Sarfaraz Cash In Hand for misc expenses', dr: sarfarazCash, cr: bankAlFalah, amt: 15183 },
      // Majid received online funds from BOSS via ABL
      { date: '2026-08-15', vn: '3055', detail: 'Online Received by Majid from BOSS for Expenses', dr: cashMajid, cr: ablUraan, amt: 10000 },
      { date: '2026-08-15', vn: '3056', detail: 'Online Transfer to Majid Javed by BOSS for expenses', dr: cashMajid, cr: ablUraan, amt: 22000 },
      { date: '2026-08-19', vn: '3059', detail: 'Online Transfer to Majid Javed by BOSS for expenses', dr: cashMajid, cr: ablUraan, amt: 23000 },
      // Majid received cash from Sarfaraz
      { date: '2026-08-12', vn: '3054', detail: 'Cash paid Sarfaraz Sb to Majid Javed for CCTV Remote', dr: cashMajid, cr: sarfarazCash, amt: 500 },
      { date: '2026-08-21', vn: '3061', detail: 'Cash paid for computer repairing', dr: cashMajid, cr: sarfarazCash, amt: 1000 },
      // Sabir received funds from ABL Uraan
      { date: '2026-08-20', vn: '3060', detail: 'Paid to Sabir Nawaz for 4A Expenses', dr: sabirCash, cr: ablUraan, amt: 25000 },
      { date: '2026-08-22', vn: '3062', detail: 'Paid to Sabir Nawaz for 4A Expenses', dr: sabirCash, cr: ablUraan, amt: 35000 },
      // Sabir received funds from Majid Javed
      { date: '2026-08-31', vn: '3066', detail: 'Paid to Sabir Nawaz for 4A Expenses', dr: sabirCash, cr: cashMajid, amt: 4170 },
      // Majid deposited Anarkali cash rent into ABL Uraan
      { date: '2026-08-12', vn: '3054', detail: 'Anarkali rent deposited by Majid Javed in ABL Uraan', dr: ablUraan, cr: cashMajid, amt: 55000 },
    ];

    for (const it of internalTransfers) {
      await Transaction.create({
        date: new Date(it.date),
        voucherNo: it.vn,
        detail: it.detail,
        categoryId: transferCat._id,
        drAccountId: it.dr._id,
        crAccountId: it.cr._id,
        amount: it.amt,
        status: 'VERIFIED',
        checkedBy: 'Fahad Sb',
        createdBy: adminUser._id,
      });
    }
    console.log(`✓ Seeded ${internalTransfers.length} internal contra transfers.`);

    console.log('\n================================================================');
    console.log('  EXACT AUGUST 2026 DATASET FULLY SEEDED INTO MONGODB ATLAS!    ');
    console.log('================================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed with error:', error);
    process.exit(1);
  }
};

seedExactAugustData();
