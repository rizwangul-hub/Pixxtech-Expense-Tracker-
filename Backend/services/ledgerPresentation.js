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
