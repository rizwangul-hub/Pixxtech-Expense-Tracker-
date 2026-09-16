import React, { useState } from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Plus,
  Tag,
} from 'lucide-react';
import { accountsAPI, otherIncomeAPI, propertiesAPI } from '../services/api.js';

const initialProperty = {
  propertyName: '',
  propertyCode: '',
  propertyType: 'PLAZA',
  city: 'Lahore',
  area: '',
  address: '',
  description: '',
};

const initialAccount = {
  accountName: '',
  accountType: 'BANK',
  bankName: '',
  cashHolder: '',
  accountNumber: '',
  ownerName: '',
  openingBalance: '0',
  openingBalanceDate: new Date().toISOString().split('T')[0],
  currency: 'PKR',
  notes: '',
};

const panelClasses = 'bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
const inputClasses =
  'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-teal-600';

export function ChartOfAccountsPage({ currentUser }) {
  const [property, setProperty] = useState(initialProperty);
  const [account, setAccount] = useState(initialAccount);
  const [expenseName, setExpenseName] = useState('');
  const [incomeHead, setIncomeHead] = useState({ name: '', code: '', description: '' });
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const notify = (type, text) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage({ type: '', text: '' }), 4500);
  };

  const handlePropertySubmit = async (event) => {
    event.preventDefault();
    setSaving('property');
    try {
      await propertiesAPI.createProperty(property);
      setProperty(initialProperty);
      notify('success', 'Property created successfully.');
    } catch (error) {
      notify('error', error.response?.data?.message || error.message || 'Failed to create property.');
    } finally {
      setSaving('');
    }
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();
    setSaving('account');
    try {
      const payload = {
        ...account,
        accountName: account.accountName.trim(),
        name: account.accountName.trim(),
        accountType: account.accountType,
        type: account.accountType,
        bankName: account.accountType === 'BANK' ? account.bankName.trim() : '',
        cashHolder: account.accountType === 'CASH' ? account.cashHolder.trim() : '',
        openingBalance: Number(account.openingBalance) || 0,
      };
      await accountsAPI.createAccount(payload);
      setAccount(initialAccount);
      notify('success', `${payload.accountType === 'BANK' ? 'Bank' : 'Cash'} account created successfully.`);
    } catch (error) {
      notify('error', error.response?.data?.message || error.message || 'Failed to create account.');
    } finally {
      setSaving('');
    }
  };

  const handleExpenseSubmit = async (event) => {
    event.preventDefault();
    if (!expenseName.trim()) {
      notify('error', 'Expense head name is required.');
      return;
    }
    setSaving('expense');
    try {
      await accountsAPI.createCategory({ name: expenseName.trim(), type: 'EXPENSE' });
      setExpenseName('');
      notify('success', 'Expense head created successfully.');
    } catch (error) {
      notify('error', error.response?.data?.message || error.message || 'Failed to create expense head.');
    } finally {
      setSaving('');
    }
  };

  const handleIncomeSubmit = async (event) => {
    event.preventDefault();
    if (!incomeHead.name.trim()) {
      notify('error', 'Other-income head name is required.');
      return;
    }
    setSaving('income');
    try {
      await otherIncomeAPI.createHead({
        ...incomeHead,
        name: incomeHead.name.trim(),
        code: incomeHead.code.trim(),
        description: incomeHead.description.trim(),
      });
      setIncomeHead({ name: '', code: '', description: '' });
      notify('success', 'Other-income head created successfully.');
    } catch (error) {
      notify('error', error.response?.data?.message || error.message || 'Failed to create income head.');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Landmark className="text-teal-700" size={22} />
          <h1 className="text-2xl font-bold text-slate-900">Chart of Accounts</h1>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          Create and organize the properties, accounts, expense heads, and other-income heads used by the system.
        </p>
        <p className="text-xs text-slate-500 mt-1">Administrator: {currentUser?.name || 'Authorized administrator'}</p>
      </div>

      {message.text && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {message.type === 'success' && <CheckCircle2 size={16} />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className={panelClasses}>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-4">
            <Building2 size={18} className="text-emerald-700" /> New Property
          </h2>
          <form onSubmit={handlePropertySubmit} className="space-y-3">
            <input className={inputClasses} placeholder="Property / plaza name" value={property.propertyName} onChange={(e) => setProperty({ ...property, propertyName: e.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <input className={inputClasses} placeholder="Property code" value={property.propertyCode} onChange={(e) => setProperty({ ...property, propertyCode: e.target.value })} />
              <select className={inputClasses} value={property.propertyType} onChange={(e) => setProperty({ ...property, propertyType: e.target.value })}>
                <option value="PLAZA">Plaza</option>
                <option value="BUILDING">Building</option>
                <option value="HOUSE">House</option>
                <option value="SHOPS">Shops</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <input className={inputClasses} placeholder="City" value={property.city} onChange={(e) => setProperty({ ...property, city: e.target.value })} />
            <input className={inputClasses} placeholder="Address" value={property.address} onChange={(e) => setProperty({ ...property, address: e.target.value })} />
            <button type="submit" disabled={saving === 'property'} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              <Plus size={16} /> {saving === 'property' ? 'Creating...' : 'Create Property'}
            </button>
          </form>
        </section>

        <section className={panelClasses}>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-4">
            <Banknote size={18} className="text-blue-700" /> New Bank / Cash Account
          </h2>
          <form onSubmit={handleAccountSubmit} className="space-y-3">
            <input className={inputClasses} placeholder="Account name" value={account.accountName} onChange={(e) => setAccount({ ...account, accountName: e.target.value })} required />
            <select className={inputClasses} value={account.accountType} onChange={(e) => setAccount({ ...account, accountType: e.target.value })}>
              <option value="BANK">Bank account</option>
              <option value="CASH">Cash in hand / custodian</option>
            </select>
            {account.accountType === 'BANK' ? (
              <input className={inputClasses} placeholder="Bank name" value={account.bankName} onChange={(e) => setAccount({ ...account, bankName: e.target.value })} required />
            ) : (
              <input className={inputClasses} placeholder="Cash custodian name" value={account.cashHolder} onChange={(e) => setAccount({ ...account, cashHolder: e.target.value })} required />
            )}
            <div className="grid grid-cols-2 gap-3">
              <input className={inputClasses} placeholder="Account number" value={account.accountNumber} onChange={(e) => setAccount({ ...account, accountNumber: e.target.value })} />
              <input className={inputClasses} type="number" step="any" placeholder="Opening balance" value={account.openingBalance} onChange={(e) => setAccount({ ...account, openingBalance: e.target.value })} />
            </div>
            <button type="submit" disabled={saving === 'account'} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              <Plus size={16} /> {saving === 'account' ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        </section>

        <section className={panelClasses}>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-4">
            <Tag size={18} className="text-rose-700" /> New Expense Head
          </h2>
          <form onSubmit={handleExpenseSubmit} className="space-y-3">
            <p className="text-sm text-slate-600">These heads appear in Expense Voucher Entry for categorizing expenses.</p>
            <input className={inputClasses} placeholder="Expense head name" value={expenseName} onChange={(e) => setExpenseName(e.target.value)} required />
            <button type="submit" disabled={saving === 'expense'} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
              <Plus size={16} /> {saving === 'expense' ? 'Creating...' : 'Create Expense Head'}
            </button>
          </form>
        </section>

        <section className={panelClasses}>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-4">
            <CircleDollarSign size={18} className="text-teal-700" /> New Other-Income Head
          </h2>
          <form onSubmit={handleIncomeSubmit} className="space-y-3">
            <input className={inputClasses} placeholder="Income head name" value={incomeHead.name} onChange={(e) => setIncomeHead({ ...incomeHead, name: e.target.value })} required />
            <input className={inputClasses} placeholder="Code (optional)" value={incomeHead.code} onChange={(e) => setIncomeHead({ ...incomeHead, code: e.target.value })} />
            <textarea className={inputClasses} rows="3" placeholder="Description (optional)" value={incomeHead.description} onChange={(e) => setIncomeHead({ ...incomeHead, description: e.target.value })} />
            <button type="submit" disabled={saving === 'income'} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              <Plus size={16} /> {saving === 'income' ? 'Creating...' : 'Create Income Head'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default ChartOfAccountsPage;
