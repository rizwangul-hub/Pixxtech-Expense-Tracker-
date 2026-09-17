import React, { useState, useEffect, useRef } from 'react';
import { accountsAPI, transactionsAPI, uploadAPI } from '../services/api.js';
import { EvidenceImageUpload } from './EvidenceImageUpload.jsx';
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
  const [unitId, setUnitId] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [rentMonth, setRentMonth] = useState('');

  const derivedClassification = unitId
    ? 'UNIT_EXPENSE'
    : propertyId
    ? 'PROPERTY_OWN_EXPENSE'
    : 'GENERAL_EXPENSE';

  const expenseScope = propertyId ? 'PROPERTY' : 'GENERAL';
  const propertyExpenseType = unitId ? 'UNIT' : propertyId ? 'OWN' : 'OWN';

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
  const selectedProperty = properties.find((property) => property._id === propertyId);
  const units = selectedProperty?.units || [];

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

  useEffect(() => {
    const generalHeads = categories.filter(
      (c) => c.type === 'EXPENSE' && (!c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE')
    );

    const propertyHeads = propertyId
      ? categories.filter(
          (c) =>
            c.type === 'EXPENSE' &&
            c.expenseClassification === 'PROPERTY_OWN_EXPENSE' &&
            String(c.propertyId?._id || c.propertyId) === String(propertyId)
        )
      : [];

    const unitHeads = unitId
      ? categories.filter(
          (c) =>
            c.type === 'EXPENSE' &&
            c.expenseClassification === 'UNIT_EXPENSE' &&
            String(c.unitId?._id || c.unitId) === String(unitId)
        )
      : [];

    const availableHeads = [...unitHeads, ...propertyHeads, ...generalHeads];

    if (availableHeads.length > 0) {
      if (!categoryId || !availableHeads.some((c) => c._id === categoryId)) {
        setCategoryId(availableHeads[0]._id);
      }
    }
  }, [propertyId, unitId, categories]);

  const handleCreateCategory = async (e) => {
    e?.preventDefault();
    const name = customCategoryName.trim();

    if (name) {
      const existing = categories.find((c) => {
        if (c.name.trim().toLowerCase() !== name.toLowerCase()) return false;
        if (derivedClassification === 'GENERAL_EXPENSE') {
          return !c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE';
        }
        if (derivedClassification === 'PROPERTY_OWN_EXPENSE') {
          const pId = c.propertyId?._id || c.propertyId;
          return c.expenseClassification === 'PROPERTY_OWN_EXPENSE' && String(pId) === String(propertyId);
        }
        if (derivedClassification === 'UNIT_EXPENSE') {
          const uId = c.unitId?._id || c.unitId;
          return c.expenseClassification === 'UNIT_EXPENSE' && String(uId) === String(unitId);
        }
        return false;
      });

      if (existing) {
        setCategoryId(existing._id);
        setCustomCategoryName('');
        setError(null);
        setSuccess(`Expense head '${existing.name}' selected.`);
        return;
      }
    }

    try {
      setSavingCategory(true);
      const response = await accountsAPI.createCategory({
        name,
        propertyId: propertyId || null,
        unitId: unitId || null,
      });
      const category = response.data?.category || response.category || response.data;
      if (category && category._id) {
        setCategoryId(category._id);
      }
      setCustomCategoryName('');
      setError(null);
      setSuccess(`Expense head '${category?.name || name}' selected.`);
      await onMasterDataChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to select expense head.');
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
    if (!crAccountId) {
      setError('Please select a Credit Account (Cr.) - Disbursing / Paid From Account.');
      return;
    }

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount strictly greater than 0.');
      return;
    }

    try {
      setLoading(true);
      const uploadedImages = evidenceFiles.length
        ? (await uploadAPI.images(evidenceFiles)).images
        : [];
      const res = await transactionsAPI.recordVoucher({
        date,
        voucherNo: voucherNo.trim(),
        detail: detail.trim(),
        categoryId,
        ...(drAccountId ? { drAccountId } : {}),
        crAccountId,
        amount: numAmount,
        propertyId: propertyId || null,
        unitId: unitId || null,
        expenseClassification: derivedClassification,
        expenseScope,
        propertyExpenseType,
        attachments: uploadedImages,
        rentMonth: rentMonth || null,
      });

      setSuccess(`Voucher #${voucherNo} recorded successfully!`);

      // Reset form fields for rapid next entry
      setAmount('');
      setDetail('');
      setPropertyId('');
      setUnitId('');
      setEvidenceFiles([]);
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
      className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs"
    >
      <div className="section-bar mb-5 shadow-2xs">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-white" />
            Quick Expense & Transfer Voucher Entry
          </h2>
          <p className="text-xs text-white/90 font-medium">
            Rapid voucher entry. Press{' '}
            <kbd className="px-1.5 py-0.5 bg-white/20 border border-white/40 rounded text-white font-mono text-[11px]">
              Ctrl + Enter
            </kbd>{' '}
            to save.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchNextVn}
          disabled={fetchingVn}
          className="text-xs font-bold flex items-center gap-1.5 text-white bg-white/20 hover:bg-white/30 border border-white/30 px-3 py-1.5 rounded-lg transition text-white-keep"
        >
          <Sparkles className="w-3.5 h-3.5 text-white-keep" />
          Auto-Gen Next V.N
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>{success}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-sm font-semibold">
        {/* Row 1: Date & Voucher No */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-4 h-4 text-blue-600" /> Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1 flex items-center gap-1">
              <Hash className="w-4 h-4 text-blue-600" /> Voucher No (V.N)
            </label>
            <div className="relative">
              <input
                type="text"
                value={voucherNo}
                onChange={(e) => setVoucherNo(e.target.value)}
                placeholder="e.g. 3067"
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono text-blue-700 font-bold focus:outline-none focus:border-blue-600"
                required
              />
              {fetchingVn && (
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-medium">
                  Fetching...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Property & Unit Pickers (Derives Scope automatically) */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Property Picker */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1 flex items-center gap-1">
                <Building className="w-4 h-4 text-blue-600" /> Select Property (Optional / Leave empty for General Expense)
              </label>
              <select
                value={propertyId}
                onChange={(e) => {
                  const val = e.target.value;
                  setPropertyId(val);
                  setUnitId('');
                  setCategoryId(''); // Reset head selection on scope change
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-600"
              >
                <option value="">-- None (General Company Expense) --</option>
                {properties.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.plazaName || p.propertyName} ({p.location || p.city || 'Commercial Plaza'})
                  </option>
                ))}
              </select>
            </div>

            {/* Unit Picker (Shown only if property is selected) */}
            {propertyId ? (
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Select Unit (Optional / Leave empty for Property Own Expense)
                </label>
                <select
                  value={unitId}
                  onChange={(e) => {
                    setUnitId(e.target.value);
                    setCategoryId(''); // Reset head selection on scope change
                  }}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-600"
                >
                  <option value="">-- None (Property Own Expense) --</option>
                  {units.map((unit) => (
                    <option key={unit._id} value={unit._id}>
                      {unit.unitName || unit.unitNumber || unit.name || 'Unit'} {unit.tenantName ? `(${unit.tenantName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="hidden md:flex items-center text-xs font-bold text-slate-500 pt-5">
                <span>🌐 General Company Expense (No Property Selected)</span>
              </div>
            )}
          </div>

          {/* Scope Indicator Badge */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600">Active Expense Head Scope:</span>
            {!propertyId ? (
              <span className="px-2.5 py-1 rounded-md bg-slate-200 text-slate-800 border border-slate-300">
                🌐 General Expense (Showing General Heads)
              </span>
            ) : !unitId ? (
              <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
                🏢 Property Own Expense (Showing Property Heads for {selectedProperty?.plazaName || selectedProperty?.propertyName})
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-md bg-blue-100 text-blue-900 border border-blue-300">
                🚪 Unit Expense (Showing Unit Heads)
              </span>
            )}
          </div>
        </div>

        <EvidenceImageUpload files={evidenceFiles} onChange={setEvidenceFiles} disabled={loading} />

        {/* Row 3: Account Head / Category (Replaces Dr location) & Credit Disbursing Account */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Column 1: Account Head / Category */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1 flex items-center gap-1">
              <Tag className="w-4 h-4 text-blue-600" /> Account Head / Category (Where Expense Goes)
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-600"
              required
            >
              <option value="">-- Select Expense Head --</option>
              {(() => {
                const generalHeads = categories.filter(
                  (c) => c.type === 'EXPENSE' && (!c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE')
                );

                const propertyHeads = propertyId
                  ? categories.filter(
                      (c) =>
                        c.type === 'EXPENSE' &&
                        c.expenseClassification === 'PROPERTY_OWN_EXPENSE' &&
                        String(c.propertyId?._id || c.propertyId) === String(propertyId)
                    )
                  : [];

                const unitHeads = unitId
                  ? categories.filter(
                      (c) =>
                        c.type === 'EXPENSE' &&
                        c.expenseClassification === 'UNIT_EXPENSE' &&
                        String(c.unitId?._id || c.unitId) === String(unitId)
                    )
                  : [];

                return (
                  <>
                    {unitId && unitHeads.length > 0 && (
                      <optgroup label={`Unit Expense Categories (${selectedProperty?.plazaName || 'Property'})`}>
                        {unitHeads.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name} {c.isRentalHead ? '(Rental)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {propertyId && propertyHeads.length > 0 && (
                      <optgroup label={`Property Expense Categories (${selectedProperty?.plazaName || 'Property'})`}>
                        {propertyHeads.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name} {c.isRentalHead ? '(Rental)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {generalHeads.length > 0 && (
                      <optgroup label="General Expense Categories">
                        {generalHeads.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name} {c.isRentalHead ? '(Rental)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {unitHeads.length === 0 && propertyHeads.length === 0 && generalHeads.length === 0 && (
                      <option value="" disabled>
                        -- No Expense Categories found --
                      </option>
                    )}
                  </>
                );
              })()}
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
                  placeholder="Add new head, e.g. Security Equipment"
                  maxLength={100}
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={savingCategory}
                  className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                >
                  {savingCategory ? 'Saving...' : '+ Add Head'}
                </button>
              </div>
            )}
          </div>

          {/* Column 2: Credit Account (Cr) - Paid From / Disbursing Account */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1 flex items-center gap-1">
              <DollarSign className="w-4 h-4 text-rose-600" /> Credit Account (Cr.) - <span className="text-rose-700">Paid From / Disbursing (Balance Decreases)</span>
            </label>
            <select
              value={crAccountId}
              onChange={(e) => setCrAccountId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-600"
              required
            >
              <option value="">-- Select Paid From / Disbursing Account --</option>
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
            <label className="text-xs font-bold uppercase text-slate-700">
              Amount (PKR)
            </label>
            <span className="font-mono text-sm font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
              {formatPKR(amount)}
            </span>
          </div>
          <input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 63146"
            className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-base font-mono text-slate-900 font-bold focus:outline-none focus:border-blue-600"
            required
          />
        </div>

        {/* Row 5: Transaction Detail / Description with Quick Auto-fill Tags */}
        <div>
          <label className="block text-xs font-bold uppercase text-slate-700 mb-1 flex items-center gap-1">
            <FileText className="w-4 h-4 text-blue-600" /> Transaction Detail / Narration
          </label>
          <textarea
            ref={detailInputRef}
            rows="2"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Type transaction narrative..."
            className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-600 resize-none"
            required
          />

          {/* Quick Auto-fill Tags */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-600 font-bold mr-1">Quick Tags:</span>
            {QUICK_TAGS.map((tag, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setDetail((prev) => (prev ? `${prev} - ${tag}` : tag))}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-md border border-slate-300 font-medium transition shadow-2xs"
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-xl shadow-md transition flex items-center justify-center gap-2 text-white-keep disabled:opacity-50"
          >
            <Send className="w-5 h-5 text-white-keep" />
            {loading ? 'Recording Voucher...' : 'Record Voucher (Ctrl + Enter)'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default VoucherEntryForm;
