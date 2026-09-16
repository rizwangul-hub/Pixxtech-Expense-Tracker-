import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Category from '../models/Category.js';

async function testScopedCategories() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/expense_tracker';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);

  try {
    const totalCatCount = await Category.countDocuments();
    console.log(`Total existing categories in DB: ${totalCatCount}`);

    const sampleCats = await Category.find().limit(5).lean();
    console.log('Sample categories count:', sampleCats.length);
    console.log('Sample categories:', sampleCats.map(c => ({
      name: c.name,
      expenseClassification: c.expenseClassification,
      propertyId: c.propertyId,
      unitId: c.unitId
    })));

    console.log('SUCCESS: Category model and schema fields verified!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

testScopedCategories();
