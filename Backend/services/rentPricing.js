export const getAgreedMonthlyRent = (unit, activeAgreement) => {
  const rent = activeAgreement?.monthlyRent ?? unit?.agreedRent ?? 0;
  const numericRent = Number(rent);
  return Number.isFinite(numericRent) ? numericRent : 0;
};
