// Read-only audit: never uses connectDB (which performs legacy index cleanup),
// authentication activity updates, or any financial write. Outputs no record values or secrets.
import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config({ quiet: true });
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const mode = process.argv[2];
const output = value => console.log(JSON.stringify(value));
if (mode === 'provider') {
  const model = process.env.AI_MODEL;
  const key = process.env.GEMINI_API_KEY;
  if (!model || !key) { output({ mode, configured: false }); process.exitCode = 1; }
  else try {
    const headers = { 'x-goog-api-key': key };
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers, signal: AbortSignal.timeout(20000) });
    const metadata = await response.json();
    output({ check: 'configured-model', model, httpStatus: response.status, methods: metadata.supportedGenerationMethods || [], errorCode: metadata.error?.status });
    if (response.ok) {
      const { FINANCIAL_TOOL_DECLARATIONS, validateToolArguments } = await import('../services/ai/financialTools.js');
      const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Synthetic API contract audit. Call getExpenseSummary for September 2026. No financial records are available or requested from this API.' }] }], tools: [{ functionDeclarations: FINANCIAL_TOOL_DECLARATIONS }], toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['getExpenseSummary'] } }, generationConfig: { maxOutputTokens: 512 } }),
      });
      const data = await result.json();
      const call = data.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
      let valid = false;
      if (call?.name === 'getExpenseSummary') { try { validateToolArguments(call.name, call.args); valid = call.args.month === 9 && call.args.year === 2026; } catch {} }
      output({ check: 'synthetic-tool-contract', httpStatus: result.status, valid, errorCode: data.error?.status });
      if (!valid) process.exitCode = 1;
    } else {
      const list = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers, signal: AbortSignal.timeout(20000) });
      const data = await list.json();
      output({ check: 'model-list', httpStatus: list.status, names: (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name), errorCode: data.error?.status });
      process.exitCode = 1;
    }
  } catch (error) { output({ mode, failed: true, errorType: error.name, networkCode: error.cause?.code }); process.exitCode = 1; }
} else if (mode === 'database') {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required for the read-only database audit.');
  try {
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 30000 });
    const [{ default: User }, { default: Transaction }, { default: Account }, tools, ledger, rental, dates, balances] = await Promise.all([
      import('../models/User.js'), import('../models/Transaction.js'), import('../models/Account.js'), import('../services/ai/financialTools.js'), import('../services/ledgerService.js'), import('../services/rentalCarryForwardService.js'), import('../services/salaryReportingService.js'), import('../services/accountBalance.js'),
    ]);
    const known = await User.find({ name: /Fahad|Khurshid|Sarfraz/i }).select('name role isActive isDeleted').maxTimeMS(10000).lean();
    for (const name of ['Fahad', 'Khurshid', 'Sarfraz']) output({ check: 'user-role', person: name, matches: known.filter(u => new RegExp(name, 'i').test(u.name)).map(u => ({ role: u.role, active: u.isActive, deleted: Boolean(u.isDeleted) })) });
    const user = known.find(u => u.isActive && !u.isDeleted);
    if (!user) throw new Error('No existing active audited user found.');
    const period = dates.getUtcMonthKey(new Date());
    const [year, month] = period.split('-').map(Number);
    const args = { year, month };
    const expenses = await tools.executeFinancialTool('getExpenseSummary', args, user);
    const report = await ledger.getHeadWiseExpenseReport(year, month);
    output({ check: 'expense-service-reconciliation', period, passed: expenses.totalExpenses === report.totalExpensesOverall });
    const rent = await tools.executeFinancialTool('getRentCollectionSummary', args, user);
    const outstanding = await tools.executeFinancialTool('getOutstandingRent', args, user);
    const rentalReport = await rental.getRentalSummaryWithCarryForward(period, { rentOnly: true });
    output({ check: 'rent-and-outstanding-reconciliation', period, passed: rent.totalReceivedAmount === rentalReport.grandTotals.totalReceivedAmount && outstanding.totalOutstandingAmount === rentalReport.grandTotals.totalOutstandingReceivable });
    const salary = await tools.executeFinancialTool('getSalarySummary', args, user);
    output({ check: 'salary-classification-reconciliation', period, passed: salary.totalSalariesDisbursed === ledger.round2(report.mainHeads.filter(h => h.mainHeadId === 'salary').reduce((sum, h) => sum + h.totalSpent, 0)) });
    const accountData = await tools.executeFinancialTool('getAccountBalances', {}, user);
    const accounts = await Account.find({ isActive: true, isClearing: { $ne: true } }).select('_id openingBalance').maxTimeMS(10000).lean();
    const transactions = await Transaction.find({ $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }] }).select('drAccountId crAccountId amount status').maxTimeMS(10000).lean();
    output({ check: 'live-account-reconciliation', passed: accountData.totalAllAccounts === ledger.round2([...balances.calculateLiveAccountBalances(accounts, transactions).values()].reduce((sum, value) => sum + value, 0)) });
    const property = rentalReport.plazas[0];
    if (property) {
      const summary = await tools.executeFinancialTool('getPropertyFinancialSummary', { ...args, propertyName: property.plazaName }, user);
      const propertyReport = await ledger.getHeadWiseExpenseReport(year, month, { propertyId: String(property.plazaId) });
      output({ check: 'property-expense-reconciliation', period, passed: summary.totalExpenses === propertyReport.totalExpensesOverall });
    }
    if (period > '2026-09') {
      const comparison = await tools.executeFinancialTool('getMonthlyComparison', { month1: month, year1: year }, user);
      output({ check: 'monthly-comparison-arithmetic', period, passed: comparison.variance.expenseChange === ledger.round2(comparison.period1Data.totalExpenses - comparison.period2Data.totalExpenses) && comparison.variance.netCashFlowChange === ledger.round2(comparison.period1Data.netCashFlow - comparison.period2Data.netCashFlow) });
    }
    const indexes = await mongoose.connection.collection('assistantratelimits').indexes().catch(() => []);
    output({ check: 'rate-limit-indexes', uniqueKey: indexes.some(i => i.unique && i.key?.key === 1), ttl: indexes.some(i => i.key?.resetAt === 1 && i.expireAfterSeconds === 0) });
  } catch (error) { output({ mode, failed: true, errorType: error.name, networkCode: error.cause?.code }); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
} else { throw new Error('Use provider or database mode.'); }
