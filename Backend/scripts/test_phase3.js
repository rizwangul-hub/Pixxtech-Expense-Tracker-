import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { calculateDueDate } from '../controllers/rentDueController.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import RentDue from '../models/RentDue.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = 'http://127.0.0.1:5000/api';

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`  STARTING AUTOMATED E2E VERIFICATION FOR PHASE 3`);
  console.log(`======================================================\n`);

  const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixx_expense_tracker';
  await mongoose.connect(mongoURI);

  const adminUser = await User.findOne({ role: { $in: ['ADMIN', 'ADMIN_PUBLISHER'] } });
  const entryUser = await User.findOne({ role: 'DATA_ENTRY' });

  if (!adminUser || !entryUser) {
    throw new Error('Admin or Data Entry user missing in database.');
  }

  const jwtSecret = process.env.JWT_SECRET || 'fallback_secret';
  const adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, jwtSecret, { expiresIn: '1h' });
  const entryToken = jwt.sign({ id: entryUser._id, role: entryUser.role }, jwtSecret, { expiresIn: '1h' });

  let testsPassed = 0;
  let testsFailed = 0;

  const assert = (condition, testName) => {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      testsPassed += 1;
    } else {
      console.error(`  [FAIL] ${testName}`);
      testsFailed += 1;
    }
  };

  // Helper fetch
  const req = async (endpoint, options = {}) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };

  // --- SECTION 1: SECURITY & RBAC TESTS ---
  console.log('\n--- Section 1: Security & RBAC Enforcement ---');

  // 1. Block unauthenticated requests
  const unauthRes = await req('/tenants');
  assert(unauthRes.status === 401, '1. Unauthenticated request to /api/tenants blocked with 401');

  // 2. DATA_ENTRY user can read tenants
  const entryGetTenants = await req('/tenants', { token: entryToken });
  assert(entryGetTenants.status === 200 && entryGetTenants.data?.success, '2. DATA_ENTRY can read /api/tenants');

  // 3. DATA_ENTRY user blocked from creating tenant (Admin only)
  const entryPostTenant = await req('/tenants', {
    token: entryToken,
    method: 'POST',
    body: { fullName: 'Unauthorized Tenant', phone: '0300-9998877' },
  });
  assert(entryPostTenant.status === 403, '3. DATA_ENTRY blocked from creating tenant with 403 Forbidden');

  // 4. DATA_ENTRY user blocked from generating rent due
  const entryGenRent = await req('/rent-due/generate', {
    token: entryToken,
    method: 'POST',
    body: { month: '2026-09' },
  });
  assert(entryGenRent.status === 403, '4. DATA_ENTRY blocked from generating rent due with 403 Forbidden');

  // --- SECTION 2: TENANT CRUD & SOFT DEACTIVATION ---
  console.log('\n--- Section 2: Tenant Management & Soft Deactivation ---');

  const testPhone = `0345-${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testCnic = `35201-${Math.floor(1000000 + Math.random() * 9000000)}-9`;

  // 5. Create Tenant (Admin)
  const createTenantRes = await req('/tenants', {
    token: adminToken,
    method: 'POST',
    body: {
      fullName: 'Apex Logistics Pakistan',
      companyName: 'Apex Logistics Pvt Ltd',
      phone: testPhone,
      email: 'apex@testpk.com',
      identificationNumber: testCnic,
      city: 'Lahore',
      status: 'ACTIVE',
    },
  });
  assert(createTenantRes.status === 201 && createTenantRes.data?.data?._id, '5. Admin creates tenant successfully (201 Created)');
  const createdTenantId = createTenantRes.data?.data?._id;

  // 6. Prevent Duplicate Phone Number
  const duplicatePhoneRes = await req('/tenants', {
    token: adminToken,
    method: 'POST',
    body: {
      fullName: 'Another Tenant',
      phone: testPhone, // duplicate
    },
  });
  assert(duplicatePhoneRes.status === 409, '6. Duplicate tenant phone rejected with 409 Conflict');

  // 7. Edit Tenant
  const updateTenantRes = await req(`/tenants/${createdTenantId}`, {
    token: adminToken,
    method: 'PUT',
    body: {
      fullName: 'Apex Global Logistics PK',
      notes: 'Updated corporate lease notes.',
    },
  });
  assert(
    updateTenantRes.status === 200 && updateTenantRes.data?.data?.fullName === 'Apex Global Logistics PK',
    '7. Admin updates tenant profile successfully (200 OK)'
  );

  // 8. Soft Deactivation (toggle status)
  const toggleTenantRes = await req(`/tenants/${createdTenantId}/status`, {
    token: adminToken,
    method: 'PATCH',
  });
  assert(
    toggleTenantRes.status === 200 && toggleTenantRes.data?.data?.status === 'INACTIVE' && toggleTenantRes.data?.data?.isActive === false,
    '8. Soft deactivation sets status=INACTIVE & isActive=false (no permanent delete)'
  );

  // Re-activate for further tests
  await req(`/tenants/${createdTenantId}/status`, { token: adminToken, method: 'PATCH' });

  // --- SECTION 3: AGREEMENTS, OVERLAP PREVENTION & OCCUPANCY ---
  console.log('\n--- Section 3: Rental Agreements & Occupancy Automation ---');

  // Pick a test property and add a dedicated vacant test unit
  const property = await Property.findOne({ 'units.0': { $exists: true } });
  const propertyId = property._id.toString();

  property.units.push({
    unitName: `Phase3 Test Unit ${Math.floor(100 + Math.random() * 900)}`,
    unitNumber: `TEST-${Math.floor(100 + Math.random() * 900)}`,
    unitType: 'OFFICE',
    floor: 'Top Floor',
    status: 'VACANT',
    isActive: true,
  });
  await property.save();
  const testUnit = property.units[property.units.length - 1];
  const unitId = testUnit._id.toString();

  // 9. Proposed Agreement Number endpoint
  const nextNumRes = await req('/agreements/next-number', { token: adminToken });
  assert(nextNumRes.status === 200 && nextNumRes.data?.data?.nextNumber?.startsWith('AGR-'), '9. Proposed agreement number generated (e.g. AGR-2026-XXXX)');

  // 10. Create a temporary test agreement on unit
  const testAgreementNum = `AGR-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
  const createAgrRes = await req('/agreements', {
    token: adminToken,
    method: 'POST',
    body: {
      agreementNumber: testAgreementNum,
      tenantId: createdTenantId,
      propertyId,
      unitId,
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      monthlyRent: 85000,
      dueDay: 5,
      status: 'ACTIVE',
    },
  });
  assert(createAgrRes.status === 201 && createAgrRes.data?.data?._id, '10. Create active rental agreement (201 Created)');
  const testAgreementId = createAgrRes.data?.data?._id;

  // 11. Verify Unit status automatically updated to OCCUPIED
  const updatedProp = await Property.findById(propertyId);
  const reloadedUnit = updatedProp.units.id(unitId);
  assert(reloadedUnit.status === 'OCCUPIED', '11. Unit status automatically transitioned to OCCUPIED');

  // 12. Prevent Overlapping Active Agreement for the same unit
  const overlappingAgrRes = await req('/agreements', {
    token: adminToken,
    method: 'POST',
    body: {
      agreementNumber: `AGR-CONFLICT-${Math.floor(1000 + Math.random() * 9000)}`,
      tenantId: createdTenantId,
      propertyId,
      unitId,
      startDate: '2026-10-01', // Overlaps with 2026-09-01 -> 2027-08-31
      endDate: '2027-03-31',
      monthlyRent: 90000,
      dueDay: 10,
      status: 'ACTIVE',
    },
  });
  assert(overlappingAgrRes.status === 409, '12. Overlapping active agreement on same unit rejected with 409 Conflict');

  // 13. Terminate Agreement & verify Occupancy Reversion
  const terminateAgrRes = await req(`/agreements/${testAgreementId}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: { status: 'TERMINATED' },
  });
  assert(terminateAgrRes.status === 200 && terminateAgrRes.data?.data?.status === 'TERMINATED', '13. Agreement terminated via soft state transition');

  // Check unit status after termination (no other active agreement exists for this unit -> VACANT)
  const postTermProp = await Property.findById(propertyId);
  const postTermUnit = postTermProp.units.id(unitId);
  assert(postTermUnit.status === 'VACANT', '14. Unit status automatically reverted to VACANT after lease termination');

  // --- SECTION 4: RENT DUE GENERATION & IDEMPOTENCY ---
  console.log('\n--- Section 4: Monthly Rent Due Engine & Date Calculation ---');

  // 15. Short month calculation test (February due day 31 safely capped to Feb 28)
  const febDueDate = calculateDueDate(2026, 2, 31);
  assert(febDueDate.getUTCDate() === 28, '15. Short month capping: Feb 2026 Day 31 safely capped to Feb 28');

  // 16. Monthly Rent Due Generation (2026-08)
  const genRentDueRes = await req('/rent-due/generate', {
    token: adminToken,
    method: 'POST',
    body: { month: '2026-08' },
  });
  assert(
    genRentDueRes.status === 201 && genRentDueRes.data?.success,
    '16. Monthly rent due generation executed successfully (201 Created)'
  );

  // 17. Idempotency Test: Repeat generation creates 0 duplicates
  const repeatGenRes = await req('/rent-due/generate', {
    token: adminToken,
    method: 'POST',
    body: { month: '2026-08' },
  });
  assert(
    repeatGenRes.status === 201 && repeatGenRes.data?.data?.newlyGenerated === 0 && repeatGenRes.data?.data?.alreadyExisting > 0,
    '17. Idempotency enforced: Repeated generation creates 0 duplicates, marks records as already existing'
  );

  // 18. Compound Unique Index Verification in MongoDB
  const duplicateRentDueAttempt = new RentDue({
    agreementId: new mongoose.Types.ObjectId(),
    tenantId: createdTenantId,
    propertyId,
    unitId,
    rentMonth: '2026-08',
    dueDate: new Date(),
    expectedRentAmount: 50000,
  });
  await duplicateRentDueAttempt.save();
  let caughtDuplicate = false;
  try {
    const clone = new RentDue({
      agreementId: duplicateRentDueAttempt.agreementId, // same agreement
      tenantId: createdTenantId,
      propertyId,
      unitId,
      rentMonth: '2026-08', // same month
      dueDate: new Date(),
      expectedRentAmount: 50000,
    });
    await clone.save();
  } catch (err) {
    if (err.code === 11000) caughtDuplicate = true;
  }
  assert(caughtDuplicate, '18. Database compound unique index [agreementId + rentMonth] prevents duplicate entries');
  await RentDue.deleteOne({ _id: duplicateRentDueAttempt._id });

  // 19. Rent Due Summary Calculation
  const rentDueSummaryRes = await req('/rent-due/summary?month=2026-08', { token: adminToken });
  assert(
    rentDueSummaryRes.status === 200 && rentDueSummaryRes.data?.data?.totalExpectedRent > 0,
    '19. Rent due summary aggregate calculated from real records'
  );

  // 20. Clean up test records
  await RentalAgreement.deleteOne({ _id: testAgreementId });
  await Tenant.deleteOne({ _id: createdTenantId });
  await Property.updateOne(
    { _id: propertyId },
    { $pull: { units: { _id: new mongoose.Types.ObjectId(unitId) } } }
  );
  console.log('  [CLEANUP] Temporary test records safely removed.');

  console.log(`\n======================================================`);
  console.log(`  PHASE 3 TEST RESULTS:`);
  console.log(`  Passed: ${testsPassed} / ${testsPassed + testsFailed}`);
  console.log(`  Failed: ${testsFailed}`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[Test Execution Error]:', err);
  process.exit(1);
});
