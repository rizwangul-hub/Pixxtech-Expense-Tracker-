import { getUtcMonthKey } from '../salaryReportingService.js';

/**
 * Roman Urdu & English Financial Synonyms Dictionary
 */
const ROMAN_URDU_EXPENSE_TERMS = ['kharcha', 'kharchay', 'kharchy', 'kharch', 'akhrajat', 'expense', 'expenses', 'expens', 'exps', 'spent', 'cost'];
const ROMAN_URDU_INCOME_TERMS = ['income', 'kamai', 'amadani', 'aamdani', 'wasooli', 'collection'];
const ROMAN_URDU_RENT_TERMS = ['kiraya', 'kiraye', 'kirayaat', 'rent', 'rental'];
const ROMAN_URDU_OUTSTANDING_TERMS = ['baqi', 'baki', 'outstanding', 'arrears', 'overdue', 'lena hai', 'pending rent', 'unpaid'];
const ROMAN_URDU_SALARY_TERMS = ['salary', 'salaries', 'salry', 'tankhwah', 'tankhwa', 'tanha', 'pay', 'payroll', 'muavza', 'earn'];
const ROMAN_URDU_LOAN_TERMS = ['loan', 'karza', 'qarz', 'advance', 'advance salary', 'peshgi'];
const ROMAN_URDU_BALANCE_TERMS = ['balance', 'balances', 'paisa', 'paise', 'bache hue', 'total balance'];
const ROMAN_URDU_BANK_TERMS = ['bank', 'banks', 'bankon'];
const ROMAN_URDU_CASH_TERMS = ['cash', 'cash in hand', 'hath mein cash', 'rokad', 'naqad', 'custodian', 'petty cash'];
const ROMAN_URDU_LEDGER_TERMS = ['ledger', 'ladger', 'ledgar', 'statement', 'hisab', 'hisaab', 'khata', 'tareekh'];
const ROMAN_URDU_COMPARE_TERMS = ['compare', 'comparison', 'muazna', 'dono ka', 'dono ko compare', 'farq', 'difference', 'compare both'];

const MONTH_NAMES_MAP = {
  january: 1, jan: 1, janwari: 1,
  february: 2, feb: 2, farwari: 2,
  march: 3, mar: 3,
  april: 4, apr: 4, aprail: 4,
  may: 5, mai: 5,
  june: 6, jun: 6,
  july: 7, jul: 7, julai: 7,
  august: 8, aug: 8, agast: 8,
  september: 9, sep: 9, sept: 9, sitambar: 9,
  october: 10, oct: 10, oktubar: 10, octobar: 10, aktubar: 10,
  november: 11, nov: 11, navambar: 11, novambar: 11,
  december: 12, dec: 12, disambar: 12, decambar: 12,
};

/**
 * Detect greetings and general questions
 */
