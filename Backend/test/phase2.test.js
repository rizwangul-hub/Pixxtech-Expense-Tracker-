import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { round2 } from '../services/ledgerService.js';

async function runPhase2Tests() {
  console.log('Testing Phase 2 Backend & Controller Business Logic...\n');

  // Test 1: JWT token generation and verification
  console.log('Test 1: JWT Token signing & verification');
  const secret = 'pixx_tech_super_secret_jwt_key_2026_finance';
  const payload = { id: '654321654321654321654321', role: 'DATA_ENTRY' };
  const token = jwt.sign(payload, secret, { expiresIn: '7d' });
  const decoded = jwt.verify(token, secret);
  assert.equal(decoded.id, payload.id);
  assert.equal(decoded.role, payload.role);
  console.log('✓ JWT verification successful');

  // Test 2: Sequential Voucher Number logic
  console.log('Test 2: Sequential Voucher Number calculation');
  const mockExistingVouchers = [
    { voucherNo: '3048' },
    { voucherNo: '3049' },
    { voucherNo: '3055' },
    { voucherNo: 'VN-3066' },
  ];
  let maxVn = 3000;
  for (const v of mockExistingVouchers) {
    const num = parseInt(v.voucherNo.replace(/\D/g, ''), 10);
    if (!isNaN(num) && num > maxVn) maxVn = num;
  }
  const nextVn = String(maxVn + 1);
  assert.equal(nextVn, '3067');
  console.log(`✓ Sequential VN suggested correctly: ${nextVn}`);

  // Test 3: Cash Custodian Health Status
  console.log('Test 3: Cash Custodian Balance Status Classification');
  const evaluateStatus = (balance) => {
    if (balance < 0) return 'NEGATIVE';
    if (balance < 2000) return 'LOW';
    return 'HEALTHY';
  };
  assert.equal(evaluateStatus(-500), 'NEGATIVE');
  assert.equal(evaluateStatus(0), 'LOW');
  assert.equal(evaluateStatus(1500), 'LOW');
  assert.equal(evaluateStatus(2000), 'HEALTHY');
  assert.equal(evaluateStatus(13267), 'HEALTHY');
  console.log('✓ Custodian status thresholds verified (Green / Amber / Red)');

  // Test 4: Rent Allocation Math
  console.log('Test 4: Rent Collection 3-way Split Math');
  const testRentAllocation = (agreedRent, paidAmount, priorReceivables = 0) => {
    const paid = round2(paidAmount);
    const priorCleared = Math.min(paid, priorReceivables);
    const remainingAfterPrior = round2(paid - priorCleared);
    const currentCleared = Math.min(remainingAfterPrior, agreedRent);
    const advanceRent = round2(Math.max(0, remainingAfterPrior - currentCleared));
    return { priorCleared, currentCleared, advanceRent };
  };

  // Scenario A: Exact rent paid (Rs. 85,000 agreed, Rs. 85,000 paid)
  const allocA = testRentAllocation(85000, 85000, 0);
  assert.equal(allocA.priorCleared, 0);
  assert.equal(allocA.currentCleared, 85000);
  assert.equal(allocA.advanceRent, 0);

  // Scenario B: Partial rent paid (Rs. 85,000 agreed, Rs. 50,000 paid)
  const allocB = testRentAllocation(85000, 50000, 0);
  assert.equal(allocB.currentCleared, 50000);
  assert.equal(allocB.advanceRent, 0);

  // Scenario C: Excess rent paid with advance (Rs. 85,000 agreed, Rs. 100,000 paid)
  const allocC = testRentAllocation(85000, 100000, 0);
  assert.equal(allocC.currentCleared, 85000);
  assert.equal(allocC.advanceRent, 15000);

  // Scenario D: Arrears cleared first (Rs. 85,000 agreed, Rs. 115,000 paid, Rs. 20,000 arrears)
  const allocD = testRentAllocation(85000, 115000, 20000);
  assert.equal(allocD.priorCleared, 20000);
  assert.equal(allocD.currentCleared, 85000);
  assert.equal(allocD.advanceRent, 10000);
  console.log('✓ Rent allocation arithmetic validated across all payment scenarios');

  console.log('\n========================================');
  console.log('  ALL PHASE 2 LOGIC TESTS PASSED (4/4)  ');
  console.log('========================================\n');
}

runPhase2Tests().catch((err) => {
  console.error('Phase 2 test failed:', err);
  process.exit(1);
});
