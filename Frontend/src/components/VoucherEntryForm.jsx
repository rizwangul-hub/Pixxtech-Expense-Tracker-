import React, { useState, useEffect, useRef } from 'react';
import { accountsAPI, transactionsAPI } from '../services/api.js';
import {
  Send,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Command,
  Building,
  Tag,
  Hash,
  Calendar,
  DollarSign,
  FileText,
} from 'lucide-react';

const QUICK_TAGS = [
  'Paid for fuel expenses',
  'Office electricity & utility bill',
  'Staff tea, lunch & entertainment',
  'Salary advance disbursed',
  'Monthly maintenance & repair',
  'Printing, stationery & office supplies',
  'BOSS purchases & material',
  'Bank transfer for operational liquidity',
];

const formatPKR = (val) => {
  if (val === '' || val === null || isNaN(val)) return 'Rs. 0';
  return 'Rs. ' + new Intl.NumberFormat('en-PK').format(Number(val));
};

export const VoucherEntryForm = ({
  accounts = [],
  categories = [],
  properties = [],
  onVoucherCreated,
  canManageMasterData = false,
  onMasterDataChanged,
}) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherNo, setVoucherNo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [drAccountId, setDrAccountId] = useState('');
  const [crAccountId, setCrAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [detail, setDetail] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [rentMonth, setRentMonth] = useState('');

  const [loading, setLoading] = useState(false);
  const [fetchingVn, setFetchingVn] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const detailInputRef = useRef(null);

  // Group accounts for dropdowns
  const bankAccounts = accounts.filter((a) => a.type === 'BANK');
  const cashAccounts = accounts.filter((a) => a.type === 'CASH');

  // Fetch next sequential Voucher Number
  const fetchNextVn = async () => {
    try {
      setFetchingVn(true);
      const res = await transactionsAPI.suggestVoucherNo();
      if (res.suggestedVoucherNo) {
        setVoucherNo(res.suggestedVoucherNo);
      }
    } catch (err) {
      console.warn('Could not auto-fetch VN:', err.message);
    } finally {
      setFetchingVn(false);
    }
  };

  useEffect(() => {
    fetchNextVn();
  }, []);

  const handleCreateCategory = async (e) => {
    e?.preventDefault();
    const name = customCategoryName.trim();
    if (!name) {
      setError('Enter an expense head name before saving.');
      return;
    }

    try {
      setSavingCategory(true);
      const response = await accountsAPI.createCategory({ name });
      const category = response.data?.category || response.category;
      setCategoryId(category._id);
      setCustomCategoryName('');
      setError(null);
      setSuccess(`Expense head '${category.name}' is ready and selected.`);
      await onMasterDataChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create expense head.');
    } finally {
      setSavingCategory(false);
    }
  };

  // Handle Form Submission
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    // Client-side validation checks
    if (!voucherNo.trim()) {
      setError('Voucher Number (V.N) is required.');
      return;
    }
    if (!detail.trim()) {
      setError('Transaction Detail / Narration is required.');
      detailInputRef.current?.focus();
      return;
    }
    if (!categoryId) {
      setError('Please select an Account Head / Category.');
      return;
    }
    if (!drAccountId) {
      setError('Please select a Debit (Dr.) receiving account.');
      return;
    }
    if (!crAccountId) {
      setError('Please select a Credit (Cr.) disbursing account.');
      return;
    }
    if (drAccountId === crAccountId) {
      setError('Debit (Dr.) and Credit (Cr.) accounts cannot be the same.');
      return;
    }

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount strictly greater than 0.');
      return;
    }

    try {
      setLoading(true);
      const res = await transactionsAPI.recordVoucher({
        date,
        voucherNo: voucherNo.trim(),
        detail: detail.trim(),
        categoryId,
        drAccountId,
        crAccountId,
        amount: numAmount,
        propertyId: propertyId || null,
        rentMonth: rentMonth || null,
      });

      setSuccess(`Voucher #${voucherNo} recorded successfully!`);

      // Reset form fields for rapid next entry
      setAmount('');
      setDetail('');
      setPropertyId('');
      setRentMonth('');
      setError(null);

      // Fetch the next voucher number
      await fetchNextVn();

      // Trigger parent callback to refresh balance bar & recent table
      if (onVoucherCreated) {
        onVoucherCreated(res.transaction);
      }

      // Re-focus on detail input for immediate next entry
      setTimeout(() => {
        detailInputRef.current?.focus();
      }, 100);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to record voucher.');
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcut: Ctrl + Enter or Cmd + Enter to submit
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Quick Expense & Transfer Voucher Entry
          </h2>
          <p className="text-xs text-slate-400">
            Rapid double-entry bookkeeping journal. Use{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono text-[11px]">
              Ctrl + Enter
            </kbd>{' '}
            to instantly save.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchNextVn}
          disabled={fetchingVn}
          className="text-xs flex items-center gap-1.5 text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-lg transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Auto-Gen Next V.N
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>{success}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Date & Voucher No */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
              <Hash className="w-3.5 h-3.5" /> Voucher No (V.N)
            </label>
            <div className="relative">
              <input
                type="text"
                value={voucherNo}
                onChange={(e) => setVoucherNo(e.target.value)}
                placeholder="e.g. 3067"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-emerald-400 font-bold focus:outline-none focus:border-blue-500 transition"
                required
              />
              {fetchingVn && (
                <span className="absolute right-3 top-2.5 text-xs text-slate-500">
                  Fetching...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Category Head */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" /> Account Head / Category
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
            required
          >
            <option value="">-- Select Category Head --</option>
            <optgroup label="Expense Heads">
              {categories
                .filter((c) => c.type === 'EXPENSE')
                .map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} {c.isRentalHead ? '(Rental)' : ''}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Income Heads">
              {categories
                .filter((c) => c.type === 'INCOME')
                .map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Transfers">
              {categories
                .filter((c) => c.type === 'TRANSFER')
                .map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          </select>
          {canManageMasterData && (
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={customCategoryName}
                onChange={(e) => setCustomCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateCategory();
                  }
                }}
                placeholder="Add a new expense head, e.g. Security Equipment"
                maxLength={100}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={savingCategory}
                className="px-3 py-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {savingCategory ? 'Saving...' : '+ Add New Expense Head'}
              </button>
            </div>
          )}
        </div>

        {/* Row 3: Debit (Dr) & Credit (Cr) Accounts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Debit Account (Dr.) - <span className="text-emerald-400">Balance Increases</span>
            </label>
            <select
              value={drAccountId}
              onChange={(e) => setDrAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
              required
            >
              <option value="">-- Select Receiving / Dr Account --</option>
              <optgroup label="Bank Accounts">
                {bankAccounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} (PKR {a.currentBalance?.toLocaleString()})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Cash Custodians">
                {cashAccounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} (PKR {a.currentBalance?.toLocaleString()})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Credit Account (Cr.) - <span className="text-rose-400">Balance Decreases</span>
            </label>
            <select
              value={crAccountId}
              onChange={(e) => setCrAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
              required
            >
              <option value="">-- Select Disbursing / Cr Account --</option>
              <optgroup label="Cash Custodians (Paid from cash)">
                {cashAccounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} (PKR {a.currentBalance?.toLocaleString()})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Bank Accounts (Paid from bank)">
                {bankAccounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} (PKR {a.currentBalance?.toLocaleString()})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Row 4: Amount with Live PKR Format Preview */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold uppercase text-slate-400">
              Amount (PKR)
            </label>
            <span className="font-mono text-sm font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
              {formatPKR(amount)}
            </span>
          </div>
          <input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 63146"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-base font-mono text-white focus:outline-none focus:border-blue-500 transition"
            required
          />
        </div>

        {/* Row 5: Transaction Detail / Description with Quick Auto-fill Tags */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Transaction Detail / Narration
          </label>
          <textarea
            ref={detailInputRef}
            rows="2"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Type transaction narrative..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition resize-none"
            required
          />

          {/* Quick Auto-fill Tags */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-medium mr-1">Quick Tags:</span>
            {QUICK_TAGS.map((tag, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setDetail((prev) => (prev ? `${prev} - ${tag}` : tag))}
                className="text-[11px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 transition"
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Optional Property Link (Collapsible or subtle) */}
        <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-slate-500 mb-1 flex items-center gap-1">
              <Building className="w-3 h-3" /> Optional Property Link
            </label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-slate-600"
            >
              <option value="">-- None (General Expense) --</option>
              {properties.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.plazaName}
                </option>
              ))}
            </select>
          </div>

          <div className="w-40">
            <label className="block text-[11px] text-slate-500 mb-1">
              Rent Month (YYYY-MM)
            </label>
            <input
              type="month"
              value={rentMonth}
              onChange={(e) => setRentMonth(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-slate-600"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm rounded-lg shadow-lg hover:shadow-emerald-900/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {loading ? 'Recording Voucher...' : 'Record Voucher (Ctrl + Enter)'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default VoucherEntryForm;
