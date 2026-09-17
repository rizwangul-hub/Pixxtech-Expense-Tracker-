import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Account from '../models/Account.js';

const OFFICIAL_ACCOUNTS = [
  {
    name: 'Bank Al Falah (Kamran Ijaz Sb)',
    type: 'BANK',
    bankName: 'Bank Al Falah',
    ownerName: 'Kamran Ijaz Sb',
    openingBalance: 9705440.26,
    currentBalance: 8907740.18,
    keywords: ['al falah', 'alfalah', 'kamran ijaz'],
  },
  {
    name: 'UBL (Kamran Ijaz Sb)',
    type: 'BANK',
    bankName: 'UBL',
    ownerName: 'Kamran Ijaz Sb',
    openingBalance: 12528.60,
    currentBalance: 48276.29,
    keywords: ['ubl (kamran', 'ubl kamran'],
  },
  {
    name: 'UBL (Uraan Ventures)',
    type: 'BANK',
    bankName: 'UBL',
    ownerName: 'Uraan Ventures',
    openingBalance: 29113.79,
    currentBalance: 613113.79,
    keywords: ['ubl (uraan', 'ubl uraan'],
  },
  {
    name: 'ABL (Kamran Ijaz Sb)',
    type: 'BANK',
    bankName: 'ABL',
    ownerName: 'Kamran Ijaz Sb',
    openingBalance: 1460136.27,
    currentBalance: 1458786.16,
    keywords: ['abl (kamran', 'abl kamran'],
  },
  {
    name: 'ABL (Uraan Ventures)',
    type: 'BANK',
    bankName: 'ABL',
    ownerName: 'Uraan Ventures',
    openingBalance: 1146558.36,
    currentBalance: 1405494.36,
    keywords: ['abl (uraan', 'abl uraan'],
  },
  {
    name: 'Cash in Hand (Sarfaraz Sb)',
    type: 'CASH',
    cashHolder: 'Sarfaraz Sb',
    openingBalance: 0.00,
    currentBalance: 1653.00,
    keywords: ['sarfaraz', 'sarfraz'],
  },
  {
    name: 'Cash in Hand (Malik Naveed)',
    type: 'CASH',
    cashHolder: 'Malik Naveed',
    openingBalance: 0.00,
    currentBalance: 0.00,
    keywords: ['malik naveed', 'naveed'],
  },
  {
    name: 'Cash in Hand (Sabir Nawaz)',
    type: 'CASH',
    cashHolder: 'Sabir Nawaz',
    openingBalance: 0.00,
    currentBalance: 1024.00,
    keywords: ['sabir nawaz', 'sabir'],
  },
  {
    name: 'Cash in Hand (Majid Javed)',
    type: 'CASH',
    cashHolder: 'Majid Javed',
    openingBalance: 13267.00,
    currentBalance: 617.00,
    keywords: ['majid javed', 'majid'],
  },
];

async function updateBalances() {
  console.log('Connecting to MongoDB...');
  await connectDB();

  try {
    for (const target of OFFICIAL_ACCOUNTS) {
      let acc = null;

      // Find by exact name or keywords
      const allAccs = await Account.find({}).lean();
      for (const a of allAccs) {
        const lowerName = a.name.toLowerCase();
        if (lowerName === target.name.toLowerCase()) {
          acc = a;
          break;
        }
        if (target.keywords.some((kw) => lowerName.includes(kw))) {
          acc = a;
          break;
        }
      }

      if (acc) {
        await Account.findByIdAndUpdate(acc._id, {
          name: target.name,
          accountName: target.name,
          type: target.type,
          bankName: target.bankName || '',
          ownerName: target.ownerName || '',
          cashHolder: target.cashHolder || '',
          openingBalance: target.openingBalance,
          currentBalance: target.currentBalance,
          isActive: true,
        });
        console.log(`✓ Updated "${target.name}": Opening = Rs. ${target.openingBalance.toLocaleString()}, Closing = Rs. ${target.currentBalance.toLocaleString()}`);
      } else {
        await Account.create({
          name: target.name,
          accountName: target.name,
          type: target.type,
          bankName: target.bankName || '',
          ownerName: target.ownerName || '',
          cashHolder: target.cashHolder || '',
          openingBalance: target.openingBalance,
          currentBalance: target.currentBalance,
          isActive: true,
        });
        console.log(`+ Created "${target.name}": Opening = Rs. ${target.openingBalance.toLocaleString()}, Closing = Rs. ${target.currentBalance.toLocaleString()}`);
      }
    }

    const totalOpening = OFFICIAL_ACCOUNTS.reduce((sum, a) => sum + a.openingBalance, 0);
    const totalClosing = OFFICIAL_ACCOUNTS.reduce((sum, a) => sum + a.currentBalance, 0);

    console.log('\n--- BALANCE SYNCHRONIZATION COMPLETE ---');
    console.log(`Total Opening Balance: Rs. ${totalOpening.toLocaleString('en-PK')}`);
    console.log(`Total Closing Balance: Rs. ${totalClosing.toLocaleString('en-PK')}`);
  } catch (err) {
    console.error('Error updating account balances:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

updateBalances();
