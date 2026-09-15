import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const provisionUsers = async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB.');

    const targetUsers = [
      {
        name: 'Fahad Sb',
        email: 'fahad@pixxtechnologies.com',
        password: 'admin12345',
        role: 'ADMIN_PUBLISHER',
      },
      {
        name: 'Khurshid Anwar',
        email: 'khurshid@pixxtechnologies.com',
        password: 'khurshid12345',
        role: 'ADMIN',
      },
      {
        name: 'Sarfraz',
        email: 'sarfraz@pixxtechnologies.com',
        password: 'sarfraz12345',
        role: 'DATA_ENTRY',
      },
      {
        name: 'System Administrator',
        email: 'admin@pixxtechnologies.com',
        password: 'admin12345',
        role: 'ADMIN_PUBLISHER',
      },
      {
        name: 'Data Entry Operator',
        email: 'entry@pixxtechnologies.com',
        password: 'entry12345',
        role: 'DATA_ENTRY',
      },
    ];

    for (const u of targetUsers) {
      let existing = await User.findOne({ email: u.email.toLowerCase() });
      if (existing) {
        existing.role = u.role;
        existing.name = u.name;
        existing.isActive = true;
        await existing.save();
        console.log(`Updated user: ${u.name} (${u.email}) [${u.role}]`);
      } else {
        await User.create({
          name: u.name,
          email: u.email.toLowerCase(),
          password: u.password,
          role: u.role,
          isActive: true,
        });
        console.log(`Created user: ${u.name} (${u.email}) [${u.role}]`);
      }
    }

    console.log('All 3 primary personas + compatibility users provisioned successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Provisioning failed:', err);
    process.exit(1);
  }
};

provisionUsers();
