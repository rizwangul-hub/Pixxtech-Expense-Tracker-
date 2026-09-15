import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import RentDue from '../models/RentDue.js';
import User from '../models/User.js';
import { calculateDueDate } from '../controllers/rentDueController.js';

dotenv.config();

const TENANT_CONTACTS = [
  { name: 'Flagship Superstore', phone: '0300-1112233', company: 'Flagship Superstore Pvt Ltd', city: 'Lahore', cnic: '35201-1111111-1' },
  { name: 'Marketing Agency', phone: '0301-2223344', company: 'Digital Pulse Marketing', city: 'Lahore', cnic: '35201-2222222-2' },
  { name: 'Software Consultancy', phone: '0302-3334455', company: 'ByteCode Solutions', city: 'Lahore', cnic: '35201-3333333-3' },
  { name: 'Retail Traders Association', phone: '0303-4445566', company: 'Anarkali Trade Union', city: 'Lahore', cnic: '35201-4444444-4' },
  { name: 'Storage Facility', phone: '0304-5556677', company: 'SafeKeep Storage', city: 'Lahore', cnic: '35201-5555555-5' },
  { name: 'Retail Brand', phone: '0305-6667788', company: 'Urban Outfitters PK', city: 'Lahore', cnic: '35201-6666666-6' },
  { name: 'Consultancy Office', phone: '0306-7778899', company: 'Vertex Legal & Financial', city: 'Lahore', cnic: '35201-7777777-7' },
  { name: 'Studio Office', phone: '0307-8889900', company: 'DesignCraft Studio', city: 'Lahore', cnic: '35201-8888888-8' },
  { name: 'Design House', phone: '0308-9990011', company: 'Couture Elegance', city: 'Lahore', cnic: '35201-9999999-9' },
  { name: 'Commercial Tenant', phone: '0309-1011121', company: 'Apex Traders', city: 'Lahore', cnic: '35201-1010101-0' },
  { name: 'Bank Al Falah Ltd', phone: '0310-2122232', company: 'Bank Al Falah Ltd', city: 'Lahore', cnic: '35201-2020202-1' },
  { name: 'Corporate Office', phone: '0311-3133343', company: 'Orient Holdings', city: 'Lahore', cnic: '35201-3030303-2' },
  { name: 'IT Solutions Firm', phone: '0312-4144454', company: 'CloudScale Technologies', city: 'Lahore', cnic: '35201-4040404-3' },
  { name: 'Logistics Partner', phone: '0313-5155565', company: 'FastTrack Logistics', city: 'Lahore', cnic: '35201-5050505-4' },
  { name: 'Residential Tenant', phone: '0314-6166676', company: 'Private Resident', city: 'Lahore', cnic: '35201-6060606-5' },
  { name: 'Allied Bank Limited', phone: '0315-7177787', company: 'Allied Bank Limited', city: 'Lahore', cnic: '35201-7070707-6' },
  { name: 'Deal Land Real Estate', phone: '0316-8188898', company: 'Deal Land Associates', city: 'Lahore', cnic: '35201-8080808-7' },
  { name: 'Executive Suites', phone: '0317-9199909', company: 'Executive Accommodations', city: 'Lahore', cnic: '35201-9090909-8' },
  { name: 'Studio Apartment', phone: '0318-1213141', company: 'Urban Living', city: 'Lahore', cnic: '35201-1212121-2' },
  { name: 'Law Associates', phone: '0319-2324252', company: 'Justice & Associates Law', city: 'Lahore', cnic: '35201-2323232-3' },
  { name: 'Tech Hub', phone: '0320-3435363', company: 'NextGen Tech Hub', city: 'Lahore', cnic: '35201-3434343-4' },
  { name: 'Creative Studio', phone: '0321-4546474', company: 'PixelCraft Creative', city: 'Lahore', cnic: '35201-4545454-5' },
  { name: 'Dr. Clinic', phone: '0322-5657585', company: 'HealthPlus Clinic', city: 'Lahore', cnic: '35201-5656565-6' },
];

