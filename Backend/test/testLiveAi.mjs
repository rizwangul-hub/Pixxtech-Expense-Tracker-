import dotenv from 'dotenv';
dotenv.config({ path: 'Backend/.env' });
import connectDB from '../config/db.js';
import { askFinanceAssistant } from '../services/ai/aiProvider.js';

async function run() {
  await connectDB();
  console.log('Testing question: "What are our account balances?"');
  const mockAdminUser = {
    _id: '670000000000000000000001',
    role: 'ADMIN',
    name: 'Fahad',
    isActive: true,
    isDeleted: false,
  };
  const res = await askFinanceAssistant('What are our account balances?', [], mockAdminUser);
  console.log('Engine used:', res.engine);
  console.log('Tool calls:', res.toolCalls?.map(t => t.name));
  console.log('Message length:', res.message.length);
  console.log('--- Response Preview ---');
  console.log(res.message.slice(0, 500));
  console.log('------------------------');

  console.log('\nTesting question: "How much rent did we collect this month in October 2026?"');
  const res2 = await askFinanceAssistant('How much rent did we collect this month in October 2026?', [], mockAdminUser);
  console.log('Engine used:', res2.engine);
  console.log('Tool calls:', res2.toolCalls?.map(t => t.name));
  console.log('--- Response Preview ---');
  console.log(res2.message.slice(0, 500));
  console.log('------------------------');
  process.exit(0);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
