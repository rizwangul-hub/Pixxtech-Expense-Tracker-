import mongoose from 'mongoose';
import Account from '../../models/Account.js';
import Property from '../../models/Property.js';
import Tenant from '../../models/Tenant.js';
import RentalAgreement from '../../models/RentalAgreement.js';
import Category from '../../models/Category.js';
import Employee from '../../models/Employee.js';
import Transaction from '../../models/Transaction.js';
import { round2, suggestNextVoucherNumber } from '../ledgerService.js';
import { resolvePeriodFromText } from './naturalLanguageResolver.js';
import { getUtcMonthKey } from '../salaryReportingService.js';

// Regex to extract monetary amounts (e.g. Rs. 25,000, 25000, 50k, 10,000)
export function extractAmount(text) {
  if (!text) return null;
  const clean = text.replace(/,/g, '');

  // Match e.g. 50k
  const kMatch = clean.match(/(?:rs\.?|pkr)?\s*([0-9]+(?:\.[0-9]+)?)\s*k\b/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000);
  }

  // Match e.g. Rs. 25,000, 25000 PKR, 5000
  const match = clean.match(/(?:rs\.?|pkr|rupees?)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:rs\.?|pkr|rupees?)?/i);
  if (match) {
    // Look specifically for numbers following Rs or action verbs
    const matches = [...clean.matchAll(/(?:rs\.?|pkr|rupees?|amount|sum|price|of)?\s*([0-9]{2,10}(?:\.[0-9]{1,2})?)/gi)];
    for (const m of matches) {
      const val = parseFloat(m[1]);
      // Avoid matching years like 2024, 2025, 2026 if they represent dates
      if (val >= 2020 && val <= 2030 && !/(?:rs|pkr|amount|rupees)/i.test(m[0])) {
        continue;
      }
      if (val > 0) return round2(val);
    }
  }

  return null;
}

/**
 * Intelligent Entity Resolver for Accounts, Properties, Tenants, Employees, Categories
 */
