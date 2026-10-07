import { round2 } from './ledgerService.js';

export const calculateLiveAccountBalances = (accounts, transactions) => {
  const netMovementByAccount = new Map();

  transactions.forEach((transaction) => {
    if (/^(REVERSED|VOID)$/i.test(transaction.status || '')) return;

    const amount = Number(transaction.amount) || 0;
    const debitId = transaction.drAccountId?.toString();
    const creditId = transaction.crAccountId?.toString();

    if (debitId) {
      netMovementByAccount.set(
        debitId,
        (netMovementByAccount.get(debitId) || 0) + amount
      );
    }
    if (creditId) {
      netMovementByAccount.set(
        creditId,
        (netMovementByAccount.get(creditId) || 0) - amount
      );
    }
  });

  return new Map(
    accounts.map((account) => [
      account._id.toString(),
      round2(
        (Number(account.openingBalance) || 0) +
          (netMovementByAccount.get(account._id.toString()) || 0)
      ),
    ])
  );
};
