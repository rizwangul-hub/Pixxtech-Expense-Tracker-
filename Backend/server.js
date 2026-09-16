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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Security: Hide Express header
app.disable('x-powered-by');

// Global Middleware & CORS Configuration
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Check if origin is explicitly allowed or matches a Vercel preview/prod deployment
      const isAllowed =
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        process.env.NODE_ENV !== 'production';

      if (isAllowed) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not permitted by CORS policy.`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Start Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  PIXX TECHNOLOGIES EXPENSE TRACKER API READY`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

export default app;