export async function resolveEntities(text) {
  const clean = text.toLowerCase();

  // 1. Fetch reference collections in parallel
  const [accounts, properties, employees, categories] = await Promise.all([
    Account.find({ isActive: true }).select('_id name type currentBalance openingBalance bankName cashHolder').lean(),
    Property.find({}).select('_id plazaName propertyName propertyCode units').lean(),
    Employee.find({ employmentStatus: 'ACTIVE' }).select('_id name designation basicSalary loanBalance').lean(),
    Category.find({}).select('_id name type isRentalHead expenseClassification').lean(),
  ]);

  // Match Accounts (Bank & Cash)
  let matchedAccounts = [];
  const ACCOUNT_STOP_WORDS = new Set(['bank', 'account', 'cash', 'hand', 'the', 'and', 'for', 'ltd', 'pvt']);
  for (const acc of accounts) {
    const accName = acc.name.toLowerCase();
    const tokens = accName.split(/[\s-]+/).filter(t => t.length > 2 && !ACCOUNT_STOP_WORDS.has(t));
    const hasFullMatch = clean.includes(accName);
    const hasTokenMatch = tokens.length > 0 && tokens.some(t => new RegExp(`\\b${t}\\b`, 'i').test(clean));

    if (hasFullMatch || hasTokenMatch) {
      matchedAccounts.push(acc);
    }
  }

  // Special checks for common bank abbreviations: UBL, HBL, MCB, Meezan, Alfalah
  const bankAliases = [
    { alias: 'ubl', pattern: /\bubl\b/i },
    { alias: 'hbl', pattern: /\bhbl\b/i },
    { alias: 'mcb', pattern: /\bmcb\b/i },
    { alias: 'meezan', pattern: /\bmeezan\b/i },
    { alias: 'alfalah', pattern: /\b(alfalah|al\s*falah)\b/i },
    { alias: 'cash', pattern: /\b(cash|rokad|naqad|petty\s*cash|cash\s*in\s*hand)\b/i },
  ];

  for (const ba of bankAliases) {
    if (ba.pattern.test(clean)) {
      const found = accounts.find(a => new RegExp(ba.alias, 'i').test(a.name) || (ba.alias === 'cash' && a.type === 'CASH'));
      if (found && !matchedAccounts.some(a => String(a._id) === String(found._id))) {
        matchedAccounts.push(found);
      }
    }
  }

  // Match Properties & Units
  let matchedProperty = null;
  let matchedUnit = null;
  for (const p of properties) {
    const pName = (p.plazaName || p.propertyName || '').toLowerCase();
    const tokens = pName.split(/[\s-]+/).filter(t => t.length > 2);
    if (clean.includes(pName) || tokens.some(t => new RegExp(`\\b${t}\\b`, 'i').test(clean))) {
      matchedProperty = p;
      break;
    }
    // Check property code or plaza number
    if (p.propertyCode && clean.includes(p.propertyCode.toLowerCase())) {
      matchedProperty = p;
      break;
    }
  }

  // Match Unit numbers e.g. "Flat 4", "Unit 2", "Shop 10", "Flat 4, Unit 2"
  const unitMatch = clean.match(/\b(flat|unit|shop|office|apartment|room)\s*#?\s*([a-z0-9-]+)\b/i);
  if (unitMatch) {
    const unitToken = `${unitMatch[1]} ${unitMatch[2]}`.toLowerCase();
    const unitNo = unitMatch[2].toLowerCase();

    if (matchedProperty && matchedProperty.units) {
      matchedUnit = matchedProperty.units.find(u =>
        (u.unitName && u.unitName.toLowerCase().includes(unitNo)) ||
        (u.unitNumber && u.unitNumber.toLowerCase().includes(unitNo))
      );
    }

    // If property not yet matched, search across all property units
    if (!matchedProperty) {
      for (const p of properties) {
        const foundU = (p.units || []).find(u =>
          (u.unitName && (u.unitName.toLowerCase().includes(unitToken) || u.unitName.toLowerCase().includes(unitNo))) ||
          (u.unitNumber && u.unitNumber.toLowerCase().includes(unitNo))
        );
        if (foundU) {
          matchedProperty = p;
          matchedUnit = foundU;
          break;
        }
      }
    }
  }

  // Match Tenants
  let matchedTenant = null;
  let matchedAgreement = null;
  const tenants = await Tenant.find({}).select('_id fullName phone identificationNumber').lean();
  for (const t of tenants) {
    const tName = t.fullName.toLowerCase();
    const tokens = tName.split(/[\s-]+/).filter(tok => tok.length > 2);
    if (clean.includes(tName) || tokens.some(tok => new RegExp(`\\b${tok}\\b`, 'i').test(clean))) {
      matchedTenant = t;
      break;
    }
  }

  // If Tenant matched, lookup active RentalAgreement
  if (matchedTenant) {
    matchedAgreement = await RentalAgreement.findOne({
      tenantId: matchedTenant._id,
      status: { $in: ['ACTIVE', 'UPCOMING'] },
    }).populate('propertyId').populate('unitId').lean();

    if (matchedAgreement && !matchedProperty && matchedAgreement.propertyId) {
      matchedProperty = matchedAgreement.propertyId;
    }
    if (matchedAgreement && !matchedUnit && matchedAgreement.unitId) {
      matchedUnit = matchedAgreement.unitId;
    }
  } else if (matchedProperty && matchedUnit) {
    // If unit matched, find the tenant in that unit
    matchedAgreement = await RentalAgreement.findOne({
      propertyId: matchedProperty._id,
      unitId: matchedUnit._id,
      status: { $in: ['ACTIVE', 'UPCOMING'] },
    }).populate('tenantId').lean();

    if (matchedAgreement && matchedAgreement.tenantId) {
      matchedTenant = matchedAgreement.tenantId;
    }
  }

  // Match Employee
  let matchedEmployee = null;
  for (const emp of employees) {
    const eName = emp.name.toLowerCase();
    const tokens = eName.split(/[\s-]+/).filter(t => t.length > 2);
    if (clean.includes(eName) || tokens.some(t => new RegExp(`\\b${t}\\b`, 'i').test(clean))) {
      matchedEmployee = emp;
      break;
    }
  }

  // Match Expense Category / Head
  let matchedCategory = null;
  const expenseCategories = categories.filter(c => c.type === 'EXPENSE');
  for (const cat of expenseCategories) {
    const cName = cat.name.toLowerCase();
    const tokens = cName.split(/[\s-]+/).filter(t => t.length > 2);
    if (clean.includes(cName) || tokens.some(t => new RegExp(`\\b${t}\\b`, 'i').test(clean))) {
      matchedCategory = cat;
      break;
    }
  }

  // Common category synonyms: electricity -> Utilities/Electricity, petrol -> Fuel, repair/maintenance -> Maintenance
  if (!matchedCategory) {
    if (/\b(electricity|bijli|power|electric|gas|water|utility|utilities)\b/i.test(clean)) {
      matchedCategory = expenseCategories.find(c => /electricity|utilities|bijli/i.test(c.name)) || expenseCategories[0];
    } else if (/\b(petrol|diesel|fuel|cng)\b/i.test(clean)) {
      matchedCategory = expenseCategories.find(c => /fuel|petrol/i.test(c.name));
    } else if (/\b(repair|maintenance|maramat|renovation)\b/i.test(clean)) {
      matchedCategory = expenseCategories.find(c => /maintenance|repair/i.test(c.name));
    } else if (/\b(stationery|office\s*supplies|paper)\b/i.test(clean)) {
      matchedCategory = expenseCategories.find(c => /office\s*supplies|stationery/i.test(c.name));
    } else if (/\b(salary|salaries|tankhwah|payroll)\b/i.test(clean)) {
      matchedCategory = categories.find(c => /salary/i.test(c.name));
    }
  }

  return {
    accounts: matchedAccounts,
    property: matchedProperty,
    unit: matchedUnit,
    tenant: matchedTenant,
    agreement: matchedAgreement,
    employee: matchedEmployee,
    category: matchedCategory,
    allAccounts: accounts,
    allProperties: properties,
    allEmployees: employees,
    allCategories: categories,
  };
}

/**
 * Detect Action Intent and construct confirmed or clarification proposals
 */
export async function resolveActionProposal(message, user) {
  const clean = message.trim().toLowerCase();
  const amount = extractAmount(message);
  const period = resolvePeriodFromText(message);
  const entities = await resolveEntities(message);

  // -------------------------------------------------------------
  // 1. DELETE / REVERSE TRANSACTION
  // e.g. "Delete voucher EXP-12345", "Reverse voucher TRF-001"
  // -------------------------------------------------------------
  const deleteMatch = clean.match(/\b(delete|remove|reverse|cancel|hatao|khatam\s*karo)\s+(?:voucher|transaction|entry)?\s*#?([a-z0-9-]+)\b/i);
  if (deleteMatch || (/\b(delete|reverse)\b/i.test(clean) && /\b(voucher|entry)\b/i.test(clean))) {
    let voucherCode = deleteMatch ? deleteMatch[2].trim() : null;
    let targetTx = null;

    if (voucherCode) {
      targetTx = await Transaction.findOne({ voucherNo: new RegExp(`^${voucherCode}$`, 'i') })
        .populate('drAccountId', 'name type')
        .populate('crAccountId', 'name type')
        .populate('categoryId', 'name')
        .populate('propertyId', 'plazaName')
        .lean();
    } else {
      // Find latest transaction
      targetTx = await Transaction.findOne({})
        .sort({ createdAt: -1 })
        .populate('drAccountId', 'name type')
        .populate('crAccountId', 'name type')
        .populate('categoryId', 'name')
        .populate('propertyId', 'plazaName')
        .lean();
    }

    if (!targetTx) {
      return {
        isClarification: true,
        message: `Could not find transaction or voucher ${voucherCode ? `'${voucherCode}'` : 'to delete'}. Please provide a valid voucher number (e.g. 'Delete voucher EXP-2026-0001').`,
      };
    }

    return {
      isProposal: true,
      actionType: 'DELETE_TRANSACTION',
      summary: {
        type: 'Reverse & Delete Transaction',
        voucherNo: targetTx.voucherNo,
        amount: round2(targetTx.amount),
        date: targetTx.date ? new Date(targetTx.date).toISOString().slice(0, 10) : 'N/A',
        description: targetTx.detail || 'Transaction',
        affectedAccounts: `${targetTx.drAccountId?.name || 'Debit Account'} & ${targetTx.crAccountId?.name || 'Credit Account'}`,
        impact: 'Transaction will be removed and account balances will be reversed automatically.',
      },
      payload: {
        transactionId: String(targetTx._id),
        voucherNo: targetTx.voucherNo,
        amount: targetTx.amount,
        drAccountId: targetTx.drAccountId?._id ? String(targetTx.drAccountId._id) : null,
        crAccountId: targetTx.crAccountId?._id ? String(targetTx.crAccountId._id) : null,
      },
    };
  }

  // -------------------------------------------------------------
  // 2. EDIT TRANSACTION AMOUNT
  // e.g. "Change this expense from Rs. 5,000 to Rs. 4,500", "Edit the last rent entry"
  // -------------------------------------------------------------
  const editMatch = clean.match(/\b(edit|change|update|correct|tabdeel)\b/i);
  if (editMatch && (clean.includes('expense') || clean.includes('rent') || clean.includes('voucher') || clean.includes('amount'))) {
    // Find latest transaction or matching voucher
    const voucherMatch = clean.match(/\b(?:voucher|entry)?\s*#?([a-z]{2,4}-[0-9-]+)\b/i);
    let targetTx = null;

    if (voucherMatch) {
      targetTx = await Transaction.findOne({ voucherNo: new RegExp(`^${voucherMatch[1]}$`, 'i') }).lean();
    } else {
      targetTx = await Transaction.findOne({}).sort({ createdAt: -1 }).lean();
    }

    if (!targetTx) {
      return {
        isClarification: true,
        message: 'Could not find a recent transaction to edit. Please specify the voucher number (e.g. "Change expense voucher EXP-100 to Rs. 4,500").',
      };
    }

    // Extract new amount
    // e.g. "to Rs. 4,500" or "to 4500"
    const toAmountMatch = clean.match(/(?:to|ko|amount)\s+(?:rs\.?|pkr)?\s*([0-9,]+)/i);
    const newAmount = toAmountMatch ? round2(parseFloat(toAmountMatch[1].replace(/,/g, ''))) : (amount !== targetTx.amount ? amount : null);

    if (!newAmount || newAmount <= 0) {
      return {
        isClarification: true,
        message: `Current amount for voucher #${targetTx.voucherNo} is PKR ${targetTx.amount.toLocaleString('en-PK')}. What is the new amount you would like to set?`,
      };
    }

    return {
      isProposal: true,
      actionType: 'EDIT_TRANSACTION',
      summary: {
        type: 'Edit Transaction Amount',
        voucherNo: targetTx.voucherNo,
        previousAmount: round2(targetTx.amount),
        newAmount: round2(newAmount),
        difference: round2(newAmount - targetTx.amount),
        description: targetTx.detail,
        impact: 'Transaction amount will be updated and ledger running balances recalculated.',
      },
      payload: {
        transactionId: String(targetTx._id),
        voucherNo: targetTx.voucherNo,
        previousAmount: targetTx.amount,
        newAmount,
        drAccountId: targetTx.drAccountId ? String(targetTx.drAccountId) : null,
        crAccountId: targetTx.crAccountId ? String(targetTx.crAccountId) : null,
      },
    };
  }

  // -------------------------------------------------------------
  // 3. INTERNAL ACCOUNT TRANSFERS
  // e.g. "Transfer Rs. 100,000 from UBL to Bank Al Falah"
  // -------------------------------------------------------------
  if (/\b(transfer|bhejo|muntaqil)\b/i.test(clean) && !clean.includes('rent') && !clean.includes('salary')) {
    if (!amount) {
      return {
        isClarification: true,
        message: 'Please specify the amount you want to transfer (e.g. "Transfer Rs. 50,000 from UBL to Bank Al Falah").',
      };
    }

    // Identify from and to accounts
    // e.g. "from UBL to Bank Al Falah"
    let fromAccount = null;
    let toAccount = null;

    const fromMatch = clean.match(/(?:from|se)\s+([a-z0-9\s]+?)(?:\s+(?:to|mein|main|into)|\s*$)/i);
    const toMatch = clean.match(/(?:to|mein|main|into)\s+([a-z0-9\s]+?)(?:\s+(?:from|se)|\s*$)/i);

    if (fromMatch) {
      const fromToken = fromMatch[1].trim();
      fromAccount = entities.allAccounts.find(a => a.name.toLowerCase().includes(fromToken) || (fromToken.includes('cash') && a.type === 'CASH'));
    }
    if (toMatch) {
      const toToken = toMatch[1].trim();
      toAccount = entities.allAccounts.find(a => a.name.toLowerCase().includes(toToken) || (toToken.includes('cash') && a.type === 'CASH'));
    }

    // Fallback to matched accounts array if explicit from/to not parsed
    if (!fromAccount && entities.accounts.length >= 1) fromAccount = entities.accounts[0];
    if (!toAccount && entities.accounts.length >= 2) toAccount = entities.accounts[1];

    if (!fromAccount || !toAccount || String(fromAccount._id) === String(toAccount._id)) {
      return {
        isClarification: true,
        message: `Please specify both source and destination accounts. Available accounts:\n` +
          entities.allAccounts.map(a => `- ${a.name} (${a.type})`).join('\n'),
      };
    }

    const nextVn = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      isProposal: true,
      actionType: 'CREATE_TRANSFER',
      summary: {
        type: 'Internal Funds Transfer',
        amount: round2(amount),
        fromAccount: `${fromAccount.name} (${fromAccount.type})`,
        toAccount: `${toAccount.name} (${toAccount.type})`,
        date: new Date().toISOString().slice(0, 10),
        voucherPreview: nextVn,
        narration: `Funds transfer from ${fromAccount.name} to ${toAccount.name}`,
      },
      payload: {
        fromAccountId: String(fromAccount._id),
        toAccountId: String(toAccount._id),
        amount: round2(amount),
        date: new Date().toISOString().slice(0, 10),
        detail: `Internal transfer: ${fromAccount.name} -> ${toAccount.name}`,
        voucherNo: nextVn,
      },
    };
  }

  // -------------------------------------------------------------
  // 4. EMPLOYEE LOANS & REPAYMENTS
  // e.g. "Give Sabir an employee loan of Rs. 30,000", "Record loan repayment of Rs. 5,000 from Sabir"
  // -------------------------------------------------------------
  const isLoanDisbursement = /\b(give|issue|disburse|loan|qarz|karza|advance)\b/i.test(clean) && !clean.includes('repay') && !clean.includes('wapas');
  const isLoanRepayment = /\b(repay|repayment|wapas|katauti|deduct|recovered)\b/i.test(clean) && /\b(loan|advance|qarz)\b/i.test(clean);

  if ((isLoanDisbursement || isLoanRepayment) && (entities.employee || clean.includes('employee') || clean.includes('staff'))) {
    if (!entities.employee) {
      return {
        isClarification: true,
        message: 'Which employee is this loan for? Available staff:\n' +
          entities.allEmployees.map(e => `- ${e.name} (${e.designation || 'Staff'})`).join('\n'),
      };
    }

    if (!amount) {
      return {
        isClarification: true,
        message: `Please specify the loan amount for ${entities.employee.name} (e.g. "Give ${entities.employee.name} a loan of Rs. 30,000").`,
      };
    }

    const currentBal = entities.employee.loanBalance || 0;
    const isDisburse = !isLoanRepayment;
    const newBal = isDisburse ? currentBal + amount : Math.max(0, currentBal - amount);

    return {
      isProposal: true,
      actionType: isDisburse ? 'CREATE_LOAN_DISBURSEMENT' : 'CREATE_LOAN_REPAYMENT',
      summary: {
        type: isDisburse ? 'Employee Loan / Advance Disbursement' : 'Employee Loan Repayment',
        employee: `${entities.employee.name} (${entities.employee.designation || 'Staff'})`,
        amount: round2(amount),
        previousLoanBalance: round2(currentBal),
        newLoanBalance: round2(newBal),
        date: new Date().toISOString().slice(0, 10),
        notes: isDisburse ? `Advance loan granted to ${entities.employee.name}` : `Loan repayment received from ${entities.employee.name}`,
      },
      payload: {
        employeeId: String(entities.employee._id),
        employeeName: entities.employee.name,
        type: isDisburse ? 'DISBURSEMENT' : 'REPAYMENT',
        amount: round2(amount),
        previousBalance: currentBal,
        newBalance: newBal,
        description: isDisburse ? `Advance/Loan to ${entities.employee.name}` : `Loan repayment from ${entities.employee.name}`,
        date: new Date().toISOString().slice(0, 10),
      },
    };
  }

  // -------------------------------------------------------------
  // 5. EMPLOYEE SALARY PAYMENT
  // e.g. "Record Rs. 50,000 salary paid to Rizwan Ullah"
  // -------------------------------------------------------------
  if (/\b(salary|tankhwah|payroll|paid\s*salary)\b/i.test(clean) && /\b(record|pay|add|diya|di|paid)\b/i.test(clean)) {
    if (!entities.employee) {
      return {
        isClarification: true,
        message: 'Which employee was this salary paid to? Available staff:\n' +
          entities.allEmployees.map(e => `- ${e.name} (${e.designation || 'Staff'})`).join('\n'),
      };
    }

    const payAmount = amount || entities.employee.basicSalary;
    if (!payAmount) {
      return {
        isClarification: true,
        message: `Please specify the salary amount paid to ${entities.employee.name}.`,
      };
    }

    // Disbursing account
    let disbursingAccount = entities.accounts[0] || entities.allAccounts.find(a => a.type === 'CASH') || entities.allAccounts[0];

    const currentKey = getUtcMonthKey(new Date());

    return {
      isProposal: true,
      actionType: 'PAY_SALARY',
      summary: {
        type: 'Staff Salary Payment',
        employee: `${entities.employee.name} (${entities.employee.designation || 'Staff'})`,
        amount: round2(payAmount),
        salaryMonth: period.label !== 'default-current' ? `${period.year}-${String(period.month).padStart(2, '0')}` : currentKey,
        paidFromAccount: `${disbursingAccount.name} (${disbursingAccount.type})`,
        date: new Date().toISOString().slice(0, 10),
      },
      payload: {
        employeeId: String(entities.employee._id),
        employeeName: entities.employee.name,
        amount: round2(payAmount),
        disbursingAccountId: String(disbursingAccount._id),
        salaryMonth: period.label !== 'default-current' ? `${period.year}-${String(period.month).padStart(2, '0')}` : currentKey,
        date: new Date().toISOString().slice(0, 10),
      },
    };
  }

  // -------------------------------------------------------------
  // 6. RENT COLLECTION
  // e.g. "Collect Rs. 25,000 rent from Flat 4, Unit 2", "Receive Rs. 50,000 rent from Tenant Ahmed in UBL"
  // -------------------------------------------------------------
  const isRentIntent = /\b(rent|kiraya|lease)\b/i.test(clean) && /\b(collect|receive|record|add|jama|mila|wasool)\b/i.test(clean);
  const isDirectFlatRent = /\b(flat|unit|shop)\s*#?\s*[0-9a-z-]+\s*(?:rent|kiraya)\b/i.test(clean);

  if (isRentIntent || isDirectFlatRent) {
    if (!amount) {
      return {
        isClarification: true,
        message: 'Please specify the rent amount to collect (e.g. "Collect Rs. 25,000 rent from Flat 4 in UBL").',
      };
    }

    if (!entities.property && !entities.tenant) {
      return {
        isClarification: true,
        message: 'Please specify which property, unit, or tenant this rent is for. Active properties:\n' +
          entities.allProperties.map(p => `- ${p.plazaName || p.propertyName}`).join('\n'),
      };
    }

    // Disbursing/Receiving Account (defaults to UBL, Bank or Cash)
    let receivingAcc = entities.accounts[0] || entities.allAccounts.find(a => /ubl/i.test(a.name)) || entities.allAccounts.find(a => a.type === 'BANK') || entities.allAccounts[0];

    // Property and Unit resolution
    const propName = entities.property ? (entities.property.plazaName || entities.property.propertyName) : (entities.agreement?.propertyId?.plazaName || 'Property');
    const unitName = entities.unit ? (entities.unit.unitName || entities.unit.unitNumber) : (entities.agreement?.unitId?.unitName || 'Unit');
    const tenantName = entities.tenant ? entities.tenant.fullName : (entities.agreement?.tenantId?.fullName || 'Tenant');

    const rentMonthKey = period.label !== 'default-current' ? `${period.year}-${String(period.month).padStart(2, '0')}` : getUtcMonthKey(new Date());
    const nextReceipt = `RR-${rentMonthKey.slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      isProposal: true,
      actionType: 'CREATE_RENT',
      summary: {
        type: 'Rent Collection',
        property: `${propName}${unitName ? ` (${unitName})` : ''}`,
        tenant: tenantName,
        amount: round2(amount),
        account: `${receivingAcc.name} (${receivingAcc.type})`,
        rentMonth: rentMonthKey,
        date: new Date().toISOString().slice(0, 10),
        voucherPreview: nextReceipt,
      },
      payload: {
        amount: round2(amount),
        propertyId: entities.property ? String(entities.property._id) : (entities.agreement?.propertyId?._id ? String(entities.agreement.propertyId._id) : null),
        unitId: entities.unit ? String(entities.unit._id) : (entities.agreement?.unitId?._id ? String(entities.agreement.unitId._id) : null),
        tenantId: entities.tenant ? String(entities.tenant._id) : (entities.agreement?.tenantId?._id ? String(entities.agreement.tenantId._id) : null),
        agreementId: entities.agreement ? String(entities.agreement._id) : null,
        receivingAccountId: String(receivingAcc._id),
        rentMonth: rentMonthKey,
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: receivingAcc.type === 'CASH' ? 'CASH' : 'BANK_TRANSFER',
        description: `Rent received for ${propName} ${unitName ? `- ${unitName}` : ''} (${rentMonthKey})`,
      },
    };
  }

  // -------------------------------------------------------------
  // 7. EXPENSE ENTRY
  // e.g. "Record Rs. 5,000 electricity expense under Electricity", "Add Rs. 20,000 repair expense for Property ABC"
  // -------------------------------------------------------------
  const isExpenseIntent = /\b(expense|kharcha|spent|cost|paid|bill)\b/i.test(clean) && /\b(record|add|enter|darj|dalo)\b/i.test(clean);
  const isExplicitExpenseHead = entities.category && amount && (clean.includes('record') || clean.includes('add') || clean.includes('expense') || clean.includes('paid'));

  if (isExpenseIntent || isExplicitExpenseHead) {
    if (!amount) {
      return {
        isClarification: true,
        message: 'Please specify the expense amount to record (e.g. "Record Rs. 5,000 electricity expense").',
      };
    }

    if (!entities.category) {
      return {
        isClarification: true,
        message: 'Please specify the expense head or category. Common heads:\n' +
          entities.allCategories.filter(c => c.type === 'EXPENSE').slice(0, 8).map(c => `- ${c.name}`).join('\n'),
      };
    }

    // Disbursing Account (defaults to Cash in Hand or first bank)
    let disbursingAccount = entities.accounts[0] || entities.allAccounts.find(a => a.type === 'CASH') || entities.allAccounts[0];

    const propId = entities.property ? String(entities.property._id) : null;
    const unitId = entities.unit ? String(entities.unit._id) : null;

    let classification = 'GENERAL_EXPENSE';
    if (unitId) classification = 'UNIT_EXPENSE';
    else if (propId) classification = 'PROPERTY_OWN_EXPENSE';

    const nextVoucher = await suggestNextVoucherNumber(new Date());

    return {
      isProposal: true,
      actionType: 'CREATE_EXPENSE',
      summary: {
        type: 'Expense Voucher',
        categoryHead: entities.category.name,
        amount: round2(amount),
        disbursingAccount: `${disbursingAccount.name} (${disbursingAccount.type})`,
        propertyAllocation: entities.property ? (entities.property.plazaName || entities.property.propertyName) : 'General Office / Foundation',
        classification,
        date: new Date().toISOString().slice(0, 10),
        voucherPreview: nextVoucher,
      },
      payload: {
        amount: round2(amount),
        categoryId: String(entities.category._id),
        crAccountId: String(disbursingAccount._id),
        propertyId: propId,
        unitId: unitId,
        expenseClassification: classification,
        voucherNo: nextVoucher,
        detail: `${entities.category.name} expense: PKR ${amount.toLocaleString('en-PK')}${entities.property ? ` (${entities.property.plazaName || entities.property.propertyName})` : ''}`,
        date: new Date().toISOString().slice(0, 10),
      },
    };
  }

  // Not an action or incomplete
  return null;
}
