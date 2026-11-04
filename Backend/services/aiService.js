/**
 * AI Service for Transaction Narration Enhancement using Google Gemini API
 * with automatic fallback to offline bookkeeping polisher if key is absent or unreachable.
 */

// Dictionary of common typos, abbreviations, and financial terms
const SPELLING_AND_GRAMMAR_MAP = [
  // Payments & Actions
  [/\bpayd\b/gi, 'Paid'],
  [/\bpd\b/gi, 'Paid'],
  [/\bpayed\b/gi, 'Paid'],
  [/\bpayment\s+for\b/gi, 'Payment for'],
  [/\brecvd\b/gi, 'Received'],
  [/\brecd\b/gi, 'Received'],
  [/\brcvd\b/gi, 'Received'],
  [/\brecived\b/gi, 'Received'],
  [/\brecive\b/gi, 'Receive'],
  [/\breceving\b/gi, 'Receiving'],

  // Bills & Utilities
  [/\belec\b/gi, 'Electricity'],
  [/\belectric\b/gi, 'Electricity'],
  [/\belectrcity\b/gi, 'Electricity'],
  [/\beletricity\b/gi, 'Electricity'],
  [/\bbil\b/gi, 'Bill'],
  [/\bbils\b/gi, 'Bills'],
  [/\butilty\b/gi, 'Utility'],
  [/\butilites\b/gi, 'Utilities'],
  [/\bptcl\b/gi, 'PTCL'],
  [/\bintenet\b/gi, 'Internet'],
  [/\bwifi\b/gi, 'Wi-Fi'],

  // Maintenance & Repairs
  [/\bmaint\b/gi, 'Maintenance'],
  [/\bmaintanance\b/gi, 'Maintenance'],
  [/\bmaintance\b/gi, 'Maintenance'],
  [/\bmentenance\b/gi, 'Maintenance'],
  [/\brepr\b/gi, 'Repair'],
  [/\brepairng\b/gi, 'Repairing'],
  [/\bsanitry\b/gi, 'Sanitary'],
  [/\bplumbar\b/gi, 'Plumber'],
  [/\belectrision\b/gi, 'Electrician'],
  [/\bpant\b/gi, 'Paint'],
  [/\bpainting\s+work\b/gi, 'Painting Work'],

  // Office & General
  [/\bofice\b/gi, 'Office'],
  [/\boff\b/gi, 'Office'],
  [/\boffce\b/gi, 'Office'],
  [/\bstatnery\b/gi, 'Stationery'],
  [/\bstationry\b/gi, 'Stationery'],
  [/\bprintng\b/gi, 'Printing'],
  [/\bgen\b/gi, 'General'],
  [/\bexp\b/gi, 'Expense'],
  [/\bexpens\b/gi, 'Expense'],
  [/\bexpeses\b/gi, 'Expenses'],
  [/\bpurches\b/gi, 'Purchase'],
  [/\bpurhase\b/gi, 'Purchase'],

  // Staff & Salaries
  [/\bsal\b/gi, 'Salary'],
  [/\bsalarys\b/gi, 'Salaries'],
  [/\bslry\b/gi, 'Salary'],
  [/\bstaf\b/gi, 'Staff'],
  [/\bstff\b/gi, 'Staff'],
  [/\badv\b/gi, 'Advance'],
  [/\badvnc\b/gi, 'Advance'],
  [/\bloan\s+ded\b/gi, 'Loan Deduction'],

  // Locations & Plazas
  [/\bbahria\s+tawn\b/gi, 'Bahria Town'],
  [/\bbahria\s+town\b/gi, 'Bahria Town'],
  [/\bdha\b/gi, 'DHA'],
  [/\bcca\b/gi, 'CCA'],
  [/\blake\s+city\b/gi, 'Lake City'],
  [/\banarkali\b/gi, 'Anarkali'],
  [/\bexecutive\s+lodge\b/gi, 'Executive Lodge'],
  [/\bdeal\s+land\b/gi, 'Deal Land'],

  // Banking & Currency
  [/\babl\b/gi, 'ABL'],
  [/\bubl\b/gi, 'UBL'],
  [/\bhbl\b/gi, 'HBL'],
  [/\bmcb\b/gi, 'MCB'],
  [/\balfalah\b/gi, 'Bank Alfalah'],
  [/\btrf\b/gi, 'Transfer'],
  [/\btransfr\b/gi, 'Transfer'],
  [/\bcheq\b/gi, 'Cheque'],
  [/\bchq\b/gi, 'Cheque'],
  [/\bpkr\b/gi, 'PKR'],
  [/\brs\.?\b/gi, 'Rs.'],
];

