import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import Property from '../models/Property.js';

dotenv.config();

const classify = (record, propertiesById) => {
  if (!record.propertyId) return { classification: 'GENERAL_EXPENSE', safe: true };
  const property = propertiesById.get(record.propertyId.toString());
  if (!property) return { classification: null, safe: false };
  if (!record.unitId) return { classification: 'PROPERTY_OWN_EXPENSE', safe: true };
  const belongs = (property.units || []).some(
    (unit) => unit._id?.toString() === record.unitId.toString()
  );
  return belongs
    ? { classification: 'UNIT_EXPENSE', safe: true }
    : { classification: null, safe: false };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const [properties, transactions, pendingEntries] = await Promise.all([
    Property.find({}).lean(),
    Transaction.find({ transactionType: 'EXPENSE', expenseClassification: null }).lean(),
    PendingEntry.find({ entryType: 'EXPENSE', expenseClassification: null }).lean(),
  ]);
  const propertiesById = new Map(properties.map((property) => [property._id.toString(), property]));
  let classified = 0;
  let unresolved = 0;

  for (const record of transactions) {
    const result = classify(record, propertiesById);
    if (!result.safe) {
      unresolved += 1;
      continue;
    }
    await Transaction.updateOne(
      { _id: record._id, expenseClassification: null },
      { $set: { expenseClassification: result.classification } }
    );
    classified += 1;
  }

  for (const record of pendingEntries) {
    const result = classify(record, propertiesById);
    if (!result.safe) {
      unresolved += 1;
      continue;
    }
    await PendingEntry.updateOne(
      { _id: record._id, expenseClassification: null },
      { $set: { expenseClassification: result.classification } }
    );
    classified += 1;
  }

  console.log(`Classified ${classified} expense records.`);
  console.log(`Left ${unresolved} records unchanged because their links were not safely resolvable.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Expense classification backfill failed:', error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
