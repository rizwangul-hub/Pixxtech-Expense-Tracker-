/**
 * Phase 11 Final Comprehensive System Verification
 * PDF Report, Dashboards, Publishing Lifecycle, Reconciliation & Security Audit
 * Pixx Technologies Property Finance & Expense Management System
 */
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://127.0.0.1:5000/api';
let adminToken = '';
let dataEntryToken = '';

const apiCall = async (path, options = {}, token = adminToken) => {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    return { status: res.status, headers: res.headers, data };
  } else {
    const buffer = await res.arrayBuffer();
    return { status: res.status, headers: res.headers, buffer: Buffer.from(buffer) };
  }
};

const assert = (condition, message) => {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  [PASS] ${message}`);
};

console.log('\n======================================================');
console.log('  PHASE 11 FINAL COMPREHENSIVE SYSTEM VERIFICATION');
console.log('  Final PDF Report + Publishing + Complete Audit');
console.log('======================================================\n');

// 1. Authenticate
console.log('1. Authenticating Admin & Data Entry Users...');
const adminLogin = await apiCall('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@pixxtechnologies.com', password: 'admin12345' }),
});
assert(adminLogin.status === 200, 'Admin login returns HTTP 200');
adminToken = adminLogin.data?.token;
assert(!!adminToken, 'Admin JWT token received');

const entryLogin = await apiCall('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'entry@pixxtechnologies.com', password: 'entry12345' }),
});
assert(entryLogin.status === 200, 'Data Entry login returns HTTP 200');
dataEntryToken = entryLogin.data?.token;
assert(!!dataEntryToken, 'Data Entry JWT token received');

// 2. Real Database PDF Report Generation (Parts 1-21, 45)
console.log('\n2. Testing Professional Printable PDF Generation (Parts 1-21, 45)...');
const pdfRes = await apiCall('/reports/funds-management-pdf?month=2026-08');
assert(pdfRes.status === 200, 'PDF generation endpoint returns HTTP 200');
assert(pdfRes.buffer && pdfRes.buffer.length > 50000, `Multi-page PDF generated (${pdfRes.buffer.length} bytes)`);
assert(pdfRes.headers.get('content-type').includes('application/pdf'), 'Content-Type is application/pdf');

// 3. Monthly Reports History & Snapshot API (Parts 22, 28, 29)
console.log('\n3. Testing Monthly Reports History & Lifecycle API (Parts 22, 28, 29)...');
const historyRes = await apiCall('/monthly-reports');
assert(historyRes.status === 200, 'Monthly Reports archive returns HTTP 200');
assert(Array.isArray(historyRes.data?.data?.reports), 'Monthly reports returned as array');

// Generate/Refresh Monthly Report Snapshot
const genRes = await apiCall('/monthly-reports/generate', {
  method: 'POST',
  body: JSON.stringify({ month: '2026-08', notes: 'Phase 11 final automated audit test' }),
});
assert(genRes.status === 200, 'Generate monthly report returns HTTP 200');
const repData = genRes.data?.data?.report;
assert(repData.month === '2026-08', 'Report month is 2026-08');
assert(repData.status === 'DRAFT' || repData.status === 'REVIEWED' || repData.status === 'PUBLISHED', 'Valid status lifecycle assigned');
assert(typeof repData.summarySnapshot?.totalRentalIncome === 'number', `Rental income in snapshot: Rs. ${repData.summarySnapshot?.totalRentalIncome}`);
assert(typeof repData.summarySnapshot?.totalExpenses === 'number', `Expenses in snapshot: Rs. ${repData.summarySnapshot?.totalExpenses}`);

// 4. Pre-Generation Reconciliation Check (Part 21)
console.log('\n4. Testing Reconciliation Validation Endpoint (Part 21)...');
const reconRes = await apiCall('/monthly-reports/2026-08/validate');
assert(reconRes.status === 200, 'Reconciliation validation returns HTTP 200');
assert(reconRes.data?.data?.reconciliationStatus !== undefined, `Reconciliation status: ${reconRes.data?.data?.reconciliationStatus}`);
console.log(`  [INFO] Reconciliation Notes: ${reconRes.data?.data?.reconciliationNotes}`);

// 5. Publishing Lifecycle: DRAFT -> REVIEWED -> PUBLISHED (Parts 22 & 27)
console.log('\n5. Testing Publishing Lifecycle Workflow (Parts 22 & 27)...');
// Move to REVIEWED
const reviewRes = await apiCall('/monthly-reports/2026-08/status', {
  method: 'PATCH',
  body: JSON.stringify({ status: 'REVIEWED' }),
});
assert(reviewRes.status === 200, 'Status updated to REVIEWED (HTTP 200)');
assert(reviewRes.data?.data?.report?.status === 'REVIEWED', 'Report state verified as REVIEWED');
assert(!!reviewRes.data?.data?.report?.reviewedByName, `Auditor recorded: ${reviewRes.data?.data?.report?.reviewedByName}`);

// Move to PUBLISHED
const publishRes = await apiCall('/monthly-reports/2026-08/status', {
  method: 'PATCH',
  body: JSON.stringify({ status: 'PUBLISHED' }),
});
assert(publishRes.status === 200, 'Status updated to PUBLISHED (HTTP 200)');
assert(publishRes.data?.data?.report?.status === 'PUBLISHED', 'Report state verified as PUBLISHED');
assert(!!publishRes.data?.data?.report?.publishedByName, `Publisher recorded: ${publishRes.data?.data?.report?.publishedByName}`);

// 6. Published Period Lock Enforcement (Part 27)
console.log('\n6. Testing Published Period Lock Protection (Part 27)...');
// Attempt to create a new transaction in August 2026 while it is PUBLISHED
const lockTestCreate = await apiCall('/transactions/voucher', {
  method: 'POST',
  body: JSON.stringify({
    date: '2026-08-15',
    voucherNo: 'LOCK-TEST-FAIL-01',
    detail: 'Should fail due to published period lock',
    categoryId: '66d000000000000000000001',
    drAccountId: '66d000000000000000000002',
    crAccountId: '66d000000000000000000003',
    amount: 1000,
  }),
});
assert(
  lockTestCreate.status === 400 || lockTestCreate.status === 403,
  `Attempt to record transaction in PUBLISHED period blocked (HTTP ${lockTestCreate.status})`
);
console.log(`  [INFO] Lock message: ${lockTestCreate.data?.message}`);

// Revert status back to REVIEWED/DRAFT for active development
const unlockRes = await apiCall('/monthly-reports/2026-08/status', {
  method: 'PATCH',
  body: JSON.stringify({ status: 'REVIEWED', notes: 'Unlocked after automated audit test' }),
});
assert(unlockRes.status === 200, 'Report successfully unlocked to REVIEWED state');

// 7. Role-Based Access Control Security (Parts 23 & 26)
console.log('\n7. Testing Data Entry RBAC Restrictions (Parts 23 & 26)...');
const rbacGen = await apiCall('/monthly-reports/generate', {
  method: 'POST',
  body: JSON.stringify({ month: '2026-08' }),
}, dataEntryToken);
assert(rbacGen.status === 403, 'Data Entry user blocked from Generating Report (HTTP 403)');

const rbacStatus = await apiCall('/monthly-reports/2026-08/status', {
  method: 'PATCH',
  body: JSON.stringify({ status: 'PUBLISHED' }),
}, dataEntryToken);
assert(rbacStatus.status === 403, 'Data Entry user blocked from Publishing Report (HTTP 403)');

const rbacEntries = await apiCall('/transactions/my-entries', {}, dataEntryToken);
assert(rbacEntries.status === 200, 'Data Entry user allowed to view their allowed entries (HTTP 200)');

// 8. Management Actions Review (Parts 24 & 25)
console.log('\n8. Testing Management Actions Review (Parts 24 & 25)...');
const glanceRes = await apiCall('/admin/financial-at-a-glance?month=2026-08');
assert(glanceRes.status === 200, 'Management Financial At A Glance returns HTTP 200');
assert(glanceRes.data?.matrix !== undefined, 'Liquidity matrix present');

const rentalRes = await apiCall('/admin/rental-income-summary?month=2026-08');
assert(rentalRes.status === 200, 'Management Rental Income Summary returns HTTP 200');
assert(rentalRes.data?.grandTotals !== undefined, 'Rental hierarchy grand totals present');

console.log('\n======================================================');
console.log('  ALL PHASE 11 TESTS PASSED CLEANLY! (100% PASS RATE)');
console.log('  FINAL SYSTEM AUDIT & VERIFICATION COMPLETE.');
console.log('======================================================\n');
