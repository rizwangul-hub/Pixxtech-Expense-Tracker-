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

// Resolve environment variables from Backend/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * Main Database Seeder Function
 */
const seedDatabase = async () => {
  try {
    console.log('=====================================================');
    console.log('  PIXX TECHNOLOGIES - FINANCIAL DATABASE SEED SCRIPT');
    console.log('=====================================================');

    await connectDB();

    // 1. Clear existing collections for an idempotent seed
    console.log('\n[1/5] Clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Account.deleteMany({}),
      Property.deleteMany({}),
      Category.deleteMany({}),
      Transaction.deleteMany({}),
    ]);
    console.log('✓ Existing collections cleared successfully.');

    // 2. Seed RBAC Users
    console.log('\n[2/5] Seeding Users with RBAC...');
    const users = await User.create([
      {
        name: 'Fahad Sb',
        email: 'fahad@pixxtechnologies.com',
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
    console.log(`✓ Seeded ${users.length} users:`);
    users.forEach((u) => console.log(`   - ${u.name} (${u.email}) [${u.role}]`));

    // 3. Seed Bank Accounts and Cash Custodians (August 2026 Opening Balances)
    console.log('\n[3/5] Seeding Bank Accounts & Cash Custodians...');
    const accountsData = [
      {
        name: 'Bank Al Falah (Kamran Ijaz Sb)',
        type: 'BANK',
        accountNumber: '56575000550004',
        branch: 'DHA Phase 5, Lahore',
        openingBalance: 9705440.26,
        currentBalance: 9705440.26,
      },
      {
        name: 'UBL (Kamran Ijaz Sb)',
        type: 'BANK',
        accountNumber: '1957-312896195',
        branch: 'Main Boulevard, Lahore',
        openingBalance: 12528.60,
        currentBalance: 12528.60,
      },
      {
        name: 'UBL (Uraan Ventures)',
        type: 'BANK',
        accountNumber: '2105-894561234',
        branch: 'Gulberg III, Lahore',
        openingBalance: 29113.79,
        currentBalance: 29113.79,
      },
      {
        name: 'ABL (Kamran Ijaz Sb)',
        type: 'BANK',
        accountNumber: '001002587410019',
        branch: 'Bahria Town, Lahore',
        openingBalance: 1460136.27,
        currentBalance: 1460136.27,
      },
      {
        name: 'ABL (Uraan Ventures)',
        type: 'BANK',
        accountNumber: '001009874563214',
        branch: 'DHA Phase 3, Lahore',
        openingBalance: 1146558.36,
        currentBalance: 1146558.36,
      },
      {
        name: 'Cash in Hand (Sarfaraz Sb)',
        type: 'CASH',
        openingBalance: 0.00,
        currentBalance: 0.00,
      },
      {
        name: 'Cash in Hand (Malik Naveed)',
        type: 'CASH',
        openingBalance: 0.00,
        currentBalance: 0.00,
      },
      {
        name: 'Cash in Hand (Sabir Nawaz)',
        type: 'CASH',
        openingBalance: 0.00,
        currentBalance: 0.00,
      },
      {
        name: 'Cash in Hand (Majid Javed)',
        type: 'CASH',
        openingBalance: 13267.00,
        currentBalance: 13267.00,
      },
      // System clearing account for external receipts and direct operational disbursements
      {
        name: 'External Parties / Operations Clearing',
        type: 'CASH',
        openingBalance: 0.00,
        currentBalance: 0.00,
        notes: 'Clearing account for direct tenant inflows and vendor disbursements',
      },
    ];

    const accounts = await Account.create(accountsData);
    const accountMap = new Map(accounts.map((a) => [a.name, a]));
    console.log(`✓ Seeded ${accounts.length} accounts:`);
    accounts.forEach((a) =>
      console.log(`   - [${a.type}] ${a.name} -> Opening: PKR ${a.openingBalance.toLocaleString()}`)
    );

    // 4. Seed Standard Account Heads (Categories)
    console.log('\n[4/5] Seeding Standard Categories / Account Heads...');
    const categoriesData = [
      // Income Heads
      { name: 'Rental Income', type: 'INCOME', isRentalHead: true },
      { name: 'Other Income', type: 'INCOME', isRentalHead: false },
      { name: 'Bank Profit / Return', type: 'INCOME', isRentalHead: false },

      // Transfer Heads
      { name: 'Internal Funds Transfer', type: 'TRANSFER', isRentalHead: false },
      { name: 'Cash Withdrawal from Bank', type: 'TRANSFER', isRentalHead: false },

      // Rental Maintenance & Specific Property Expense Heads
      { name: 'Repair & Maintenance', type: 'EXPENSE', isRentalHead: true },
      { name: 'Flat 502 Expenses', type: 'EXPENSE', isRentalHead: true },
      { name: 'Flat 301 Expenses', type: 'EXPENSE', isRentalHead: true },

      // Operational & General Expense Heads
      { name: 'Salaries', type: 'EXPENSE', isRentalHead: false },
      { name: '4-A Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: '4-C Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Abida Ijaz Foundation Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'IT Office Electricity Bill', type: 'EXPENSE', isRentalHead: false },
      { name: 'PTCL Bills', type: 'EXPENSE', isRentalHead: false },
      { name: 'Legal Fee', type: 'EXPENSE', isRentalHead: false },
      { name: 'Entertainment Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Printing & Stationary Expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'BOSS Purchases', type: 'EXPENSE', isRentalHead: false },
      { name: 'Javed Sb expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Majid Javed expenses', type: 'EXPENSE', isRentalHead: false },
      { name: 'Misc Expenses', type: 'EXPENSE', isRentalHead: false },
    ];

    const categories = await Category.create(categoriesData);
    const categoryMap = new Map(categories.map((c) => [c.name, c]));
    console.log(`✓ Seeded ${categories.length} categories:`);
    categories.forEach((c) => console.log(`   - [${c.type}] ${c.name} (Rental: ${c.isRentalHead})`));

    // 5. Seed Plazas & Commercial / Residential Units
    console.log('\n[5/5] Seeding Properties, Plazas & Leasable Units...');
    const bankAlFalah = accountMap.get('Bank Al Falah (Kamran Ijaz Sb)');
    const ublKamran = accountMap.get('UBL (Kamran Ijaz Sb)');
    const ablKamran = accountMap.get('ABL (Kamran Ijaz Sb)');

    const propertiesData = [
      {
        plazaName: '289-Q Plaza DHA',
        units: [
          {
            unitName: 'Basement',
            tenantName: 'Commercial Tenant',
            dueDay: 5,
            agreedRent: 82000,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: 'Ground Floor (Bank Al-Falah)',
            tenantName: 'Bank Al Falah Ltd',
            dueDay: 10,
            agreedRent: 150000,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: 'First Floor',
            tenantName: 'Corporate Office',
            dueDay: 1,
            agreedRent: 91575,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: 'Second Floor',
            tenantName: 'IT Solutions Firm',
            dueDay: 10,
            agreedRent: 85000,
            defaultReceivingAccountId: bankAlFalah._id,
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
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: 'Ground Floor',
            tenantName: 'Retail Brand',
            dueDay: 5,
            agreedRent: 85000,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: 'First Floor',
            tenantName: 'Consultancy Office',
            dueDay: 1,
            agreedRent: 55000,
            defaultReceivingAccountId: ublKamran._id,
          },
          {
            unitName: 'Mezzanine',
            tenantName: 'Studio Office',
            dueDay: 1,
            agreedRent: 33000,
            defaultReceivingAccountId: ublKamran._id,
          },
          {
            unitName: 'Second Floor',
            tenantName: 'Design House',
            dueDay: 10,
            agreedRent: 55000,
            defaultReceivingAccountId: bankAlFalah._id,
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
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: 'First Floor',
            tenantName: 'Marketing Agency',
            dueDay: 5,
            agreedRent: 72600,
            defaultReceivingAccountId: ablKamran._id,
          },
          {
            unitName: 'Second Floor',
            tenantName: 'Software Consultancy',
            dueDay: 5,
            agreedRent: 72600,
            defaultReceivingAccountId: ablKamran._id,
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
            defaultReceivingAccountId: ablKamran._id,
          },
          {
            unitName: '2nd Floor Deal Land (201)',
            tenantName: 'Deal Land Real Estate',
            dueDay: 5,
            agreedRent: 47500,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: '3rd Floor Back (301)',
            tenantName: 'Executive Suites',
            dueDay: 5,
            agreedRent: 35000,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: '3rd Floor Back (302)',
            tenantName: 'Studio Apartment',
            dueDay: 15,
            agreedRent: 25000,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: '4th Floor Front (401)',
            tenantName: 'Law Associates',
            dueDay: 5,
            agreedRent: 40000,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: '4th Floor Back (402)',
            tenantName: 'Tech Hub',
            dueDay: 5,
            agreedRent: 39930,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: '5th Floor Front (501)',
            tenantName: 'Creative Studio',
            dueDay: 10,
            agreedRent: 38000,
            defaultReceivingAccountId: bankAlFalah._id,
          },
          {
            unitName: '5th Floor Front (502)',
            tenantName: 'Dr. Consultation Clinic',
            dueDay: 10,
            agreedRent: 38000,
            defaultReceivingAccountId: bankAlFalah._id,
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
            defaultReceivingAccountId: bankAlFalah._id,
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
            defaultReceivingAccountId: bankAlFalah._id,
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
            defaultReceivingAccountId: bankAlFalah._id,
          },
        ],
      },
    ];

    const properties = await Property.create(propertiesData);
    console.log(`✓ Seeded ${properties.length} properties/plazas:`);
    let totalPortfolioRent = 0;
    properties.forEach((p) => {
      const plazaRent = p.totalMonthlyRentRoll;
      totalPortfolioRent += plazaRent;
      console.log(
        `   - ${p.plazaName}: ${p.units.length} units (Monthly Rent Roll: PKR ${plazaRent.toLocaleString()})`
      );
    });
    console.log(`\n  >> Total Portfolio Monthly Rent Roll: PKR ${totalPortfolioRent.toLocaleString()} <<`);

    // 6. Optional: Create initial representative sample transactions for August 2026 to verify ledger
    console.log('\n[Bonus] Seeding initial verified August 2026 double-entry vouchers...');
    const clearingAccount = accountMap.get('External Parties / Operations Clearing');
    const cashMajid = accountMap.get('Cash in Hand (Majid Javed)');
    const rentalCat = categoryMap.get('Rental Income');
    const salariesCat = categoryMap.get('Salaries');
    const ptclCat = categoryMap.get('PTCL Bills');
    const foundationCat = categoryMap.get('Abida Ijaz Foundation Expenses');
    const internalTransferCat = categoryMap.get('Internal Funds Transfer');
    const adminUser = users[0];

    // Transaction 1: Rent received from Allied Bank into ABL
    const prop4C = properties.find((p) => p.plazaName === '4-C Plaza Bahria Town');
    const unitAllied = prop4C.units.find((u) => u.unitName.includes('Allied Bank'));
    await createTransaction({
      date: new Date('2026-08-08'),
      voucherNo: '3048',
      detail: 'August 2026 Rent received - Allied Bank Ltd (4-C Bahria Town)',
      categoryId: rentalCat._id,
      drAccountId: ablKamran._id, // Bank receives funds (debit)
      crAccountId: clearingAccount._id, // Tenant clearing (credit)
      amount: 216250,
      propertyId: prop4C._id,
      unitId: unitAllied._id,
      rentMonth: '2026-08',
      status: 'VERIFIED',
      checkedBy: 'Fahad Sb',
      createdBy: adminUser._id,
    });

    // Transaction 2: Bank transfer from Bank Al Falah to Majid Javed for operational expenses
    await createTransaction({
      date: new Date('2026-08-10'),
      voucherNo: '3049',
      detail: 'Cash withdrawal transferred to Majid Javed for staff salaries and utilities',
      categoryId: internalTransferCat._id,
      drAccountId: cashMajid._id, // Majid Javed cash in hand increases (debit)
      crAccountId: bankAlFalah._id, // Bank Al Falah decreases (credit)
      amount: 500000,
      rentMonth: '2026-08',
      status: 'VERIFIED',
      checkedBy: 'Fahad Sb',
      createdBy: adminUser._id,
    });

    // Transaction 3: Salaries disbursed from Majid Javed's cash
    await createTransaction({
      date: new Date('2026-08-11'),
      voucherNo: '3050',
      detail: 'Staff salaries disbursed for August 2026',
      categoryId: salariesCat._id,
      drAccountId: clearingAccount._id, // Operations clearing
      crAccountId: cashMajid._id, // Majid Javed cash decreases (credit)
      amount: 350000,
      rentMonth: '2026-08',
      status: 'VERIFIED',
      checkedBy: 'Fahad Sb',
      createdBy: adminUser._id,
    });

    // Transaction 4: PTCL Bills paid from Majid Javed's cash
    await createTransaction({
      date: new Date('2026-08-12'),
      voucherNo: '3051',
      detail: 'PTCL broadband and corporate internet bill paid',
      categoryId: ptclCat._id,
      drAccountId: clearingAccount._id,
      crAccountId: cashMajid._id,
      amount: 18500,
      rentMonth: '2026-08',
      status: 'VERIFIED',
      checkedBy: 'Fahad Sb',
      createdBy: adminUser._id,
    });

    // Transaction 5: Abida Ijaz Foundation contribution from Bank Al Falah
    await createTransaction({
      date: new Date('2026-08-15'),
      voucherNo: '3052',
      detail: 'Monthly donation to Abida Ijaz Foundation',
      categoryId: foundationCat._id,
      drAccountId: clearingAccount._id,
      crAccountId: bankAlFalah._id,
      amount: 100000,
      rentMonth: '2026-08',
      status: 'VERIFIED',
      checkedBy: 'Fahad Sb',
      createdBy: adminUser._id,
    });

    console.log('✓ Seeded 5 initial double-entry voucher transactions.');
    console.log('\n=====================================================');
    console.log('  PIXX TECHNOLOGIES DATABASE SEEDED SUCCESSFULLY!    ');
    console.log('=====================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed with error:', error);
    process.exit(1);
  }
};

seedDatabase();