// Offline rule-based accounting polisher
export const polishNarrationOffline = (rawText = '', context = {}) => {
  let text = (rawText || '').trim();
  const { type = 'EXPENSE', property, unit, category, fromAccount, toAccount, receivedFrom, amount, rentMonth } = context;

  if (!text) {
    if (type === 'RENT' || type === 'RENT_RECEIVED') {
      const propPart = property ? property : 'Property';
      const unitPart = unit ? ` - ${unit}` : '';
      const monthPart = rentMonth ? ` for ${rentMonth}` : '';
      return `Rent Received: ${propPart}${unitPart}${monthPart}`;
    }
    if (type === 'TRANSFER' || type === 'INTERNAL_TRANSFER') {
      return `Internal Funds Transfer: Transferred from ${fromAccount || 'Source Account'} to ${toAccount || 'Receiving Account'}`;
    }
    if (type === 'OTHER_INCOME') {
      return `Other Income Received: ${category || receivedFrom || 'Receipt'} ${amount ? `(PKR ${Number(amount).toLocaleString()})` : ''}`.trim();
    }
    return category ? `Payment for ${category}` : 'Transaction recorded';
  }

  // Apply spelling and terminology fixes
  for (const [pattern, replacement] of SPELLING_AND_GRAMMAR_MAP) {
    text = text.replace(pattern, replacement);
  }

  // Sentence casing & cleanup
  text = text.replace(/\s+/g, ' ').replace(/[,;]+$/, '').trim();

  // If text starts with lower-case or colloquial verb, structure it elegantly
  if (/^paid\b/i.test(text)) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  } else if (/^(payment|bill|salary|rent|transfer|repair|fuel|office)\b/i.test(text)) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  } else {
    // If it's a raw phrase like "electricity bill", prepend appropriate context verb
    if (type === 'EXPENSE' && !/^(paid|payment|purchase|advance|salary|bill)/i.test(text)) {
      text = `Paid for ${text}`;
    } else {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
  }

  // Clean trailing punctuation and ensure neat sentence
  if (!/[.!?]$/.test(text)) {
    text += '.';
  }

  return text;
};

/**
 * Call Google Gemini API to enhance transaction narration
 */
export const enhanceNarrationWithGemini = async (rawText = '', context = {}) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return {
      success: true,
      engine: 'rule-based',
      enhanced: polishNarrationOffline(rawText, context),
      note: 'Polished using local accounting rules. Set GEMINI_API_KEY in Backend/.env for Gemini AI.',
    };
  }

  const { type = 'EXPENSE', property, unit, category, fromAccount, toAccount, receivedFrom, amount, rentMonth } = context;

  const prompt = `You are a professional chartered accountant and corporate bookkeeping specialist for Pixx Technologies in Pakistan.
The data entry operator entered this transaction draft narration with potential spelling errors, typos, or poor grammar:
"${rawText}"

Transaction Metadata:
- Transaction Type: ${type}
- Property / Plaza: ${property || 'N/A'}
- Unit / Shop: ${unit || 'N/A'}
- Period / Month: ${rentMonth || 'N/A'}
- Expense Category: ${category || 'N/A'}
- Payer / Recipient: ${receivedFrom || 'N/A'}
- Paid From (Account): ${fromAccount || 'N/A'}
- Paid To (Account): ${toAccount || 'N/A'}
- Amount: ${amount ? `PKR ${amount}` : 'N/A'}

Your Objective:
1. Fix ALL spelling mistakes, typographical errors, and grammatical flaws.
2. Upgrade and polish the sentence into a clear, professional, elegant accounting journal narration suitable for official audited ledgers and monthly funds statements.
3. Preserve all proper names, voucher/receipt references, cheque numbers, unit numbers, and specific dates.
4. Capitalize proper nouns and acronyms (e.g. Bahria Town, DHA, ABL, UBL, HBL, PTCL, PKR).

CRITICAL OUTPUT RULES:
- Output ONLY the single final enhanced narration sentence.
- Do NOT output greetings, explanations, options, bullet points, or markdown formatting (no quotes, no bold asterisks).`;

  // Active production models
  const models = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim()) {
          // Clean quotes, markdown bold, bullet points, or "Option 1:" prefixes if model added them
          const cleaned = candidateText
            .trim()
            .replace(/^["'`]|["'`]$/g, '')
            .replace(/^\*\*.*?\*\*:?\s*/i, '')
            .replace(/^>+\s*/, '')
            .split('\n')
            .map((line) => line.trim().replace(/^[-*•]\s*/, '').replace(/^["'`]|["'`]$/g, ''))
            .filter((line) => line.length > 5)[0] || candidateText.trim();

          const finalResult = cleaned.replace(/^["'`]|["'`]$/g, '').trim();

          if (finalResult.length > 3) {
            return {
              success: true,
              engine: `gemini (${model})`,
              enhanced: finalResult,
            };
          }
        }
      }
    } catch (err) {
      console.warn(`[Gemini API Warning] Model ${model} failed:`, err.message);
    }
  }

  // Graceful fallback to smart offline polisher if Gemini network request fails
  return {
    success: true,
    engine: 'rule-based-fallback',
    enhanced: polishNarrationOffline(rawText, context),
    note: 'Fallback to offline smart accounting polisher.',
  };
};
