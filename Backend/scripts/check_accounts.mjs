import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const Account = (await import('../models/Account.js')).default;
const accounts = await Account.find({}).lean();
console.log('Total accounts:', accounts.length);
accounts.forEach(a => {
  console.log(JSON.stringify({ id: a._id, name: a.name, type: a.type, accountType: a.accountType, status: a.status, currentBalance: a.currentBalance }));
});
process.exit(0);
