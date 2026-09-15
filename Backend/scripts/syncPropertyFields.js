import dotenv from 'dotenv';
dotenv.config();
import connectDB from '../config/db.js';
import Property from '../models/Property.js';

const syncFields = async () => {
  await connectDB();
  const properties = await Property.find({});
  console.log(`Found ${properties.length} properties to synchronize.`);

  for (const p of properties) {
    if (!p.propertyName && p.plazaName) {
      p.propertyName = p.plazaName;
    }
    if (!p.plazaName && p.propertyName) {
      p.plazaName = p.propertyName;
    }
    if (!p.propertyCode) {
      const cleaned = (p.propertyName || p.plazaName)
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 6)
        .toUpperCase();
      p.propertyCode = `PX-${cleaned || 'PROP'}-${Math.floor(100 + Math.random() * 900)}`;
    }
    if (!p.status) p.status = 'ACTIVE';
    if (p.isActive === undefined) p.isActive = true;

    // Synchronize units
    if (p.units && Array.isArray(p.units)) {
      p.units.forEach((u) => {
        if (!u.unitNumber) u.unitNumber = u.unitName;
        if (!u.status) {
          u.status = (u.tenantName && u.tenantName.trim()) ? 'OCCUPIED' : 'VACANT';
        }
        if (u.isActive === undefined) u.isActive = true;
      });
    }

    await p.save();
    console.log(`✓ Synced: ${p.propertyName} [${p.propertyCode}] - ${p.units.length} units (Occupied: ${p.occupiedUnits}, Vacant: ${p.vacantUnits})`);
  }

  process.exit(0);
};

syncFields().catch((err) => {
  console.error(err);
  process.exit(1);
});
