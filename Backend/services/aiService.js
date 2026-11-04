/**
 * AI Service for Transaction Narration Enhancement using Google Gemini API
 * with automatic fallback to offline bookkeeping polisher if key is absent or unreachable.
 */

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

  // Common abbreviation dictionary
  const abbreviations = {
    '\\bac\\b': 'AC',
    '\\belec\\b': 'Electricity',
    '\\belectric\\b': 'Electricity',
    '\\bmaint\\b': 'Maintenance',
    '\\badv\\b': 'Advance',
    '\\btrf\\b': 'Transfer',
    '\\brec\\b': 'Received',
    '\\brecvd\\b': 'Received',
    '\\bpd\\b': 'Paid',
    '\\bsal\\b': 'Salary',
    '\\babl\\b': 'ABL',
    '\\bubl\\b': 'UBL',
    '\\bhbl\\b': 'HBL',
    '\\bmcb\\b': 'MCB',
    '\\bdha\\b': 'DHA',
    '\\bpkr\\b': 'PKR',
    '\\brs\\.?\\b': 'Rs.',
    '\\bexp\\b': 'Expense',
    '\\bgen\\b': 'General',
    '\\bbill\\b': 'Bill',
    '\\boff\\b': 'Office',
  };

  for (const [pattern, replacement] of Object.entries(abbreviations)) {
    text = text.replace(new RegExp(pattern, 'gi'), replacement);
  }

  // Capitalize first character
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // Remove multiple trailing punctuation or stray spaces
  text = text.replace(/\s+/g, ' ').replace(/[,;]+$/, '').trim();

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

  const prompt = `You are a professional accountant and bookkeeping specialist for Pixx Technologies in Pakistan.
The user entered this transaction narration draft into the accounting terminal:
"${rawText}"

Transaction Context:
- Type: ${type}
- Property: ${property || 'N/A'}
- Unit: ${unit || 'N/A'}
- Rent Month: ${rentMonth || 'N/A'}
- Expense Head / Category: ${category || 'N/A'}
- Received From / Payer: ${receivedFrom || 'N/A'}
- Disbursing Account (Paid From): ${fromAccount || 'N/A'}
- Receiving Account (Paid To): ${toAccount || 'N/A'}
- Amount: ${amount ? `PKR ${amount}` : 'N/A'}

Your task:
Correct all spelling, grammatical mistakes, and typos.
Transform this into a professional, concise, standard accounting journal narration suitable for official audited ledgers and monthly funds statements.
Rules:
1. Preserve all proper names, voucher/receipt references, cheque numbers, and key specifics.
2. Use standard financial conventions (e.g., "Paid for...", "Rent Received for...", "Internal Funds Transfer from...").
3. Capitalize proper nouns, bank acronyms (ABL, UBL, HBL, MCB), and locations (Bahria Town, DHA).
4. Output ONLY the improved narration text. Do NOT wrap in quotes. Do NOT add greetings, bullet points, explanations, or markdown.`;

  // Models to attempt in order
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 150,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim()) {
          const cleaned = candidateText.trim().replace(/^["']|["']$/g, '');
          return {
            success: true,
            engine: `gemini (${model})`,
            enhanced: cleaned,
          };
        }
      }
    } catch (err) {
      console.warn(`[Gemini API Warning] Model ${model} failed:`, err.message);
    }
  }

  // Graceful fallback if Gemini network request fails
  return {
    success: true,
    engine: 'rule-based-fallback',
    enhanced: polishNarrationOffline(rawText, context),
    note: 'Fallback to offline rules due to Gemini API connectivity.',
  };
};
