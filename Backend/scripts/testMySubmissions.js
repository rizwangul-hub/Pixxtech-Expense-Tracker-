import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import PendingEntry from '../models/PendingEntry.js';
import User from '../models/User.js';

async function test() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const sarfraz = await User.findOne({ name: 'Sarfraz' }).lean();
  const khurshid = await User.findOne({ name: new RegExp('Khurshid', 'i') }).lean();
  const admin = await User.findOne({ role: 'ADMIN_PUBLISHER' }).lean();

  console.log('--- USERS ---');
  console.log('Sarfraz:', sarfraz?._id, sarfraz?.role);
  console.log('Khurshid:', khurshid?._id, khurshid?.role);
  console.log('Admin:', admin?._id, admin?.role);

  // Existing getMySubmissions query logic:
  const getQueryForUser = (user) => {
    return {
      $or: [
        { submittedBy: user._id },
        { status: { $in: ['PENDING_VERIFICATION', 'EDITED'] } },
      ],
    };
  };

  const resSarfraz = await PendingEntry.find(getQueryForUser(sarfraz)).lean();
  const resKhurshid = await PendingEntry.find(getQueryForUser(khurshid)).lean();
  const resAdmin = await PendingEntry.find(getQueryForUser(admin)).lean();

  console.log('\n--- EXISTING QUERY RESULTS ---');
  console.log('Sarfraz sees:', resSarfraz.length, 'pending entries');
  console.log('Khurshid sees:', resKhurshid.length, 'pending entries');
  console.log('Admin sees:', resAdmin.length, 'pending entries');

  // Proposed updated query logic:
  const newQuery = {
    $or: [
      { status: { $in: ['PENDING_VERIFICATION', 'EDITED'] } },
      { submittedBy: khurshid?._id },
    ],
  };
  const resNew = await PendingEntry.find(newQuery).lean();
  console.log('\n--- PROPOSED UPDATED QUERY RESULT ---');
  console.log('With updated query, Khurshid/Admin sees:', resNew.length, 'pending entries');

  await mongoose.disconnect();
}

test().catch(console.error);