async function seedTenancy() {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixx_expense_tracker';
    await mongoose.connect(mongoURI);
    console.log('[Seed Tenancy]: Connected to MongoDB');

    const adminUser = await User.findOne({ role: 'ADMIN' });
    const adminId = adminUser ? adminUser._id : null;

    const properties = await Property.find();
    console.log(`Found ${properties.length} properties to scan.`);

    let agreementCounter = 1;
    let tenantsCreated = 0;
    let agreementsCreated = 0;
    let rentDueCreated = 0;

    for (const property of properties) {
      if (!property.units || property.units.length === 0) continue;

      for (const unit of property.units) {
        if (!unit.tenantName || !unit.tenantName.trim()) continue;

        const rawName = unit.tenantName.trim();
        const contactInfo = TENANT_CONTACTS.find(
          (c) => c.name.toLowerCase() === rawName.toLowerCase()
        ) || {
          name: rawName,
          phone: `0300-${String(Math.floor(1000000 + Math.random() * 9000000)).slice(0, 7)}`,
          company: rawName,
          city: property.city || 'Lahore',
          cnic: `35201-${String(Math.floor(1000000 + Math.random() * 9000000))}-1`,
        };

        // 1. Find or create Tenant
        let tenant = await Tenant.findOne({ fullName: contactInfo.name });
        if (!tenant) {
          tenant = await Tenant.create({
            fullName: contactInfo.name,
            phone: contactInfo.phone,
            companyName: contactInfo.company,
            city: contactInfo.city,
            identificationNumber: contactInfo.cnic,
            address: `${property.propertyName}, ${unit.unitName}`,
            status: 'ACTIVE',
            isActive: true,
            createdBy: adminId,
          });
          tenantsCreated += 1;
        }

        // 2. Find or create Rental Agreement
        let agreement = await RentalAgreement.findOne({
          propertyId: property._id,
          unitId: unit._id,
          status: 'ACTIVE',
        });

        if (!agreement) {
          const agrNum = `AGR-2026-${String(agreementCounter).padStart(4, '0')}`;
          agreement = await RentalAgreement.create({
            agreementNumber: agrNum,
            tenantId: tenant._id,
            propertyId: property._id,
            unitId: unit._id,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            renewalDate: unit.renewalDate || new Date('2027-01-01'),
            dueDay: unit.dueDay || 5,
            monthlyRent: unit.agreedRent || 0,
            previousRent: Math.round((unit.agreedRent || 0) * 0.9),
            securityDeposit: (unit.agreedRent || 0) * 2,
            status: 'ACTIVE',
            paymentFrequency: 'MONTHLY',
            notes: `Seeded standard agreement for ${unit.unitName}`,
            createdBy: adminId,
          });
          agreementsCreated += 1;
        }
        agreementCounter += 1;

        // Ensure unit is OCCUPIED
        unit.status = 'OCCUPIED';

        // 3. Create August 2026 Rent Due if not existing
        const month = '2026-08';
        const existingRentDue = await RentDue.findOne({
          agreementId: agreement._id,
          rentMonth: month,
        });

        if (!existingRentDue) {
          const dueDate = calculateDueDate(2026, 8, agreement.dueDay);
          await RentDue.create({
            agreementId: agreement._id,
            tenantId: tenant._id,
            propertyId: property._id,
            unitId: unit._id,
            rentMonth: month,
            dueDate,
            expectedRentAmount: agreement.monthlyRent,
            status: 'DUE',
            notes: `Monthly rent due for ${month}`,
            createdBy: adminId,
          });
          rentDueCreated += 1;
        }
      }

      await property.save();
    }

    console.log(`\n======================================================`);
    console.log(`  TENANCY SEEDING COMPLETE`);
    console.log(`  Tenants Created:     ${tenantsCreated}`);
    console.log(`  Agreements Created:  ${agreementsCreated}`);
    console.log(`  Rent Due Created:    ${rentDueCreated} (for 2026-08)`);
    console.log(`======================================================\n`);

    await mongoose.disconnect();
  } catch (err) {
    console.error('[Seed Tenancy Error]:', err);
    process.exit(1);
  }
}

seedTenancy();
