import dotenv from 'dotenv';
dotenv.config();
import connectDB from '../config/db.js';
import User from '../models/User.js';

async function addAdmin() {
  await connectDB();
  const existing = await User.findOne({ email: 'admin@pixxtechnologies.com' });
  if (!existing) {
    await User.create({
      name: 'System Administrator',
      email: 'admin@pixxtechnologies.com',
      password: 'admin12345',
      role: 'ADMIN_PUBLISHER',
      isActive: true,
    });
    console.log('✓ Added admin@pixxtechnologies.com successfully!');
  } else {
    console.log('admin@pixxtechnologies.com already exists.');
  }
  process.exit(0);
}

addAdmin();
