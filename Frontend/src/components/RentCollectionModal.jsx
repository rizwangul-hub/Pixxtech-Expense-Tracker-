import React, { useState, useEffect } from 'react';
import { rentAPI } from '../services/api.js';
import {
  Building2,
  Home,
  User,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Receipt,
} from 'lucide-react';

const formatPKR = (val) => {
  if (val === '' || val === null || isNaN(val)) return 'Rs. 0';
  return 'Rs. ' + new Intl.NumberFormat('en-PK').format(Number(val));
};

export const RentCollectionModal = ({
  properties = [],
  accounts = [],
  onRentCollected,
}) => {
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);

  const [rentMonth, setRentMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivingAccountId, setReceivingAccountId] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');

  const [loadingUnits, setLoadingUnits] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // When property selection changes, load units
  useEffect(() => {
    if (!selectedPropertyId) {
      setUnits([]);
      setSelectedUnitId('');
      setSelectedUnit(null);
      return;
    }

    const loadUnits = async () => {
      try {
        setLoadingUnits(true);
        setError(null);
        const res = await rentAPI.getPlazaUnits(selectedPropertyId, rentMonth);
        setUnits(res.units || []);

        if (res.units && res.units.length > 0) {
          setSelectedUnitId(res.units[0]._id);
          setSelectedUnit(res.units[0]);
          setAmountPaid(String(res.units[0].balanceDue || res.units[0].agreedRent || ''));
          if (res.units[0].defaultReceivingAccount?._id) {
            setReceivingAccountId(res.units[0].defaultReceivingAccount._id);
          }
        } else {
          setSelectedUnitId('');
          setSelectedUnit(null);
        }
      } catch (err) {
        setError('Failed to fetch plaza units.');
      } finally {
        setLoadingUnits(false);
      }
    };

    loadUnits();
  }, [selectedPropertyId, rentMonth]);

  // When unit selection changes, update unit card and default amount
  const handleUnitChange = (e) => {
    const uId = e.target.value;
    setSelectedUnitId(uId);
    const unit = units.find((u) => u._id === uId);
    setSelectedUnit(unit || null);

    if (unit) {
      setAmountPaid(String(unit.balanceDue || unit.agreedRent || ''));
      if (unit.defaultReceivingAccount?._id) {
        setReceivingAccountId(unit.defaultReceivingAccount._id);
      }
    }
  };

  // Real-time breakdown calculations
  const agreedRent = selectedUnit?.agreedRent || 0;
  const balanceDue = selectedUnit?.balanceDue !== undefined ? selectedUnit.balanceDue : agreedRent;
  const numericPaid = Number(amountPaid) || 0;

  const priorCleared = 0;
  const currentMonthCleared = Math.min(numericPaid, balanceDue);
  const advanceRent = Math.max(0, numericPaid - currentMonthCleared);

  // Submit Rent Collection
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedPropertyId || !selectedUnitId || !receivingAccountId || numericPaid <= 0) {
      setError('Please complete all required fields with an amount greater than 0.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await rentAPI.collectRent({
        propertyId: selectedPropertyId,
        unitId: selectedUnitId,
        rentMonth,
        receivingAccountId,
        amountPaid: numericPaid,
        paymentDate,
        notes,
      });

      setSuccess(
        `Rent receipt created! Voucher #${res.voucher?.voucherNo} recorded into receiving account.`
      );

      // Trigger parent callback to refresh balances and tables
      if (onRentCollected) {
        onRentCollected(res);
      }

      // Reset amount
      setAmountPaid('');
      setNotes('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to collect rent.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-400" />
            Property Rent Collection & Receipt Voucher
          </h2>
          <p className="text-xs text-slate-400">
            Auto-allocates rent collection across arrears, monthly agreed dues, and advance rent.
          </p>
        </div>
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
        {/* Row 1: Plaza and Target Rent Month */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> Plaza / Property
            </label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
              required
            >
              <option value="">-- Select Plaza --</option>
              {properties.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.plazaName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Rent Billing Month (YYYY-MM)
            </label>
            <input
              type="month"
              value={rentMonth}
              onChange={(e) => setRentMonth(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>
        </div>

        {/* Row 2: Unit Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> Leasable Unit / Floor
          </label>
          <select
            value={selectedUnitId}
            onChange={handleUnitChange}
            disabled={loadingUnits || units.length === 0}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
            required
          >
            <option value="">
              {loadingUnits
                ? 'Loading units...'
                : units.length === 0
                ? '-- Select a plaza first --'
                : '-- Select Unit --'}
            </option>
            {units.map((u) => (
              <option key={u._id} value={u._id}>
                {u.unitName} - {u.tenantName || 'Vacant'} (Agreed: Rs.{' '}
                {u.agreedRent?.toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic Tenant Info Card */}
        {selectedUnit && (
          <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-800 rounded text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Tenant Name</span>
                <span className="text-sm font-semibold text-white truncate block">
                  {selectedUnit.tenantName || 'N/A'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-800 rounded text-slate-400">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Agreed Monthly Rent</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  {formatPKR(selectedUnit.agreedRent)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-800 rounded text-slate-400">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Payment Due Day</span>
                <span className="text-sm font-semibold text-amber-300">
                  {selectedUnit.dueDay ? `${selectedUnit.dueDay}th of month` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Row 3: Amount Paid & Payment Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase text-slate-400">
                Amount Paid (PKR)
              </label>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {formatPKR(amountPaid)}
              </span>
            </div>
            <input
              type="number"
              step="any"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="e.g. 85000"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Payment Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>
        </div>

        {/* Row 4: Receiving Account */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
            Receiving Bank / Cash Account
          </label>
          <select
            value={receivingAccountId}
            onChange={(e) => setReceivingAccountId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
            required
          >
            <option value="">-- Select Receiving Account --</option>
            <optgroup label="Bank Accounts">
              {accounts
                .filter((a) => a.type === 'BANK')
                .map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} (PKR {a.currentBalance?.toLocaleString()})
                  </option>
                ))}
            </optgroup>
            <optgroup label="Cash Custodians">
              {accounts
                .filter((a) => a.type === 'CASH')
                .map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} (PKR {a.currentBalance?.toLocaleString()})
                  </option>
                ))}
            </optgroup>
          </select>
        </div>

        {/* Real-time Allocation Breakdown Preview */}
        {numericPaid > 0 && (
          <div className="bg-slate-950/70 border border-blue-500/20 rounded-lg p-3 text-xs">
            <span className="font-semibold text-blue-300 block mb-2 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Automatic Payment Allocation Breakdown:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-300">
              <div className="bg-slate-900 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase">
                  Prior Receivables Cleared
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {formatPKR(priorCleared)}
                </span>
              </div>
              <div className="bg-slate-900 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase">
                  Current Month Rent ({rentMonth})
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatPKR(currentMonthCleared)}
                </span>
              </div>
              <div className="bg-slate-900 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase">
                  Advance Rent Received
                </span>
                <span className="font-mono font-bold text-teal-300">
                  {formatPKR(advanceRent)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Optional Notes */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
            Notes / Cheque No / Deposit Ref
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Cheque # 984521 Allied Bank deposited"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Submit Button */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-lg shadow-lg hover:shadow-blue-900/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Receipt className="w-4 h-4" />
            {submitting ? 'Recording Rent Receipt...' : 'Record Rent Receipt'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RentCollectionModal;
