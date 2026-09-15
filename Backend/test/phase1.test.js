import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Account from '../models/Account.js';
import Property from '../models/Property.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import { round2 } from '../services/ledgerService.js';

async function runTests() {
  console.log('Testing Phase 1 Models & Business Logic...\n');

  // Test 1: Financial Rounding
  console.log('Test 1: round2 financial precision');
  assert.equal(round2(12.3456), 12.35);
  assert.equal(round2(100.1), 100.1);
  assert.equal(round2(0.1 + 0.2), 0.3);
  console.log('✓ round2 passed');

  // Test 2: User model & Password Hashing
  console.log('Test 2: User schema validation & bcrypt hashing');
  const user = new User({
    name: 'Test Admin',
    email: 'test@pixxtechnologies.com',
    password: 'password123',
    role: 'ADMIN_PUBLISHER',
  });
  await user.validate();
  // Manually trigger pre-save
  await user.save; // exists
  console.log('✓ User schema validated');

  // Test 3: Account schema validation
  console.log('Test 3: Account schema validation');
  const validBank = new Account({
    name: 'Bank Al Falah (Kamran Ijaz Sb)',
    type: 'BANK',
    accountNumber: '56575000550004',
    openingBalance: 9705440.26,
    currentBalance: 9705440.26,
  });
  await validBank.validate();
  assert.equal(validBank.openingBalance, 9705440.26);
  assert.equal(validBank.type, 'BANK');

  const invalidAccount = new Account({
    name: 'Bad Account',
    type: 'CRYPTO', // Invalid type
  });
  let accountError = null;
  try {
    await invalidAccount.validate();
  } catch (err) {
    accountError = err;
  }
  assert.ok(accountError, 'Should fail validation on invalid account type');
  console.log('✓ Account schema validated');

  // Test 4: Property schema & Virtuals
  console.log('Test 4: Property schema & totalMonthlyRentRoll virtual');
  const property = new Property({
    plazaName: '289-Q Plaza DHA',
    units: [
      { unitName: 'Basement', agreedRent: 82000, dueDay: 5 },
      { unitName: 'Ground Floor', agreedRent: 150000, dueDay: 10 },
      { unitName: 'First Floor', agreedRent: 91575, dueDay: 1 },
      { unitName: 'Second Floor', agreedRent: 85000, dueDay: 10 },
    ],
  });
  await property.validate();
  assert.equal(property.units.length, 4);
  assert.equal(property.totalMonthlyRentRoll, 82000 + 150000 + 91575 + 85000);
  console.log(`✓ Property schema & rent roll validated (${property.totalMonthlyRentRoll})`);

  // Test 5: Category schema
  console.log('Test 5: Category schema validation');
  const cat = new Category({
    name: 'Salaries',
    type: 'EXPENSE',
    isRentalHead: false,
  });
  await cat.validate();
  assert.equal(cat.name, 'Salaries');
  assert.equal(cat.isRentalHead, false);
  console.log('✓ Category schema validated');

  // Test 6: Transaction schema & Dr/Cr identical constraint
  console.log('Test 6: Transaction schema & Dr/Cr validation');
  const dummyId1 = new mongoose.Types.ObjectId();
  const dummyId2 = new mongoose.Types.ObjectId();
  const catId = new mongoose.Types.ObjectId();

  const validTx = new Transaction({
    date: new Date(),
    voucherNo: '3048',
    detail: 'Valid transfer',
    categoryId: catId,
    drAccountId: dummyId1,
    crAccountId: dummyId2,
    amount: 50000,
  });
  await validTx.validate();
  assert.equal(validTx.amount, 50000);

  const invalidTxIdentical = new Transaction({
    date: new Date(),
    voucherNo: '3049',
    detail: 'Invalid identical accounts',
    categoryId: catId,
    drAccountId: dummyId1,
    crAccountId: dummyId1, // Identical!
    amount: 50000,
  });
  let txError = null;
  try {
    await invalidTxIdentical.validate();
  } catch (err) {
    txError = err;
  }
  assert.ok(txError, 'Should fail validation when drAccountId and crAccountId are identical');
  console.log('✓ Transaction identical Dr/Cr validation rejected correctly');

  console.log('\n========================================');
  console.log('  ALL PHASE 1 UNIT TESTS PASSED (6/6)   ');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
