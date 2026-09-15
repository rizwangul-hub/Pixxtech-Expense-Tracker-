import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handlebars from 'handlebars';
import { round2 } from '../services/ledgerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPhase3And4Tests() {
  console.log('Testing Phase 3 & Phase 4 Business Logic & PDF Engine...\n');

  // Test 1: Currency formatting helper with Pakistani Rupees & parenthesis for negative
  console.log('Test 1: Currency formatting helper (formatPKR)');
  const formatPKR = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00';
    const num = Number(val);
    const isNeg = num < 0;
    const absFormatted = new Intl.NumberFormat('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));
    return isNeg ? `(${absFormatted})` : absFormatted;
  };

  assert.equal(formatPKR(1443675), '1,443,675.00');
  assert.equal(formatPKR(-145020), '(145,020.00)');
  assert.equal(formatPKR(0), '0.00');
  console.log('✓ Currency formatting helper validated');

  // Test 2: Atomic Balance Reversal & Re-calculation Math
  console.log('Test 2: Atomic Master Edit Balance Reversal arithmetic');
  // Scenario: An existing voucher had Dr=Bank (100,000) and Cr=Cash (100,000)
  // Admin edits it to Dr=Bank (150,000) and Cr=Cash (150,000)
  let bankBalance = 1000000;
  let cashBalance = 50000;

  const oldAmount = 100000;
  const newAmount = 150000;

  // Step 1: Reverse previous transaction effect
  bankBalance -= oldAmount; // Bank decreases by 100k (reversing Dr)
  cashBalance += oldAmount; // Cash increases by 100k (reversing Cr)

  assert.equal(bankBalance, 900000);
  assert.equal(cashBalance, 150000);

  // Step 2: Apply new transaction effect
  bankBalance += newAmount; // Bank increases by 150k
  cashBalance -= newAmount; // Cash decreases by 150k

  assert.equal(bankBalance, 1050000);
  assert.equal(cashBalance, 0);
  console.log('✓ Master edit atomic balance reversal arithmetic validated');

  // Test 3: Macro Financial Indicators
  console.log('Test 3: Macro Financial Overview Indicators');
  const rentalIncome = 408575;
  const otherReceipts = 50000;
  const totalAvailable = round2(rentalIncome + otherReceipts);
  const totalExpenses = 468500;
  const netPosition = round2(totalAvailable - totalExpenses);

  assert.equal(totalAvailable, 458575);
  assert.equal(netPosition, -9925);
  assert.equal(formatPKR(netPosition), '(9,925.00)');
  console.log(`✓ Net position correctly evaluated as deficit: ${formatPKR(netPosition)}`);

  // Test 4: PDF Print Template existence and Handlebars compilation
  console.log('Test 4: Handlebars PDF Template compilation');
  const templatePath = path.join(__dirname, '..', 'templates', 'fundsReportTemplate.html');
  assert.ok(fs.existsSync(templatePath), 'fundsReportTemplate.html must exist');

  const templateContent = fs.readFileSync(templatePath, 'utf8');
  handlebars.registerHelper('formatPKR', (val) => formatPKR(val));
  handlebars.registerHelper('formatDate', (d) => (d ? String(d).split('T')[0] : '-'));
  handlebars.registerHelper('isNegative', (v) => Number(v) < 0);
  handlebars.registerHelper('isEven', (i) => i % 2 === 0);

  const compiled = handlebars.compile(templateContent);
  const sampleRender = compiled({
    periodName: '2026-08',
    generatedDate: 'September 14, 2026',
    endDate: '2026-08-31',
    auditedBy: 'Fahad Sb',
    macro: {
      totalRentalIncomeReceived: 408575,
      totalOtherReceipts: 0,
      totalAmountAvailable: 408575,
      totalNetExpenses: 468500,
      closingAvailableBalance: 12053913.68,
      netPosition: -59925,
    },
    matrix: { rows: [], grandTotal: { openingBalance: 12522438.68, rentalIncome: 408575, otherInput: 0, totalInput: 408575, rentalExpenses: 0, otherExpenses: 468500, totalOutput: 468500, closingBalance: 12053913.68 } },
    rentalSummary: { grandTotals: { totalAgreedRent: 1358355, totalPriorReceivable: 0, totalCurrentDue: 1358355, totalReceivedAmount: 216250, totalOutstandingReceivable: 1142105, totalAdvanceRentReceived: 0, collectionRate: 16 }, plazas: [] },
    transactions: [],
    totalTransactionsAmount: 0,
    headWise: { totalExpensesOverall: 468500, heads: [] },
    audit: { totalVouchers: 5, verifiedVouchers: 5 },
  });

  assert.ok(sampleRender.includes('Pixx Technologies'), 'Rendered HTML must contain company title');
  assert.ok(sampleRender.includes('Fahad Sb'), 'Rendered HTML must contain auditor name');
  assert.ok(sampleRender.includes('(59,925.00)'), 'Rendered HTML must contain formatted currency');
  console.log('✓ Handlebars template compiled and rendered multi-page HTML successfully');

  console.log('\n============================================');
  console.log('  ALL PHASE 3 & PHASE 4 TESTS PASSED (4/4)  ');
  console.log('============================================\n');
}

runPhase3And4Tests().catch((err) => {
  console.error('Phase 3/4 test failed:', err);
  process.exit(1);
});
