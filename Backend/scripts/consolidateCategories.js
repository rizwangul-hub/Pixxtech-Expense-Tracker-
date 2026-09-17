import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import Property from '../models/Property.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/expense_tracker';

async function consolidate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const properties = await Property.find({}).lean();
    console.log(`Found ${properties.length} properties.`);

    for (const prop of properties) {
      const propId = prop._id;
      const plazaName = (prop.plazaName || prop.propertyName || '').trim();

      // 1. Consolidate PROPERTY_OWN_EXPENSE categories
      const propCats = await Category.find({
        expenseClassification: 'PROPERTY_OWN_EXPENSE',
        propertyId: propId,
        $or: [{ unitId: null }, { unitId: { $exists: false } }],
      });

      if (propCats.length > 0) {
        const masterCat = propCats[0];
        masterCat.name = plazaName;
        await masterCat.save();
        console.log(`Master Property Head for '${plazaName}': ${masterCat._id} (${masterCat.name})`);

        for (let i = 1; i < propCats.length; i++) {
          const dupCat = propCats[i];
          console.log(`Merging duplicate category '${dupCat.name}' (${dupCat._id}) into '${masterCat.name}'...`);
          
          await Transaction.updateMany({ categoryId: dupCat._id }, { categoryId: masterCat._id });
          await PendingEntry.updateMany({ categoryId: dupCat._id }, { categoryId: masterCat._id });
          await Category.findByIdAndDelete(dupCat._id);
        }
      }

      // 2. Consolidate UNIT_EXPENSE categories per unit
      for (const unit of prop.units || []) {
        const unitId = unit._id;
        const unitLabel = (unit.unitName || unit.unitNumber || unit.name || 'Unit').trim();
        const expectedUnitHeadName = `${plazaName} - ${unitLabel}`;

        const unitCats = await Category.find({
          expenseClassification: 'UNIT_EXPENSE',
          propertyId: propId,
          unitId: unitId,
        });

        if (unitCats.length > 0) {
          const masterUnitCat = unitCats[0];
          masterUnitCat.name = expectedUnitHeadName;
          await masterUnitCat.save();
          console.log(`Master Unit Head for '${expectedUnitHeadName}': ${masterUnitCat._id}`);

          for (let i = 1; i < unitCats.length; i++) {
            const dupCat = unitCats[i];
            console.log(`Merging duplicate unit category '${dupCat.name}' (${dupCat._id}) into '${masterUnitCat.name}'...`);
            await Transaction.updateMany({ categoryId: dupCat._id }, { categoryId: masterUnitCat._id });
            await PendingEntry.updateMany({ categoryId: dupCat._id }, { categoryId: masterUnitCat._id });
            await Category.findByIdAndDelete(dupCat._id);
          }
        }
      }
    }

    console.log('Consolidation completed successfully.');
  } catch (err) {
    console.error('Consolidation error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

consolidate();
