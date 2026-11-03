import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const Property = (await import('../models/Property.js')).default;
const props = await Property.find({}).lean();
console.log('Total properties:', props.length);
props.forEach(p => {
  console.log('Property:', p._id, JSON.stringify(p.plazaName), 'Units count:', p.units?.length);
  p.units?.forEach(u => console.log('   Unit:', u._id, JSON.stringify(u.unitName), 'tenant:', JSON.stringify(u.tenantName)));
});
process.exit(0);
