import dotenv from 'dotenv';
dotenv.config({ path: './Backend/.env' });
import connectDB from '../config/db.js';
import Property from '../models/Property.js';

await connectDB();

const prop = await Property.findById('6aa7f0b90220e9e0c82d98c8').lean();
const u302 = prop.units.find(u => u._id.toString() === '6aa7f0b90220e9e0c82d98cc');
console.log(JSON.stringify(u302, null, 2));

process.exit(0);
