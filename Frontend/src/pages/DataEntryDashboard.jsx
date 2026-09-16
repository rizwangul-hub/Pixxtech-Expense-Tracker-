import React, { useState, useEffect } from 'react';
import {
  Building2,
  Calendar,
  DollarSign,
  Receipt,
  Layers,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { CashCustodianBar } from '../components/CashCustodianBar.jsx';
import { VoucherEntryForm } from '../components/VoucherEntryForm.jsx';
import { RentCollectionModal } from '../components/RentCollectionModal.jsx';
import { RecentEntriesTable } from '../components/RecentEntriesTable.jsx';
import { accountsAPI, transactionsAPI, otherIncomeAPI, transfersAPI } from '../services/api.js';
import { formatPKR } from '../utils/formatters.js';
import { isAdmin, isVerifier } from '../utils/permissions.js';

export const DataEntryDashboard = ({ user }) => {
  const [activeTab, setActiveTab] = useState('voucher'); // 'voucher' | 'rent' | 'other' | 'transfer'

  // Master data state
  const [accounts, setAccounts] = useState([]);
  const [custodians, setCustodians] = useState([]);
  const [categories, setCategories] = useState([]);
  const [properties, setProperties] = useState([]);
  const [recentEntries, setRecentEntries] = useState([]);
  const [otherHeads, setOtherHeads] = useState([]);

  const [loadingData, setLoadingData] = useState(true);
  const [refreshingEntries, setRefreshingEntries] = useState(false);
  const [actionMessage, setActionMessage] = useState({ text: '', type: '' });

  // Other Income Form State
  const [otherForm, setOtherForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    headId: '',
    accountId: '',
    receivedFrom: '',
    detail: '',
    reference: '',
  });
  const [submittingOther, setSubmittingOther] = useState(false);

  // Transfer Form State
  const [transferForm, setTransferForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    transferDate: new Date().toISOString().split('T')[0],
    reference: '',
    description: '',
  });
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  // Load active accounts and metadata
  const loadMasterData = async () => {
    try {
      setLoadingData(true);
      const [accRes, catRes, propRes, entriesRes, headsRes] = await Promise.all([
        accountsAPI.getActiveSummary(),
        accountsAPI.getCategories(),
        accountsAPI.getProperties(),
        transactionsAPI.getMyEntries(),
        otherIncomeAPI.getHeads().catch(() => ({ data: { heads: [] } })),
      ]);

      setAccounts(accRes.accounts || []);
      setCustodians(accRes.grouped?.custodians || []);
      setCategories(catRes.categories || []);
      setProperties(propRes.properties || []);
      setRecentEntries(entriesRes.transactions || []);
      const heads = headsRes?.data?.heads || headsRes?.heads || [];
      setOtherHeads(heads);
    } catch (err) {
      console.error('Failed to load master dashboard data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  // Quick refresh for recent entries and account balances
  const refreshEntries = async () => {
    try {
      setRefreshingEntries(true);
      const [entriesRes, accRes] = await Promise.all([
        transactionsAPI.getMyEntries(),
        accountsAPI.getActiveSummary(),
      ]);
      setRecentEntries(entriesRes.transactions || []);
      setAccounts(accRes.accounts || []);
      setCustodians(accRes.grouped?.custodians || []);
    } catch (err) {
      console.error('Failed to refresh entries:', err);
    } finally {
      setRefreshingEntries(false);
    }
  };

  useEffect(() => {
    loadMasterData();
  }, []);

  // Compute KPI card statistics
  const todayStr = new Date().toISOString().split('T')[0];
  const thisMonthStr = todayStr.slice(0, 7);

  const todayEntries = recentEntries.filter((e) => e.date && e.date.startsWith(todayStr));
  const monthEntries = recentEntries.filter((e) => e.date && e.date.startsWith(thisMonthStr));
  const pendingEntries = recentEntries.filter((e) => e.status === 'PENDING');
  const reversedEntries = recentEntries.filter((e) => e.status === 'REVERSED');

  // Submit Other Income
  const handleOtherIncomeSubmit = async (e) => {
    e.preventDefault();
    setSubmittingOther(true);
    setActionMessage({ text: '', type: '' });
    try {
      const res = await otherIncomeAPI.record({
        ...otherForm,
        amount: Number(otherForm.amount),
      });
      if (res.success) {
        setActionMessage({ text: 'Other income recorded successfully.', type: 'success' });
        setOtherForm({
          date: new Date().toISOString().split('T')[0],
          amount: '',
          headId: '',
          accountId: '',
          receivedFrom: '',
          detail: '',
          reference: '',
        });
        await refreshEntries();
      }
    } catch (err) {
      setActionMessage({
        text: err.response?.data?.message || err.message || 'Failed to record other income.',
        type: 'error',
      });
    } finally {
      setSubmittingOther(false);
    }
  };

  // Submit Transfer
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setSubmittingTransfer(true);
    setActionMessage({ text: '', type: '' });
    try {
      if (transferForm.fromAccountId === transferForm.toAccountId) {
        throw new Error('Source and destination accounts must be different.');
      }
      const res = await transfersAPI.executeTransfer({
        ...transferForm,
        amount: Number(transferForm.amount),
      });
      if (res.success) {
        setActionMessage({ text: 'Internal transfer completed successfully.', type: 'success' });
        setTransferForm({
          fromAccountId: '',
          toAccountId: '',
          amount: '',
          transferDate: new Date().toISOString().split('T')[0],
          reference: '',
          description: '',
        });
        await refreshEntries();
      }
    } catch (err) {
      setActionMessage({
        text: err.response?.data?.message || err.message || 'Failed to execute transfer.',
        type: 'error',
      });
    } finally {
      setSubmittingTransfer(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Persistent Live Cash Custodian Bar */}
        <CashCustodianBar
          custodians={custodians}
          onRefresh={refreshEntries}
          loading={refreshingEntries}
        />

        {/* Part 23: Operator KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-slate-500">Today's Entries</span>
              <Clock size={16} className="text-blue-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">
              {todayEntries.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
              {formatPKR(todayEntries.reduce((s, e) => s + (e.amount || 0), 0))} recorded
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-slate-500">This Month</span>
              <Calendar size={16} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">
              {monthEntries.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
              {formatPKR(monthEntries.reduce((s, e) => s + (e.amount || 0), 0))} posted
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-amber-700">Pending Review</span>
              <AlertTriangle size={16} className="text-amber-600" />
            </div>
            <div className="text-2xl font-black font-mono text-amber-600 mt-1">
              {pendingEntries.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Awaiting management signoff</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-rose-700">Corrections / Reversals</span>
              <CheckCircle2 size={16} className="text-rose-600" />
            </div>
            <div className="text-2xl font-black font-mono text-rose-600 mt-1">
              {reversedEntries.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Reversed journal vouchers</div>
          </div>
        </div>

        {/* Action Message Alert */}
        {actionMessage.text && (
          <div
            className={`p-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            {actionMessage.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-rose-600" />}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Part 23: Tab Navigation Controls */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 pb-2">
          <button
            onClick={() => { setActiveTab('voucher'); setActionMessage({ text: '', type: '' }); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'voucher'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Tab A: Expense Voucher
          </button>

          <button
            onClick={() => { setActiveTab('rent'); setActionMessage({ text: '', type: '' }); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'rent'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Tab B: Rent Received
          </button>

          <button
            onClick={() => { setActiveTab('other'); setActionMessage({ text: '', type: '' }); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'other'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <Banknote className="w-4 h-4" />
            Tab C: Other Income
          </button>

          <button
            onClick={() => { setActiveTab('transfer'); setActionMessage({ text: '', type: '' }); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'transfer'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            Tab D: Internal Transfer
          </button>
        </div>

        {/* Active Work Tab Content */}
        <div className="mb-8">
          {activeTab === 'voucher' && (
            <VoucherEntryForm
              accounts={accounts}
              categories={categories}
              properties={properties}
              canManageMasterData={isAdmin(user) || isVerifier(user)}
              onMasterDataChanged={loadMasterData}
              onVoucherCreated={refreshEntries}
            />
          )}

          {activeTab === 'rent' && (
            <RentCollectionModal
              properties={properties}
              accounts={accounts}
              onRentCollected={refreshEntries}
            />
          )}

          {/* Tab C: Other Income Direct Entry */}
          {activeTab === 'other' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Banknote size={16} className="text-amber-600" />
                Record Other Income / Other Receipts
              </h2>
              <form onSubmit={handleOtherIncomeSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={otherForm.date}
                      onChange={(e) => setOtherForm({ ...otherForm, date: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Amount (PKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="e.g. 50000"
                      value={otherForm.amount}
                      onChange={(e) => setOtherForm({ ...otherForm, amount: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Income Head</label>
                    <select
                      value={otherForm.headId}
                      onChange={(e) => setOtherForm({ ...otherForm, headId: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    >
                      <option value="">Select Income Head...</option>
                      {otherHeads.map((h) => (
                        <option key={h._id} value={h._id}>{h.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Receiving Account (Dr.)</label>
                    <select
                      value={otherForm.accountId}
                      onChange={(e) => setOtherForm({ ...otherForm, accountId: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    >
                      <option value="">Select Receiving Account...</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>{a.name} ({a.type})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Received From (Payee)</label>
                    <input
                      type="text"
                      placeholder="e.g. Tenant, Client, Scrap buyer"
                      value={otherForm.receivedFrom}
                      onChange={(e) => setOtherForm({ ...otherForm, receivedFrom: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Narration / Detail</label>
                  <textarea
                    rows="2"
                    placeholder="Description of the receipt..."
                    value={otherForm.detail}
                    onChange={(e) => setOtherForm({ ...otherForm, detail: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-semibold"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingOther}
                    className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submittingOther ? 'Recording...' : 'Post Other Income'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab D: Internal Transfer Direct Entry */}
          {activeTab === 'transfer' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-sky-600" />
                Record Internal Funds Transfer (Bank &harr; Cash)
              </h2>
              <form onSubmit={handleTransferSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">From Account (Credit)</label>
                    <select
                      value={transferForm.fromAccountId}
                      onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    >
                      <option value="">Select Source Account...</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>{a.name} ({formatPKR(a.currentBalance)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">To Account (Debit)</label>
                    <select
                      value={transferForm.toAccountId}
                      onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    >
                      <option value="">Select Destination Account...</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>{a.name} ({formatPKR(a.currentBalance)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Transfer Amount (PKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="e.g. 100000"
                      value={transferForm.amount}
                      onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Transfer Date</label>
                    <input
                      type="date"
                      value={transferForm.transferDate}
                      onChange={(e) => setTransferForm({ ...transferForm, transferDate: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Reference / Cheque No.</label>
                    <input
                      type="text"
                      placeholder="e.g. Cheque #49202"
                      value={transferForm.reference}
                      onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Transfer Description / Reason</label>
                  <textarea
                    rows="2"
                    placeholder="e.g. Cash withdrawal from bank for operational expenses"
                    value={transferForm.description}
                    onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-semibold"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingTransfer}
                    className="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submittingTransfer ? 'Transferring...' : 'Execute Internal Transfer'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Recent Entries Journal Table */}
        <RecentEntriesTable
          entries={recentEntries}
          loading={refreshingEntries || loadingData}
          onRefresh={refreshEntries}
          onEntryUpdated={refreshEntries}
        />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 font-medium">
        Pixx Technologies Financial Systems &bull; Operational Workspace &bull; Double-Entry General Ledger
      </footer>
    </div>
  );
};

export default DataEntryDashboard;
