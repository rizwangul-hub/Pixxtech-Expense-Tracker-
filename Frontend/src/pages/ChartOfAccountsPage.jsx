import React, { useState, useEffect } from 'react';
import {
  Building2,
  Banknote,
  Tag,
  CircleDollarSign,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Landmark,
  Search,
  Wallet,
  Trash2,
} from 'lucide-react';
import { accountsAPI, otherIncomeAPI, propertiesAPI } from '../services/api.js';
import { formatPKR } from '../utils/formatters.js';

const initialProperty = {
  propertyName: '',
  propertyCode: '',
  propertyType: 'PLAZA',
  city: 'Lahore',
  area: '',
  address: '',
  description: '',
  notes: '',
};

const initialAccount = {
  accountName: '',
  accountType: 'BANK',
  bankName: '',
  cashHolder: '',
  accountNumber: '',
  iban: '',
  branch: '',
  ownerName: '',
  openingBalance: '0',
  notes: '',
};

const initialExpenseCategory = {
  name: '',
  type: 'EXPENSE',
  propertyId: '',
  unitId: '',
  isRentalHead: false,
};

const initialIncomeHead = {
  name: '',
  code: '',
  description: '',
};

export function ChartOfAccountsPage({ currentUser }) {
  // Navigation sub-tab state
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'expense' | 'account' | 'property' | 'income'

  // Form states
  const [property, setProperty] = useState(initialProperty);
  const [account, setAccount] = useState(initialAccount);
  const [expenseCategory, setExpenseCategory] = useState(initialExpenseCategory);
  const [incomeHead, setIncomeHead] = useState(initialIncomeHead);

  // Master Data lists from backend (initialized as empty arrays)
  const [propertiesList, setPropertiesList] = useState([]);
  const [accountsList, setAccountsList] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [incomeHeadsList, setIncomeHeadsList] = useState([]);

  // System states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const notify = (type, text) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  // Load all master data records safely
  const loadChartData = async () => {
    try {
      setLoading(true);
      const [propRes, accRes, catRes, headsRes] = await Promise.all([
        accountsAPI.getProperties().catch(() => ({ properties: [] })),
        accountsAPI.getAccounts().catch(() => ({ accounts: [] })),
        accountsAPI.getCategories().catch(() => ({ categories: [] })),
        otherIncomeAPI.getHeads().catch(() => ({ heads: [] })),
      ]);

      // Robust array extraction logic
      const extractedProps = Array.isArray(propRes?.properties)
        ? propRes.properties
        : Array.isArray(propRes?.data?.properties)
        ? propRes.data.properties
        : Array.isArray(propRes?.data)
        ? propRes.data
        : Array.isArray(propRes)
        ? propRes
        : [];

      const extractedAccs = Array.isArray(accRes?.accounts)
        ? accRes.accounts
        : Array.isArray(accRes?.data?.accounts)
        ? accRes.data.accounts
        : Array.isArray(accRes?.data)
        ? accRes.data
        : Array.isArray(accRes)
        ? accRes
        : [];

      const extractedCats = Array.isArray(catRes?.categories)
        ? catRes.categories
        : Array.isArray(catRes?.data?.categories)
        ? catRes.data.categories
        : Array.isArray(catRes?.data)
        ? catRes.data
        : Array.isArray(catRes)
        ? catRes
        : [];

      const extractedHeads = Array.isArray(headsRes?.heads)
        ? headsRes.heads
        : Array.isArray(headsRes?.data?.heads)
        ? headsRes.data.heads
        : Array.isArray(headsRes?.data)
        ? headsRes.data
        : Array.isArray(headsRes)
        ? headsRes
        : [];

      setPropertiesList(extractedProps);
      setAccountsList(extractedAccs);
      setCategoriesList(extractedCats);
      setIncomeHeadsList(extractedHeads);
    } catch (err) {
      console.error('Failed to load chart of accounts data:', err);
      notify('error', 'Failed to load master ledger records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChartData();
  }, []);

  // 1. Submit New Expense Category / Head
  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expenseCategory.propertyId && !expenseCategory.name.trim()) {
      notify('error', 'Expense category head name is required for general expenses.');
      return;
    }
    setSaving('expense');
    try {
      const res = await accountsAPI.createCategory({
        name: expenseCategory.name.trim(),
        type: 'EXPENSE',
        propertyId: expenseCategory.propertyId || null,
        unitId: expenseCategory.unitId || null,
        isRentalHead: expenseCategory.isRentalHead,
      });
      const createdCat = res.data?.category || res.category;
      setExpenseCategory(initialExpenseCategory);
      notify('success', `Expense head "${createdCat?.name || expenseCategory.name.trim()}" created successfully.`);
      await loadChartData();
    } catch (error) {
      notify('error', error.response?.data?.message || error.message || 'Failed to create expense head.');
    } finally {
      setSaving('');
    }
  };

  const [deletingCatId, setDeletingCatId] = useState(null);

  const handleDeleteCategory = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the expense head "${name}"?`)) return;
    try {
      setDeletingCatId(id);
      await accountsAPI.deleteCategory(id);
      notify('success', `Expense head "${name}" deleted successfully.`);
      await loadChartData();
    } catch (err) {
      notify('error', err.response?.data?.message || err.message || 'Failed to delete expense head.');
    } finally {
      setDeletingCatId(null);
    }
  };

  // 2. Submit New Bank or Cash Account
  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    if (!account.accountName.trim()) {
      notify('error', 'Account title is required.');
      return;
    }
    setSaving('account');
    try {
      const payload = {
        name: account.accountName.trim(),
        accountName: account.accountName.trim(),
        type: account.accountType,
        accountType: account.accountType,
        bankName: account.accountType === 'BANK' ? account.bankName.trim() : '',
        cashHolder: account.accountType === 'CASH' ? account.cashHolder.trim() : '',
        accountNumber: account.accountNumber.trim(),
        iban: account.iban.trim(),
        branch: account.branch.trim(),
        ownerName: account.ownerName.trim(),
        openingBalance: Number(account.openingBalance) || 0,
        notes: account.notes.trim(),
      };
      await accountsAPI.createAccount(payload);
      setAccount(initialAccount);
      notify('success', `${payload.accountType === 'BANK' ? 'Bank Account' : 'Cash Custodian'} created successfully.`);
      await loadChartData();
    } catch (error) {
      notify('error', error.response?.data?.message || error.message || 'Failed to create financial account.');
    } finally {
      setSaving('');
    }
  };

  // 3. Submit New Property / Plaza
  const handlePropertySubmit = async (e) => {
    e.preventDefault();
    if (!property.propertyName.trim()) {
      notify('error', 'Property name is required.');
      return;
    }
    setSaving('property');
    try {
      await propertiesAPI.createProperty({
        ...property,
        propertyName: property.propertyName.trim(),
        plazaName: property.propertyName.trim(),
      });
      setProperty(initialProperty);
      notify('success', `Property "${property.propertyName.trim()}" registered successfully.`);
      await loadChartData();
    } catch (error) {
      notify('error', error.response?.data?.message || error.message || 'Failed to create property.');
    } finally {
      setSaving('');
    }
  };

  // 4. Submit New Other Income Head
  const handleIncomeSubmit = async (e) => {
    e.preventDefault();
    if (!incomeHead.name.trim()) {
      notify('error', 'Income head name is required.');
      return;
    }
    setSaving('income');
    try {
      await otherIncomeAPI.createHead({
        name: incomeHead.name.trim(),
        code: incomeHead.code.trim(),
        description: incomeHead.description.trim(),
      });
      setIncomeHead(initialIncomeHead);
      notify('success', `Other Income Head "${incomeHead.name.trim()}" created successfully.`);
      await loadChartData();
    } catch (error) {
      notify('error', error.response?.data?.message || error.message || 'Failed to create income head.');
    } finally {
      setSaving('');
    }
  };

  // Guaranteed safe array fallbacks for search filters
  const q = searchQuery.toLowerCase().trim();
  const safeCategories = Array.isArray(categoriesList) ? categoriesList : [];
  const safeAccounts = Array.isArray(accountsList) ? accountsList : [];
  const safeProperties = Array.isArray(propertiesList) ? propertiesList : [];
  const safeIncomeHeads = Array.isArray(incomeHeadsList) ? incomeHeadsList : [];

  const filteredCategories = safeCategories.filter((c) => !q || c.name?.toLowerCase().includes(q));
  const filteredAccounts = safeAccounts.filter(
    (a) => !q || a.name?.toLowerCase().includes(q) || a.bankName?.toLowerCase().includes(q) || a.cashHolder?.toLowerCase().includes(q)
  );
  const filteredProperties = safeProperties.filter(
    (p) => !q || p.propertyName?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q) || p.propertyCode?.toLowerCase().includes(q)
  );
  const filteredIncomeHeads = safeIncomeHeads.filter((h) => !q || h.name?.toLowerCase().includes(q) || h.code?.toLowerCase().includes(q));

  // Compute total account liquidity
  const totalAccountBalance = safeAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 bg-slate-50 min-h-full font-sans text-slate-900">
      {/* Top Header & Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-700 text-white rounded-xl shadow-sm">
              <Layers size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Chart of Accounts</h1>
              <p className="text-xs font-medium text-slate-600">
                Master System Directory &bull; Centralized Creation of Accounts, Categories, Properties &amp; Income Heads
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadChartData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs shadow-sm transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-teal-600' : 'text-slate-600'} />
            Refresh Directory
          </button>
        </div>
      </div>

      {/* KPI Stats Header Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Expense Heads</span>
            <Tag size={18} className="text-rose-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{safeCategories.length}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Active categories</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Bank &amp; Cash Accounts</span>
            <Landmark size={18} className="text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{safeAccounts.length}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">{formatPKR(totalAccountBalance)} liquidity</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Properties &amp; Plazas</span>
            <Building2 size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{safeProperties.length}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Registered locations</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Other Income Heads</span>
            <CircleDollarSign size={18} className="text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{safeIncomeHeads.length}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Receipt heads</div>
        </div>
      </div>

      {/* Action Message Alert Banner */}
      {message.text && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold shadow-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-rose-600" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Navigation Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            All 4 Master Modules
          </button>
          <button
            onClick={() => setActiveTab('expense')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'expense'
                ? 'bg-rose-700 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Tag size={14} /> New Expense Head
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'account'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Banknote size={14} /> New Bank / Cash Account
          </button>
          <button
            onClick={() => setActiveTab('property')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'property'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Building2 size={14} /> New Property / Plaza
          </button>
          <button
            onClick={() => setActiveTab('income')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'income'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            <CircleDollarSign size={14} /> New Other Income Head
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search chart items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-teal-600 font-semibold"
          />
        </div>
      </div>

      {/* Main Form Grid Sections */}
      <div className="space-y-8">
        {/* Module 1: Expense Head / Category Creation */}
        {(activeTab === 'all' || activeTab === 'expense') && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="border-b border-slate-200 pb-3 mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="text-rose-600" size={20} />
                <h2 className="text-base font-bold text-slate-900">1. Expense Heads &amp; Categories</h2>
              </div>
              <span className="text-xs font-bold bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full">
                {safeCategories.length} Active Heads
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form Column */}
              <form onSubmit={handleExpenseSubmit} className="lg:col-span-5 space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider">Create New Expense Category / Head</h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expense Head Name {expenseCategory.propertyId ? '(Optional - defaults to Property/Unit Name)' : '*'}
                  </label>
                  <input
                    type="text"
                    required={!expenseCategory.propertyId}
                    placeholder={
                      expenseCategory.unitId
                        ? "e.g. Paint Work (Optional - defaults to Unit Name)"
                        : expenseCategory.propertyId
                        ? "e.g. Generator Maintenance (Optional - defaults to Property Name)"
                        : "e.g. Electrical Repairs, Office Supplies, Generator Maintenance"
                    }
                    value={expenseCategory.name}
                    onChange={(e) => setExpenseCategory({ ...expenseCategory, name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-rose-600"
                  />
                </div>

                {/* Head / Property & Unit Pickers */}
                <div className="space-y-3 p-3 bg-white border border-slate-200 rounded-lg">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Select Property Head (Optional)</label>
                    <select
                      value={expenseCategory.propertyId}
                      onChange={(e) => {
                        setExpenseCategory({ ...expenseCategory, propertyId: e.target.value, unitId: '' });
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-rose-600"
                    >
                      <option value="">-- None (General Expense Head) --</option>
                      {safeProperties.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.plazaName || p.propertyName} ({p.city || 'Lahore'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {expenseCategory.propertyId && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Select Unit Head (Optional)</label>
                      <select
                        value={expenseCategory.unitId}
                        onChange={(e) => setExpenseCategory({ ...expenseCategory, unitId: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-rose-600"
                      >
                        <option value="">-- None (Property Own Expense Head) --</option>
                        {(
                          safeProperties.find((p) => p._id === expenseCategory.propertyId)?.units || []
                        ).map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.unitName || u.unitNumber || u.name || 'Unit'} {u.tenantName ? `(${u.tenantName})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Derived Scope Status Badge */}
                  <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold">
                    <span className="text-slate-500">Head Scope:</span>
                    {!expenseCategory.propertyId ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                        🌐 General Expense
                      </span>
                    ) : !expenseCategory.unitId ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300">
                        🏢 Property Own Expense ({safeProperties.find((p) => p._id === expenseCategory.propertyId)?.plazaName})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-300">
                        🚪 Unit Expense ({safeProperties.find((p) => p._id === expenseCategory.propertyId)?.plazaName})
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving === 'expense'}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-rose-700 hover:bg-rose-800 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  <Plus size={16} />
                  {saving === 'expense' ? 'Saving Head...' : 'Add Expense Head'}
                </button>
              </form>

              {/* Directory List Column */}
              <div className="lg:col-span-7">
                <h3 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider mb-3">Active Expense Heads Directory</h3>
                <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200 bg-white">
                  {filteredCategories.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 font-semibold">No expense heads matching filter.</div>
                  ) : (
                    filteredCategories.map((c, i) => {
                      const propName = c.propertyId?.plazaName || c.propertyId?.propertyName || '';
                      const scopeLabel =
                        c.expenseClassification === 'UNIT_EXPENSE'
                          ? `Unit Head`
                          : c.expenseClassification === 'PROPERTY_OWN_EXPENSE'
                          ? `Property Head`
                          : 'General Head';

                      const scopeStyle =
                        c.expenseClassification === 'UNIT_EXPENSE'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : c.expenseClassification === 'PROPERTY_OWN_EXPENSE'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200';

                      return (
                        <div key={c._id || i} className="p-3 flex items-center justify-between hover:bg-slate-50">
                          <div className="flex items-center gap-2.5">
                            <Tag size={14} className="text-rose-600" />
                            <div>
                              <div className="text-xs font-bold text-slate-900">{c.name}</div>
                              {propName && (
                                <div className="text-[10px] text-slate-500 font-medium">
                                  Property: {propName}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${scopeStyle}`}>
                              {scopeLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(c._id, c.name)}
                              disabled={deletingCatId === c._id}
                              className="p-1.5 text-rose-600 hover:text-rose-900 hover:bg-rose-50 rounded-md transition border border-rose-200 disabled:opacity-50"
                              title={`Delete single expense head '${c.name}'`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Module 2: Bank & Cash Liquidity Accounts Creation */}
        {(activeTab === 'all' || activeTab === 'account') && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="border-b border-slate-200 pb-3 mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="text-blue-600" size={20} />
                <h2 className="text-base font-bold text-slate-900">2. Bank &amp; Cash Accounts</h2>
              </div>
              <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full">
                {safeAccounts.length} Active Accounts
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form Column */}
              <form onSubmit={handleAccountSubmit} className="lg:col-span-5 space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider">Create Bank / Cash Account</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Account Type *</label>
                    <select
                      value={account.accountType}
                      onChange={(e) => setAccount({ ...account, accountType: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      <option value="BANK">Bank Account</option>
                      <option value="CASH">Cash in Hand / Custodian</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Opening Balance (PKR)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={account.openingBalance}
                      onChange={(e) => setAccount({ ...account, openingBalance: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Account Title / Display Name *</label>
                  <input
                    type="text"
                    required
                    placeholder={account.accountType === 'BANK' ? 'e.g. Bank Al Falah (Kamran Ijaz)' : 'e.g. Cash in Hand (Majid Javed)'}
                    value={account.accountName}
                    onChange={(e) => setAccount({ ...account, accountName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                {account.accountType === 'BANK' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Bank Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Bank Al Falah"
                          value={account.bankName}
                          onChange={(e) => setAccount({ ...account, bankName: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Account / IBAN No.</label>
                        <input
                          type="text"
                          placeholder="e.g. 550192831002"
                          value={account.accountNumber}
                          onChange={(e) => setAccount({ ...account, accountNumber: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Cash Custodian / Holder Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Majid Javed (Cashier)"
                      value={account.cashHolder}
                      onChange={(e) => setAccount({ ...account, cashHolder: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving === 'account'}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  <Plus size={16} />
                  {saving === 'account' ? 'Creating Account...' : 'Register Account'}
                </button>
              </form>

              {/* Directory List Column */}
              <div className="lg:col-span-7">
                <h3 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider mb-3">Active Accounts &amp; Current Balances</h3>
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200 bg-white">
                  {filteredAccounts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 font-semibold">No financial accounts found.</div>
                  ) : (
                    filteredAccounts.map((a, i) => (
                      <div key={a._id || i} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          {a.type === 'CASH' ? <Wallet size={16} className="text-amber-600" /> : <Landmark size={16} className="text-blue-600" />}
                          <div>
                            <div className="text-xs font-bold text-slate-900">{a.name}</div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              {a.type === 'CASH' ? `Custodian: ${a.cashHolder || 'General Cash'}` : `Bank: ${a.bankName || 'Bank'} ${a.accountNumber ? `(${a.accountNumber})` : ''}`}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-extrabold font-mono text-slate-900">{formatPKR(a.currentBalance)}</div>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {a.type}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Module 3: Property / Plaza Portfolio Creation */}
        {(activeTab === 'all' || activeTab === 'property') && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="border-b border-slate-200 pb-3 mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="text-emerald-600" size={20} />
                <h2 className="text-base font-bold text-slate-900">3. Properties &amp; Commercial Plazas</h2>
              </div>
              <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
                {safeProperties.length} Registered Plazas
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form Column */}
              <form onSubmit={handlePropertySubmit} className="lg:col-span-5 space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider">Register Property / Plaza</h3>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Property Name / Plaza Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Zam Zam Heights, Pixx Plaza, Commercial Market"
                    value={property.propertyName}
                    onChange={(e) => setProperty({ ...property, propertyName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Property Type</label>
                    <select
                      value={property.propertyType}
                      onChange={(e) => setProperty({ ...property, propertyType: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                    >
                      <option value="PLAZA">Plaza</option>
                      <option value="BUILDING">Building</option>
                      <option value="HOUSE">House</option>
                      <option value="SHOPS">Shops</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">City</label>
                    <input
                      type="text"
                      placeholder="e.g. Lahore"
                      value={property.city}
                      onChange={(e) => setProperty({ ...property, city: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Address / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Main Boulevard, Gulberg III"
                    value={property.address}
                    onChange={(e) => setProperty({ ...property, address: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving === 'property'}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  <Plus size={16} />
                  {saving === 'property' ? 'Registering Property...' : 'Add Property'}
                </button>
              </form>

              {/* Directory List Column */}
              <div className="lg:col-span-7">
                <h3 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider mb-3">Registered Properties Directory</h3>
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200 bg-white">
                  {filteredProperties.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 font-semibold">No properties registered.</div>
                  ) : (
                    filteredProperties.map((p, i) => (
                      <div key={p._id || i} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <Building2 size={16} className="text-emerald-600" />
                          <div>
                            <div className="text-xs font-bold text-slate-900">{p.propertyName || p.plazaName}</div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              Code: <span className="font-mono">{p.propertyCode}</span> &bull; {p.city || 'Lahore'} &bull; {p.units?.length || 0} units
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {p.propertyType || 'PLAZA'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Module 4: Other Income Heads Creation */}
        {(activeTab === 'all' || activeTab === 'income') && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="border-b border-slate-200 pb-3 mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="text-teal-600" size={20} />
                <h2 className="text-base font-bold text-slate-900">4. Other Income Heads</h2>
              </div>
              <span className="text-xs font-bold bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full">
                {safeIncomeHeads.length} Active Receipt Heads
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form Column */}
              <form onSubmit={handleIncomeSubmit} className="lg:col-span-5 space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider">Create Other-Income Head</h3>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Income Head Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Scrap Sale, Late Payment Fine, Utility Recovery"
                    value={incomeHead.name}
                    onChange={(e) => setIncomeHead({ ...incomeHead, name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Head Code / Reference (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. INC-04"
                    value={incomeHead.code}
                    onChange={(e) => setIncomeHead({ ...incomeHead, code: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Description (Optional)</label>
                  <textarea
                    rows="2"
                    placeholder="Short description of income type..."
                    value={incomeHead.description}
                    onChange={(e) => setIncomeHead({ ...incomeHead, description: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving === 'income'}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 hover:bg-teal-800 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  <Plus size={16} />
                  {saving === 'income' ? 'Creating Head...' : 'Add Other-Income Head'}
                </button>
              </form>

              {/* Directory List Column */}
              <div className="lg:col-span-7">
                <h3 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider mb-3">Other Income Heads Directory</h3>
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200 bg-white">
                  {filteredIncomeHeads.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 font-semibold">No other-income heads found.</div>
                  ) : (
                    filteredIncomeHeads.map((h, i) => (
                      <div key={h._id || i} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <CircleDollarSign size={16} className="text-teal-600" />
                          <div>
                            <div className="text-xs font-bold text-slate-900">{h.name}</div>
                            <div className="text-[10px] text-slate-500 font-medium">{h.description || 'General Income Head'}</div>
                          </div>
                        </div>
                        {h.code && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            {h.code}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChartOfAccountsPage;
