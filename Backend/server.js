import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import rentRoutes from './routes/rentRoutes.js';
import accountRoutes from './routes/accountRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import monthlyReportRoutes from './routes/monthlyReportRoutes.js';
import userRoutes from './routes/userRoutes.js';
import propertyRoutes from './routes/propertyRoutes.js';
import unitRoutes from './routes/unitRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import agreementRoutes from './routes/agreementRoutes.js';
import rentDueRoutes from './routes/rentDueRoutes.js';
import transferRoutes from './routes/transferRoutes.js';
import rentReceivedRoutes from './routes/rentReceivedRoutes.js';
import voucherRoutes from './routes/voucherRoutes.js';
import otherIncomeRoutes from './routes/otherIncomeRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';
import ledgerRoutes from './routes/ledgerRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import staffRoutes from './routes/staffRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security: Hide Express header
app.disable('x-powered-by');

// 1. Explicit CORS Preflight & Access-Control-Allow-Origin Middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, X-CSRF-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Serverless DB Connection Middleware
app.use(async (req, res, next) => {
  // Skip DB connection check for health check or favicon
  if (req.path === '/' || req.path === '/api/health' || req.path === '/favicon.ico') {
    return next();
  }
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('[Serverless DB Middleware Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed. Please ensure MONGO_URI is configured correctly in Vercel settings and network access allows connections.',
      error: error.message,
    });
  }
});

// Health Check Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pixx Technologies Expense Tracker API is running.',
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Pixx Technologies Property Funds & Expense API',
  });
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/rent-due', rentDueRoutes);
app.use('/api/rent-received', rentReceivedRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/other-income', otherIncomeRoutes);
app.use('/api/rent', rentRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/monthly-reports', monthlyReportRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/ledgers', ledgerRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/staff/attendance', attendanceRoutes);
app.use('/api/staff/payroll', payrollRoutes);

// 404 Not Found Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start Server locally if not running as a Vercel Serverless Function
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  PIXX TECHNOLOGIES EXPENSE TRACKER API READY`);
    console.log(`  Server running on http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

export default app;