export function isGreetingOrGeneralQuestion(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim().toLowerCase();

  const greetingRegex = /^(hi|hello|hey|salam|assalam|aoa|asalam|assalamu\s*alaikum|assalam-o-alaikum|salaam|good\s*(morning|afternoon|evening)|kaise\s*ho|kaisay\s*ho|adaab)[\s!.,?]*$/i;
  if (greetingRegex.test(clean)) return true;

  const generalQuestionRegex = /^(what\s*(can\s*you\s*do|are\s*your\s*capabilities|do\s*you\s*do)|how\s*(do\s*you\s*work|can\s*you\s*help\s*me|to\s*use\s*you)|kya\s*(kar\s*sakte\s*ho|kaam\s*karte\s*ho)|help|madad|guide|who\s*are\s*you)[\s!.,?]*$/i;
  if (generalQuestionRegex.test(clean)) return true;

  // Question like "Can you help me?" or "Tell me about yourself"
  if (/^(can\s*you\s*help|tell\s*me\s*about\s*yourself|what\s*kind\s*of\s*questions\s*can\s*i\s*ask)[\s!.,?]*$/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Return warm, professional greeting and capabilities explanation
 */
export function getGreetingResponse() {
  return `### 👋 Assalam-o-Alaikum & Welcome to Pixx AI Finance Assistant!

I am your intelligent, read-only financial assistant for **Pakistan Property Finance & Expense Tracker**. All my insights are calculated directly from your actual verified database records in real time.

---

#### 💡 What You Can Ask Me:

- **💸 Expenses & Head Breakdown**:
  - *"Is month ka total kharcha kitna hai?"*
  - *"Show me October expenses by category"*
  - *"How much did we spend on fuel this month?"*

- **🏢 Property Performance & Classification**:
  - *"Which property has the highest expenses?"*
  - *"Bahria Town financial performance for October"*
  - *"Show 2nd Floor Deal Land profit and rent"*

- **🏠 Rent Collection & Arrears**:
  - *"How much rent did we collect this month?"*
  - *"Show outstanding rent and overdue tenants"*
  - *"Baqi kiraya kitna hai?"*

- **👥 Staff Salaries & Loans**:
  - *"What is Rizwan's salary?"* or *"Rizwan ki salary kitni hai?"*
  - *"Sabir ko kitna cash diya?"* or *"Sabir loan balance"*
  - *"Total payroll committed this month"*

- **🏦 Bank Accounts & Cash in Hand**:
  - *"Bank mein kitna balance hai?"*
  - *"What is our total cash in hand balance?"*
  - *"Meezan Bank ledger statement for October"*

- **📈 Monthly Comparisons & Trends**:
  - *"Compare October and September performance"*
  - *"Compare this month with previous month"*

- **🧾 Recent Vouchers & Activity**:
  - *"Show me the latest 10 transactions"*
  - *"Recent bank transfer vouchers"*

---
Feel free to ask in **English**, **Roman Urdu**, or **Urdu-English mix**. How can I help you analyze your finances today?`;
}

/**
 * Extract Month and Year from natural text
 */
export function resolvePeriodFromText(text, currentRefDate = new Date()) {
  const clean = String(text || '').toLowerCase();
  const currentKey = getUtcMonthKey(currentRefDate);
  const [currYear, currMonth] = currentKey.split('-').map(Number);

  // Year detection
  const yearMatch = clean.match(/\b(202[4-9]|203[0-9])\b/);
  const detectedYear = yearMatch ? parseInt(yearMatch[1], 10) : currYear;

  // "Last month" / "Previous month" / "Pichlay month"
  if (/\b(last\s*month|previous\s*month|pichl[a-z]*\s*(month|mahina|mahine)|guzashta\s*mahina)\b/i.test(clean)) {
    const prior = new Date(Date.UTC(currYear, currMonth - 2, 1));
    return {
      month: prior.getUTCMonth() + 1,
      year: prior.getUTCFullYear(),
      isRelative: true,
      label: 'previous-month',
    };
  }

  // "Current month" / "This month" / "Is month" / "Iss mahinay"
  if (/\b(this\s*month|current\s*month|is\s*month|iss?\s*mahine?|aaj|current)\b/i.test(clean)) {
    return {
      month: currMonth,
      year: currYear,
      isRelative: true,
      label: 'current-month',
    };
  }

  // Named month detection
  for (const [name, mNum] of Object.entries(MONTH_NAMES_MAP)) {
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(clean)) {
      return {
        month: mNum,
        year: detectedYear,
        isRelative: false,
        label: name,
      };
    }
  }

  return {
    month: currMonth,
    year: detectedYear,
    isRelative: false,
    label: 'default-current',
  };
}

/**
 * Detect entity mentions in query
 */
export function extractEntitiesFromQuery(query) {
  const clean = String(query || '').trim();
  const entities = {};

  // Common employee names in system
  const staffPatterns = [
    { pattern: /\b(rizwan(\s+ullah)?)\b/i, name: 'Rizwan' },
    { pattern: /\b(sabir(\s+nawaz)?)\b/i, name: 'Sabir' },
    { pattern: /\b(khurshid(\s+anwar)?)\b/i, name: 'Khurshid Anwar' },
    { pattern: /\b(sarfraz(\s+khan)?)\b/i, name: 'Sarfraz Khan' },
    { pattern: /\b(fahad(\s+rasheed)?)\b/i, name: 'Fahad Rasheed' },
    { pattern: /\b(kamran)\b/i, name: 'Kamran' },
    { pattern: /\b(uraan)\b/i, name: 'Uraan' },
    { pattern: /\b(amjad)\b/i, name: 'Amjad' },
    { pattern: /\b(tariq)\b/i, name: 'Tariq' },
    { pattern: /\b(bilal)\b/i, name: 'Bilal' },
  ];

  for (const item of staffPatterns) {
    if (item.pattern.test(clean)) {
      entities.employeeName = item.name;
      break;
    }
  }

  // Common properties
  const propertyPatterns = [
    { pattern: /\b(deal\s*land|2nd\s*floor\s*deal\s*land)\b/i, name: '2nd Floor Deal Land' },
    { pattern: /\b(bahria(\s*town)?)\b/i, name: 'Bahria Town' },
    { pattern: /\b(executive(\s*lodge)?)\b/i, name: 'Executive Lodge' },
    { pattern: /\b(plaza\s*\d+|commercial\s*plaza)\b/i, name: 'Commercial Plaza' },
  ];

  for (const item of propertyPatterns) {
    if (item.pattern.test(clean)) {
      entities.propertyName = item.name;
      break;
    }
  }

  // Common bank / cash accounts
  const accountPatterns = [
    { pattern: /\b(meezan(\s*bank)?)\b/i, name: 'Meezan Bank' },
    { pattern: /\b(alfalah|bank\s*alfalah)\b/i, name: 'Bank Alfalah' },
    { pattern: /\b(hbl|habib\s*bank)\b/i, name: 'HBL' },
    { pattern: /\b(mcb)\b/i, name: 'MCB' },
    { pattern: /\b(ubl)\b/i, name: 'UBL' },
    { pattern: /\b(sabir\s*cash|cash\s*in\s*hand|petty\s*cash|sarfraz\s*cash)\b/i, name: 'Cash' },
  ];

  for (const item of accountPatterns) {
    if (item.pattern.test(clean)) {
      entities.accountName = item.name;
      break;
    }
  }

  // Common expense heads / categories
  const categoryPatterns = [
    { pattern: /\b(fuel|petrol|diesel)\b/i, name: 'Fuel' },
    { pattern: /\b(utilities|bijli|electricity|gas|water)\b/i, name: 'Utilities' },
    { pattern: /\b(maintenance|repair|maramat)\b/i, name: 'Maintenance' },
    { pattern: /\b(food|khana|lunch|dinner|refreshment)\b/i, name: 'Food' },
    { pattern: /\b(office\s*supplies|stationery)\b/i, name: 'Office Supplies' },
  ];

  for (const item of categoryPatterns) {
    if (item.pattern.test(clean)) {
      entities.categoryName = item.name;
      break;
    }
  }

  return entities;
}

/**
 * Analyze multi-turn conversation history to extract active context
 */
export function extractConversationalContext(userMessage, history = []) {
  const currentEntities = extractEntitiesFromQuery(userMessage);
  const currentPeriod = resolvePeriodFromText(userMessage);

  // Analyze prior turns (newest to oldest)
  let lastTopic = undefined;
  let lastEmployee = undefined;
  let lastProperty = undefined;
  let lastAccount = undefined;
  let lastCategory = undefined;
  let lastPeriod = undefined;
  let priorPeriod = undefined;

  const validHistory = Array.isArray(history) ? history.filter(h => h && h.role === 'user' && typeof h.content === 'string') : [];

  for (let i = validHistory.length - 1; i >= 0; i--) {
    const priorText = validHistory[i].content.toLowerCase();
    const priorEntities = extractEntitiesFromQuery(priorText);
    const resolvedPriorPeriod = resolvePeriodFromText(priorText);

    if (!lastEmployee && priorEntities.employeeName) lastEmployee = priorEntities.employeeName;
    if (!lastProperty && priorEntities.propertyName) lastProperty = priorEntities.propertyName;
    if (!lastAccount && priorEntities.accountName) lastAccount = priorEntities.accountName;
    if (!lastCategory && priorEntities.categoryName) lastCategory = priorEntities.categoryName;

    if (!lastPeriod && resolvedPriorPeriod) {
      lastPeriod = resolvedPriorPeriod;
    } else if (lastPeriod && !priorPeriod && resolvedPriorPeriod && (resolvedPriorPeriod.month !== lastPeriod.month || resolvedPriorPeriod.year !== lastPeriod.year)) {
      priorPeriod = resolvedPriorPeriod;
    }

    if (!lastTopic) {
      if (ROMAN_URDU_EXPENSE_TERMS.some(t => priorText.includes(t))) lastTopic = 'EXPENSES';
      else if (ROMAN_URDU_RENT_TERMS.some(t => priorText.includes(t))) lastTopic = 'RENT';
      else if (ROMAN_URDU_SALARY_TERMS.some(t => priorText.includes(t))) lastTopic = 'SALARY';
      else if (ROMAN_URDU_LOAN_TERMS.some(t => priorText.includes(t))) lastTopic = 'LOAN';
      else if (ROMAN_URDU_INCOME_TERMS.some(t => priorText.includes(t))) lastTopic = 'INCOME';
      else if (ROMAN_URDU_BANK_TERMS.some(t => priorText.includes(t)) || ROMAN_URDU_CASH_TERMS.some(t => priorText.includes(t)) || ROMAN_URDU_BALANCE_TERMS.some(t => priorText.includes(t))) lastTopic = 'BALANCES';
      else if (ROMAN_URDU_LEDGER_TERMS.some(t => priorText.includes(t))) lastTopic = 'LEDGER';
    }
  }

  // Detect if current query is a follow-up or comparison
  const cleanCurrent = userMessage.trim().toLowerCase();
  const isComparisonQuery = ROMAN_URDU_COMPARE_TERMS.some(t => cleanCurrent.includes(t)) || /\b(compare\s*both|both\s*months|muazna)\b/i.test(cleanCurrent);
  const isEllipticalFollowUp = /^(what\s*about|aur|and|what\s*of|how\s*about)\b/i.test(cleanCurrent) || /^(october|november|december|last\s*month|pichlay\s*month)\??$/i.test(cleanCurrent);

  return {
    currentEntities,
    currentPeriod,
    inherited: {
      topic: lastTopic,
      employeeName: currentEntities.employeeName || lastEmployee,
      propertyName: currentEntities.propertyName || lastProperty,
      accountName: currentEntities.accountName || lastAccount,
      categoryName: currentEntities.categoryName || lastCategory,
      lastPeriod,
      priorPeriod,
    },
    isComparisonQuery,
    isEllipticalFollowUp,
  };
}

/**
 * Deterministic intent resolution & tool call synthesis
 * Used as a zero-hallucination intelligence layer and fallback
 */
export function resolveIntentAndToolCall(userMessage, context = null) {
  const clean = userMessage.trim().toLowerCase();
  const ctx = context || extractConversationalContext(userMessage, []);
  const period = ctx.currentPeriod;
  const inherited = ctx.inherited;

  // 1. Comparison Queries: "Compare both", "Compare October and November", "muazna karo"
  if (ctx.isComparisonQuery) {
    let m1 = period.month;
    let y1 = period.year;
    let m2 = inherited.lastPeriod?.month;
    let y2 = inherited.lastPeriod?.year;

    // Check if user specified two months in the current sentence
    const monthMatches = [];
    for (const [name, num] of Object.entries(MONTH_NAMES_MAP)) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(clean)) {
        monthMatches.push(num);
      }
    }

    if (monthMatches.length >= 2) {
      m1 = monthMatches[0];
      m2 = monthMatches[1];
    } else if (inherited.lastPeriod && inherited.priorPeriod) {
      m1 = inherited.lastPeriod.month;
      y1 = inherited.lastPeriod.year;
      m2 = inherited.priorPeriod.month;
      y2 = inherited.priorPeriod.year;
    } else if (!m2) {
      // Default to current vs last month
      const prior = new Date(Date.UTC(y1, m1 - 2, 1));
      m2 = prior.getUTCMonth() + 1;
      y2 = prior.getUTCFullYear();
    }

    return [{
      name: 'getMonthlyComparison',
      args: { month1: m1, year1: y1, month2: m2, year2: y2 || y1 },
    }];
  }

  // 2. Employee Specific Queries: Salary, Cash, Loan
  // "What is Rizwan's salary?", "Rizwan ki salary kitni hai?", "Sabir ko kitna cash diya?", "Sabir loan balance"
  const activeEmployee = ctx.currentEntities.employeeName || inherited.employeeName;
  const isLedgerQuery = ROMAN_URDU_LEDGER_TERMS.some(t => clean.includes(t));
  const isLoanOrCashGiven = ROMAN_URDU_LOAN_TERMS.some(t => clean.includes(t)) || /\b(kitna\s*cash\s*diya|cash\s*diya|loan\s*balance|karza)\b/i.test(clean);
  const isSalaryQuery = ROMAN_URDU_SALARY_TERMS.some(t => clean.includes(t)) || inherited.topic === 'SALARY';

  if (activeEmployee) {
    if (isLedgerQuery && ROMAN_URDU_CASH_TERMS.some(t => clean.includes(t))) {
      return [{
        name: 'getFinancialLedger',
        args: { kind: 'ACCOUNT', accountName: activeEmployee, month: period.month, year: period.year },
      }];
    }
    if (isLedgerQuery) {
      return [{
        name: 'getEmployeeLedger',
        args: { employeeName: activeEmployee },
      }];
    }
    if (isLoanOrCashGiven || isSalaryQuery || /^(what\s*about|aur)\s+/i.test(clean) && inherited.topic === 'SALARY') {
      return [{
        name: 'getSalarySummary',
        args: {
          employeeName: activeEmployee,
          month: period.month,
          year: period.year,
        },
      }];
    }
  }

  // 3. Account-specific / Ledger queries: "Meezan bank ledger", "Sabir cash account ledger", "Bank statement"
  const activeAccount = ctx.currentEntities.accountName || inherited.accountName;

  if (activeAccount && (isLedgerQuery || clean.includes('ledger') || clean.includes('statement') || clean.includes('khata'))) {
    return [{
      name: 'getAccountLedger',
      args: {
        accountName: activeAccount,
        month: period.month,
        year: period.year,
        limit: 15,
      },
    }];
  }

  // 4. Balances: "Bank mein kitna balance hai?", "Cash in hand kitna hai?", "Total balances"
  if (ROMAN_URDU_BALANCE_TERMS.some(t => clean.includes(t)) || clean.includes('balance') || clean.includes('kitne paise')) {
    let accountType = null;
    if (ROMAN_URDU_BANK_TERMS.some(t => clean.includes(t))) accountType = 'BANK';
    else if (ROMAN_URDU_CASH_TERMS.some(t => clean.includes(t))) accountType = 'CASH';

    return [{
      name: 'getAccountBalances',
      args: accountType ? { accountType } : {},
    }];
  }

  // 5. Property Financials: "Bahria Town performance", "Deal Land profit", "Property expenses"
  const activeProperty = ctx.currentEntities.propertyName || inherited.propertyName;
  if (activeProperty && (clean.includes('property') || clean.includes('plaza') || clean.includes('profit') || clean.includes('performance') || clean.includes('rent') || clean.includes('expense'))) {
    return [{
      name: 'getPropertyFinancialSummary',
      args: {
        propertyName: activeProperty,
        month: period.month,
        year: period.year,
      },
    }];
  }

  // 6. Outstanding Rent: "Baqi kiraya kitna hai?", "Overdue rent", "Outstanding rent"
  if (ROMAN_URDU_OUTSTANDING_TERMS.some(t => clean.includes(t))) {
    return [{
      name: 'getOutstandingRent',
      args: {
        month: period.month,
        year: period.year,
        ...(activeProperty ? { propertyName: activeProperty } : {}),
      },
    }];
  }

  // 7. Rent Collection: "Rent collected", "Kiraya kitna aya?", "Total rent collection"
  if (ROMAN_URDU_RENT_TERMS.some(t => clean.includes(t))) {
    return [{
      name: 'getRentCollectionSummary',
      args: {
        month: period.month,
        year: period.year,
        ...(activeProperty ? { propertyName: activeProperty } : {}),
      },
    }];
  }

  // 8. General / Category Expenses: "Is month ka total kharcha?", "Fuel kharcha", "October expenses"
  if (ROMAN_URDU_EXPENSE_TERMS.some(t => clean.includes(t)) || (ctx.isEllipticalFollowUp && inherited.topic === 'EXPENSES')) {
    const activeCategory = ctx.currentEntities.categoryName || inherited.categoryName;
    return [{
      name: 'getExpenseSummary',
      args: {
        month: period.month,
        year: period.year,
        ...(activeCategory ? { categoryName: activeCategory } : {}),
        ...(activeProperty ? { propertyName: activeProperty } : {}),
      },
    }];
  }

  // 9. Overall Income: "Pichlay month ki income", "Total amadani"
  if (ROMAN_URDU_INCOME_TERMS.some(t => clean.includes(t)) || (ctx.isEllipticalFollowUp && inherited.topic === 'INCOME')) {
    return [{
      name: 'getIncomeSummary',
      args: {
        month: period.month,
        year: period.year,
      },
    }];
  }

  // 10. General Salaries: "Salary disbursements", "Staff payroll"
  if (ROMAN_URDU_SALARY_TERMS.some(t => clean.includes(t)) || (ctx.isEllipticalFollowUp && inherited.topic === 'SALARY')) {
    return [{
      name: 'getSalarySummary',
      args: {
        month: period.month,
        year: period.year,
      },
    }];
  }

  // 11. Recent Transactions: "Latest vouchers", "Recent transactions", "Latest activity"
  if (/\b(recent|latest|transactions|vouchers|entries|activity)\b/i.test(clean)) {
    return [{
      name: 'getRecentTransactions',
      args: {
        month: period.month,
        year: period.year,
        limit: 10,
      },
    }];
  }

  return null;
}
