import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Property from '../models/Property.js';
import Category from '../models/Category.js';

async function seed() {
  console.log('Connecting to MongoDB...');
  await connectDB();

  try {
    const properties = await Property.find({}).lean();
    console.log(`Found ${properties.length} total properties.`);

    const STANDARD_PROPERTY_EXPENSES = ['Property tax', 'Entertainment'];
    const STANDARD_UNIT_EXPENSES = ['Maintenance', 'Electricity', 'Repair Maintenance', 'Commission'];

    let createdCount = 0;
    let totalUnitsCount = 0;

    for (const prop of properties) {
      const pId = prop._id.toString();
      const plazaName = prop.plazaName || prop.propertyName || 'Property';

      // 1. Provision Property Own Expenses
      for (const expName of STANDARD_PROPERTY_EXPENSES) {
        const existing = await Category.findOne({
          type: 'EXPENSE',
          expenseClassification: 'PROPERTY_OWN_EXPENSE',
          propertyId: pId,
          unitId: null,
          name: { $regex: `^${expName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        });

        if (!existing) {
          await Category.create({
            name: expName,
            type: 'EXPENSE',
            expenseClassification: 'PROPERTY_OWN_EXPENSE',
            propertyId: pId,
            unitId: null,
            isRentalHead: false,
          });
          console.log(`+ Created Property Expense: "${expName}" for ${plazaName}`);
          createdCount++;
        }
      }

      // 2. Provision Unit Expenses
      if (prop.units && Array.isArray(prop.units)) {
        totalUnitsCount += prop.units.length;
        for (const unit of prop.units) {
          const uId = unit._id.toString();
          const unitName = unit.unitName || unit.unitNumber || 'Unit';

          for (const expName of STANDARD_UNIT_EXPENSES) {
            const existing = await Category.findOne({
              type: 'EXPENSE',
              expenseClassification: 'UNIT_EXPENSE',
              propertyId: pId,
              unitId: uId,
              name: { $regex: `^${expName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
            });

            if (!existing) {
              await Category.create({
                name: expName,
                type: 'EXPENSE',
                expenseClassification: 'UNIT_EXPENSE',
                propertyId: pId,
                unitId: uId,
                isRentalHead: false,
              });
              console.log(`+ Created Unit Expense: "${expName}" for ${plazaName} -> ${unitName}`);
              createdCount++;
            }
          }
        }
      }
    }

    const totalCategoriesInDB = await Category.countDocuments({ type: 'EXPENSE' });
    console.log('\n--- SEEDING COMPLETE ---');
    console.log(`Processed: ${properties.length} properties, ${totalUnitsCount} units.`);
    console.log(`Newly Created Categories: ${createdCount}`);
    console.log(`Total Active Expense Categories in DB: ${totalCategoriesInDB}`);
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
