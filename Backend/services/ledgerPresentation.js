export const getLiquidityLedgerAmounts = (transaction, accountId) => {
  const accountIdString = accountId?.toString();
  const debitAccountId = transaction.drAccountId?._id ?? transaction.drAccountId;
  const creditAccountId = transaction.crAccountId?._id ?? transaction.crAccountId;
  const isDebitAccount = debitAccountId?.toString() === accountIdString;
  const isCreditAccount = creditAccountId?.toString() === accountIdString;
  const amount = Number(transaction.amount || 0);

  return {
    debit: isCreditAccount ? amount : 0,
    credit: isDebitAccount ? amount : 0,
    balanceChange: (isDebitAccount ? amount : 0) - (isCreditAccount ? amount : 0),
  };
};

export const getLiquidityStatementAmounts = (entry, accountName) => ({
  debit: Number(entry.crAmount || 0),
  credit: Number(entry.drAmount || 0),
  debitAccount: entry.crAmount ? entry.counterpartyAccount : accountName,
  creditAccount: entry.drAmount ? entry.counterpartyAccount : accountName,
});

export const getBankStatementHeading = (accountName, accountType) => {
  if (accountType === 'CASH') {
    return { title: 'Pixx Technologies', subtitle: accountName };
  }
  if (accountType === 'SUSPENSE') {
    return { title: accountName, subtitle: 'Suspense / Holding Account' };
  }

  const holder = accountName.match(/\(([^)]+)\)/)?.[1]?.trim() || accountName;

  if (/Bank Al[- ]Falah/i.test(accountName)) {
    return { title: 'Bank Al-Falah', subtitle: holder };
  }
  if (/\bUBL\b/i.test(accountName)) {
    return { title: 'UBL', subtitle: holder };
  }
  if (/\bABL\b|Allied Bank/i.test(accountName)) {
    return { title: 'Allied Bank', subtitle: holder };
  }

  return { title: accountName, subtitle: holder };
};
