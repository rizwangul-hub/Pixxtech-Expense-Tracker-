import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import Property from '../models/Property.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixx_expense_tracker';

async function consolidateCanonicalHeads() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[Migration]: Connected to MongoDB');

    // 1. Consolidate GENERAL_EXPENSE categories into ONE single "General" head
    const generalCats = await Category.find({
      $or: [
        { expenseClassification: 'GENERAL_EXPENSE' },
        { expenseClassification: { $exists: false } },
        { propertyId: null, unitId: null },
      ],
      type: 'EXPENSE',
    }).sort({ createdAt: 1 });

    if (generalCats.length > 0) {
      const masterGeneral = generalCats[0];
      masterGeneral.name = 'General';
      masterGeneral.expenseClassification = 'GENERAL_EXPENSE';
      masterGeneral.propertyId = null;
      masterGeneral.unitId = null;
      await masterGeneral.save();
      console.log(`[General Head Master]: ID = ${masterGeneral._id}, Name = '${masterGeneral.name}'`);

      for (let i = 1; i < generalCats.length; i++) {
        const dup = generalCats[i];
        console.log(`  Merging general head '${dup.name}' (${dup._id}) -> '${masterGeneral.name}'...`);
        await Transaction.updateMany({ categoryId: dup._id }, { categoryId: masterGeneral._id });
        await PendingEntry.updateMany({ categoryId: dup._id }, { categoryId: masterGeneral._id });
        await Category.findByIdAndDelete(dup._id);
      }
    } else {
      const newGeneral = await Category.create({
        name: 'General',
        type: 'EXPENSE',
        expenseClassification: 'GENERAL_EXPENSE',
        propertyId: null,
        unitId: null,
      });
      console.log(`[Created General Head]: ID = ${newGeneral._id}`);
    }

    // 2. Consolidate PROPERTY_OWN_EXPENSE categories per Property
    const properties = await Property.find({}).lean();
    for (const prop of properties) {
      const propId = prop._id;
      const plazaName = (prop.plazaName || prop.propertyName || 'Property').trim();

      const propCats = await Category.find({
        type: 'EXPENSE',
        expenseClassification: 'PROPERTY_OWN_EXPENSE',
        propertyId: propId,
        $or: [{ unitId: null }, { unitId: { $exists: false } }],
      }).sort({ createdAt: 1 });

      if (propCats.length > 0) {
        const masterProp = propCats[0];
        masterProp.name = plazaName;
        await masterProp.save();
        console.log(`[Property Head Master] '${plazaName}': ID = ${masterProp._id}`);

        for (let i = 1; i < propCats.length; i++) {
          const dup = propCats[i];
          console.log(`  Merging property head '${dup.name}' (${dup._id}) -> '${masterProp.name}'...`);
          await Transaction.updateMany({ categoryId: dup._id }, { categoryId: masterProp._id });
          await PendingEntry.updateMany({ categoryId: dup._id }, { categoryId: masterProp._id });
          await Category.findByIdAndDelete(dup._id);
        }
      } else {
        const newPropHead = await Category.create({
          name: plazaName,
          type: 'EXPENSE',
          expenseClassification: 'PROPERTY_OWN_EXPENSE',
          propertyId: propId,
          unitId: null,
        });
        console.log(`[Created Property Head] '${plazaName}': ID = ${newPropHead._id}`);
      }

      // 3. Consolidate UNIT_EXPENSE categories per Unit
      for (const unit of prop.units || []) {
        const unitId = unit._id;
        const unitLabel = (unit.unitName || unit.unitNumber || unit.name || 'Unit').trim();
        const expectedUnitName = `${plazaName} - ${unitLabel}`;

        const unitCats = await Category.find({
          type: 'EXPENSE',
          expenseClassification: 'UNIT_EXPENSE',
          propertyId: propId,
          unitId: unitId,
        }).sort({ createdAt: 1 });

        if (unitCats.length > 0) {
          const masterUnit = unitCats[0];
          masterUnit.name = expectedUnitName;
          await masterUnit.save();
          console.log(`  [Unit Head Master] '${expectedUnitName}': ID = ${masterUnit._id}`);

          for (let i = 1; i < unitCats.length; i++) {
            const dup = unitCats[i];
            console.log(`    Merging unit head '${dup.name}' (${dup._id}) -> '${masterUnit.name}'...`);
            await Transaction.updateMany({ categoryId: dup._id }, { categoryId: masterUnit._id });
            await PendingEntry.updateMany({ categoryId: dup._id }, { categoryId: masterUnit._id });
            await Category.findByIdAndDelete(dup._id);
          }
        }
      }
    }

    console.log('[Migration Completed Successfully]');
  } catch (err) {
    console.error('[Migration Error]:', err);
  } finally {
    await mongoose.disconnect();
  }
}

consolidateCanonicalHeads();
