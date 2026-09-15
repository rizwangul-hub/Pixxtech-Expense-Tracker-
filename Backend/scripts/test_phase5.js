import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';
import RentReceived from '../models/RentReceived.js';
import RentDue from '../models/RentDue.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Tenant from '../models/Tenant.js';
import Property from '../models/Property.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = 'http://127.0.0.1:5000/api';

async function main() {
  console.log('\n======================================================');
  console.log('  PHASE 5 COMPREHENSIVE AUTOMATED VERIFICATION');
  console.log('  Pixx Technologies Property Finance & Expense System');
  console.log('======================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Authenticate as System Administrator
  console.log('1. Authenticating as System Administrator...');
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@pixxtechnologies.com', password: 'admin12345' }),
  });
  const adminLoginData = await adminLoginRes.json();
  assert(adminLoginRes.status === 200, 'Admin login returns HTTP 200');
  const adminToken = adminLoginData.data?.token || adminLoginData.token;
  assert(Boolean(adminToken), 'Admin token received');

  // 2. Authenticate as Data Entry Operator
  console.log('\n2. Authenticating as Data Entry Operator...');
  const entryLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'entry@pixxtechnologies.com', password: 'entry12345' }),
  });
  const entryLoginData = await entryLoginRes.json();
  assert(entryLoginRes.status === 200, 'Data Entry login returns HTTP 200');
  const entryToken = entryLoginData.data?.token || entryLoginData.token;
  assert(Boolean(entryToken), 'Data Entry token received');

  // 3. Find or Set Up Active Test Entities (Tenant, Property, Agreement, Bank & Cash Accounts)
  console.log('\n3. Resolving Active Test Entities for Rental Cycle...');
  const [tenantsRes, propertiesRes, accountsRes] = await Promise.all([
    fetch(`${API_BASE}/tenants?limit=10`, { headers: { Authorization: `Bearer ${adminToken}` } }),
    fetch(`${API_BASE}/properties?limit=5`, { headers: { Authorization: `Bearer ${adminToken}` } }),
    fetch(`${API_BASE}/accounts?limit=20`, { headers: { Authorization: `Bearer ${adminToken}` } }),
  ]);

  const tenantsData = await tenantsRes.json();
  const propertiesData = await propertiesRes.json();
  const accountsData = await accountsRes.json();

  const tenants = tenantsData.data?.tenants || [];
  const properties = propertiesData.data?.properties || [];
  const accounts = accountsData.data?.accounts || [];

  assert(tenants.length > 0, 'Found registered tenants in database');
  assert(properties.length > 0, 'Found registered properties in database');
  assert(accounts.length >= 2, 'Found active bank and cash accounts in database');

  const bankAccount = accounts.find((a) => a.type === 'BANK');
  const cashAccount = accounts.find((a) => a.type === 'CASH');
  assert(Boolean(bankAccount), `Active Bank Account found: ${bankAccount?.name}`);
  assert(Boolean(cashAccount), `Active Cash Custodian found: ${cashAccount?.name}`);

  // 4. Create Dedicated Test Property, Unit, Tenant, and Rental Agreement
  console.log('\n4. Setting up Isolated Test Tenancy Pipeline...');
  const timestamp = Date.now().toString().slice(-4);

  // Connect direct to mongo for fast test harness setup
  await mongoose.connect(process.env.MONGO_URI);

  // Clean any previous partial test runs
  const prevTenants = await Tenant.find({ fullName: /^Test Tenant Phase5/ });
  const prevTenantIds = prevTenants.map((t) => t._id);
  const prevProps = await Property.find({ plazaName: /^Phase5 Test Plaza/ });
  const prevPropIds = prevProps.map((p) => p._id);
  await RentReceived.deleteMany({ tenantId: { $in: prevTenantIds } });
  await Transaction.deleteMany({ tenantId: { $in: prevTenantIds } });
  await RentDue.deleteMany({ tenantId: { $in: prevTenantIds } });
  await RentalAgreement.deleteMany({ tenantId: { $in: prevTenantIds } });
  await Property.deleteMany({ _id: { $in: prevPropIds } });
  await Tenant.deleteMany({ _id: { $in: prevTenantIds } });

  const testTenant = await Tenant.create({
    fullName: `Test Tenant Phase5 ${timestamp}`,
    phone: `0300999${timestamp}`,
    email: `tenant${timestamp}@test.com`,
    city: 'Lahore',
    isActive: true,
  });
  assert(Boolean(testTenant._id), 'Test Tenant created');

  const testProperty = await Property.create({
    plazaName: `Phase5 Test Plaza ${timestamp}`,
    location: 'Gulberg III, Lahore',
    city: 'Lahore',
    totalUnits: 1,
    units: [
      {
        unitNumber: 'T-101',
        unitName: 'Shop T-101',
        unitType: 'SHOP',
        floor: 'Ground',
        agreedRent: 50000,
        status: 'VACANT',
        isActive: true,
      },
    ],
  });
  const testUnitId = testProperty.units[0]._id;
  assert(Boolean(testProperty._id), 'Test Property and Unit created');

  const testAgreement = await RentalAgreement.create({
    agreementNumber: `AGR-P5-${timestamp}`,
    tenantId: testTenant._id,
    propertyId: testProperty._id,
    unitId: testUnitId,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2027-06-30'),
    monthlyRent: 50000,
    dueDay: 5,
    status: 'ACTIVE',
  });
  assert(Boolean(testAgreement._id), 'Test Rental Agreement created');

  // Create two RentDue records: July-2026 (prior month) and August-2026 (current month)
  const priorDue = await RentDue.create({
    agreementId: testAgreement._id,
    tenantId: testTenant._id,
    propertyId: testProperty._id,
    unitId: testUnitId,
    rentMonth: '2026-07',
    dueDate: new Date('2026-07-05'),
    expectedRentAmount: 50000,
    status: 'DUE',
  });

  const currentDue = await RentDue.create({
    agreementId: testAgreement._id,
    tenantId: testTenant._id,
    propertyId: testProperty._id,
    unitId: testUnitId,
    rentMonth: '2026-08',
    dueDate: new Date('2026-08-05'),
    expectedRentAmount: 50000,
    status: 'DUE',
  });
  assert(Boolean(priorDue._id) && Boolean(currentDue._id), 'Created July-2026 (Prior) and August-2026 (Current) RentDue records');

  // 5. Test Helper Endpoint: GET /api/rent-received/tenant-lease/:tenantId
  console.log('\n5. Testing Tenant Active Lease Helper API...');
  const leaseRes = await fetch(`${API_BASE}/rent-received/tenant-lease/${testTenant._id}?month=2026-08`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const leaseData = await leaseRes.json();
  assert(leaseRes.status === 200, 'Tenant lease helper returns HTTP 200');
  assert(leaseData.data?.hasActiveAgreement === true, 'Helper identifies active agreement');
  assert(leaseData.data?.remainingCurrentDue === 50000, 'Identifies remaining current due = 50,000');
  assert(leaseData.data?.priorOutstandingAmount === 50000, 'Identifies prior overdue = 50,000');

  // 6. Test Relationship & Payment Method Validation Constraints
  console.log('\n6. Testing Business Validation & Relationship Constraints...');
  // Negative amount
  const negRes = await fetch(`${API_BASE}/rent-received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      tenantId: testTenant._id,
      agreementId: testAgreement._id,
      receivingAccountId: bankAccount._id,
      amount: -5000,
      rentMonth: '2026-08',
    }),
  });
  assert(negRes.status === 400, 'Negative receipt amount blocked (HTTP 400)');

  // BANK_TRANSFER to CASH account
  const methodMismatchRes = await fetch(`${API_BASE}/rent-received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      tenantId: testTenant._id,
      agreementId: testAgreement._id,
      receivingAccountId: cashAccount._id,
      paymentMethod: 'BANK_TRANSFER',
      amount: 10000,
      rentMonth: '2026-08',
    }),
  });
  assert(methodMismatchRes.status === 400, 'BANK_TRANSFER to Cash account rejected with HTTP 400');

  // CASH to BANK account
  const cashMismatchRes = await fetch(`${API_BASE}/rent-received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      tenantId: testTenant._id,
      agreementId: testAgreement._id,
      receivingAccountId: bankAccount._id,
      paymentMethod: 'CASH',
      amount: 10000,
      rentMonth: '2026-08',
    }),
  });
  assert(cashMismatchRes.status === 400, 'CASH payment to Bank account rejected with HTTP 400');

  // 7. Test Partial Payment 1: Recording 30,000 against August-2026 (without prior allocation)
  console.log('\n7. Recording Partial Rent Payment 1 (Rs. 30,000 into Cash Custodian)...');
  const cashBalBefore = (await Account.findById(cashAccount._id)).currentBalance || 0;

  const part1Res = await fetch(`${API_BASE}/rent-received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${entryToken}` },
    body: JSON.stringify({
      tenantId: testTenant._id,
      agreementId: testAgreement._id,
      rentDueId: currentDue._id,
      receivingAccountId: cashAccount._id,
      paymentMethod: 'CASH',
      amount: 30000,
      rentMonth: '2026-08',
      receiptDate: '2026-08-03',
      allocatePriorReceivable: false,
      checkedBy: 'Fahad',
      description: 'First partial rent payment for August',
    }),
  });
  const part1Data = await part1Res.json();
  assert(part1Res.status === 201, 'Data Entry records partial rent payment 1 (HTTP 201)');
  assert(part1Data.success === true, 'Partial payment 1 success is true');
  assert(part1Data.data?.breakdown?.allocatedToCurrentMonth === 30000, 'Allocated 30,000 to current month');
  assert(part1Data.data?.breakdown?.remainingCurrentMonthDue === 20000, 'Remaining current month due is 20,000');

  // Verify Cash Custodian Balance Updated
  const cashBalAfter1 = (await Account.findById(cashAccount._id)).currentBalance || 0;
  assert(cashBalAfter1 === cashBalBefore + 30000, `Cash custodian balance increased by 30,000 (${cashBalBefore} -> ${cashBalAfter1})`);

  // Verify RentDue status is PARTIAL
  const currentDueAfter1 = await RentDue.findById(currentDue._id);
  assert(currentDueAfter1.status === 'PARTIAL', 'Current month RentDue status transitioned to PARTIAL');

  // Verify Financial Journal Transaction created
  const tx1 = await Transaction.findById(part1Data.data?.transaction?._id);
  assert(Boolean(tx1), 'Double-entry transaction voucher created');
  assert(tx1.transactionType === 'INCOME', 'Transaction type is strictly INCOME (not EXPENSE or TRANSFER)');
  assert(tx1.amount === 30000, 'Transaction amount is Rs. 30,000');

  // 8. Test Partial Payment 2: Recording 20,000 (completing August-2026 rent)
  console.log('\n8. Recording Partial Rent Payment 2 (Rs. 20,000 completing August-2026 rent)...');
  const part2Res = await fetch(`${API_BASE}/rent-received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${entryToken}` },
    body: JSON.stringify({
      tenantId: testTenant._id,
      agreementId: testAgreement._id,
      rentDueId: currentDue._id,
      receivingAccountId: cashAccount._id,
      paymentMethod: 'CASH',
      amount: 20000,
      rentMonth: '2026-08',
      receiptDate: '2026-08-08',
      allocatePriorReceivable: false,
    }),
  });
  const part2Data = await part2Res.json();
  assert(part2Res.status === 201, 'Partial payment 2 recorded (HTTP 201)');

  // Verify RentDue status is now PAID
  const currentDueAfter2 = await RentDue.findById(currentDue._id);
  assert(currentDueAfter2.status === 'PAID', 'Current month RentDue status transitioned to PAID');
  assert(part2Data.data?.breakdown?.remainingCurrentMonthDue === 0, 'Current month remaining due is now 0');

  // 9. Test Overpayment & Advance Rent Surplus
  console.log('\n9. Testing Overpayment & Advance Rent Isolation...');
  const bankBalBefore = (await Account.findById(bankAccount._id)).currentBalance || 0;

  const overpayRes = await fetch(`${API_BASE}/rent-received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      tenantId: testTenant._id,
      agreementId: testAgreement._id,
      rentDueId: currentDue._id, // August is already paid in full
      receivingAccountId: bankAccount._id,
      paymentMethod: 'BANK_TRANSFER',
      amount: 25000,
      rentMonth: '2026-08',
      receiptDate: '2026-08-15',
      allocatePriorReceivable: false,
      referenceNumber: 'ONL-TRF-98210',
    }),
  });
  const overpayData = await overpayRes.json();
  assert(overpayRes.status === 201, 'Overpayment recorded (HTTP 201)');
  assert(overpayData.data?.breakdown?.allocatedToCurrentMonth === 0, '0 allocated to current month (already paid in full)');
  assert(overpayData.data?.breakdown?.allocatedToAdvance === 25000, 'Entire Rs. 25,000 strictly classified as Advance Rent');

  const bankBalAfter = (await Account.findById(bankAccount._id)).currentBalance || 0;
  assert(bankBalAfter === bankBalBefore + 25000, `Bank Account balance increased by 25,000 (${bankBalBefore} -> ${bankBalAfter})`);

  // 10. Test Previous-Month (July-2026) Overdue Allocation
  console.log('\n10. Testing Prior Month Overdue Receivable Allocation...');
  const priorPayRes = await fetch(`${API_BASE}/rent-received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      tenantId: testTenant._id,
      agreementId: testAgreement._id,
      receivingAccountId: bankAccount._id,
      paymentMethod: 'BANK_TRANSFER',
      amount: 50000,
      rentMonth: '2026-08',
      allocatePriorReceivable: true,
      description: 'Clearing July-2026 overdue rent',
    }),
  });
  const priorPayData = await priorPayRes.json();
  assert(priorPayRes.status === 201, 'Prior month overdue payment recorded (HTTP 201)');
  assert(priorPayData.data?.breakdown?.allocatedToPreviousReceivables === 50000, 'Rs. 50,000 allocated to prior overdue');

  const priorDueAfter = await RentDue.findById(priorDue._id);
  assert(priorDueAfter.status === 'PAID', 'Prior month (July-2026) RentDue status transitioned to PAID');

  // 11. Test Rental Income Summary Aggregates
  console.log('\n11. Testing Monthly Rental Income Summary Endpoint...');
  const summaryRes = await fetch(`${API_BASE}/rent-received/summary?month=2026-08`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const summaryData = await summaryRes.json();
  assert(summaryRes.status === 200, 'Rental Income Summary returns HTTP 200');
  assert(summaryData.data?.totalActualReceived > 0, 'Total actual received is calculated from real DB records');
  assert(summaryData.data?.advanceRentReceived >= 25000, 'Advance rent surplus is tracked distinctly');

  // 12. Test Property-Wise and Account-Wise Summaries
  console.log('\n12. Testing Property-Wise & Account-Wise Summaries...');
  const [propSumRes, accSumRes] = await Promise.all([
    fetch(`${API_BASE}/rent-received/property-summary?month=2026-08`, { headers: { Authorization: `Bearer ${adminToken}` } }),
    fetch(`${API_BASE}/rent-received/account-summary?month=2026-08`, { headers: { Authorization: `Bearer ${adminToken}` } }),
  ]);
  const propSumData = await propSumRes.json();
  const accSumData = await accSumRes.json();

  assert(propSumRes.status === 200, 'Property summary returns HTTP 200');
  assert(propSumData.data?.properties?.length > 0, 'Property summary returns active properties list');

  assert(accSumRes.status === 200, 'Account summary returns HTTP 200');
  assert(accSumData.data?.accounts?.length > 0, 'Account summary returns collection breakdown');

  // 13. Test Reversal Safety
  console.log('\n13. Testing Reversal Safety on Rent Receipt...');
  const bankBalBeforeRev = (await Account.findById(bankAccount._id)).currentBalance || 0;
  const receiptToReverse = overpayData.data?.receipt?._id;
  const revRes = await fetch(`${API_BASE}/rent-received/${receiptToReverse}/reverse`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: 'Accidental double entry test' }),
  });
  const revData = await revRes.json();
  assert(revRes.status === 200, 'Reversal endpoint returns HTTP 200');
  assert(revData.data?.receipt?.status === 'REVERSED', 'Receipt status marked REVERSED');

  const bankBalAfterRev = (await Account.findById(bankAccount._id)).currentBalance || 0;
  assert(bankBalAfterRev === bankBalBeforeRev - 25000, `Receiving bank balance restored after reversal (${bankBalBeforeRev} -> ${bankBalAfterRev})`);

  // 14. Cleanup Test Pipeline
  console.log('\n14. Cleaning up temporary Phase 5 test records...');
  await RentReceived.deleteMany({ agreementId: testAgreement._id });
  await Transaction.deleteMany({ agreementId: testAgreement._id });
  await RentDue.deleteMany({ agreementId: testAgreement._id });
  await RentalAgreement.findByIdAndDelete(testAgreement._id);
  await Property.findByIdAndDelete(testProperty._id);
  await Tenant.findByIdAndDelete(testTenant._id);

  // Restore bank/cash account balances from test payments 1 & 2 & prior
  await Account.findByIdAndUpdate(cashAccount._id, { $inc: { currentBalance: -50000 } });
  await Account.findByIdAndUpdate(bankAccount._id, { $inc: { currentBalance: -50000 } });

  await mongoose.disconnect();
  console.log('  [PASS] Cleaned up temporary test records cleanly.');
  totalTests++;
  passedTests++;

  console.log('\n======================================================');
  console.log(`  ALL ${passedTests} / ${totalTests} TESTS PASSED CLEANLY!`);
  console.log('  PHASE 5 IMPLEMENTATION FULLY VERIFIED.');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL TEST FAILURE]:', err.message);
  process.exit(1);
});
