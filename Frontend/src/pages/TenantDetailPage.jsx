import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Users,
  Building,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  FileText,
  Clock,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import { tenantsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';

export function TenantDetailPage({ tenantId, currentUser, onBack, onSelectAgreement }) {
  const [tenantData, setTenantData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTenant = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await tenantsAPI.getTenantById(tenantId);
      if (res?.success) {
        setTenantData(res.data);
      } else {
        setError(res?.message || 'Failed to load tenant details.');
      }
    } catch (err) {
      console.error('Error fetching tenant details:', err);
      setError(err.response?.data?.message || err.message || 'Error loading tenant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadTenant();
    }
  }, [tenantId]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-500" />
        <p className="text-sm">Loading tenant 360 profile...</p>
      </div>
    );
  }

  if (error || !tenantData) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white flex items-center gap-1.5 text-sm transition"
        >
          <ArrowLeft size={16} /> Back to Tenants Directory
        </button>
        <div className="bg-red-950/50 border border-red-800 text-red-300 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="text-red-400 shrink-0" />
          <p className="text-sm">{error || 'Tenant not found.'}</p>
        </div>
      </div>
    );
  }

  const { tenant, currentAgreement, agreements = [], rentDueHistory = [] } = tenantData;

  return (
    <div className="space-y-6">
      {/* Back Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white flex items-center gap-1.5 text-sm transition group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition" />
          <span>Back to Tenants Directory</span>
        </button>

        <button
          onClick={loadTenant}
          className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          title="Refresh profile"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Profile Header & Top Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Card: Tenant Profile Details */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                Tenant Profile
              </span>
              <h2 className="text-xl font-bold text-white mt-2">{tenant.fullName}</h2>
              {tenant.companyName && (
                <p className="text-xs text-slate-400 font-medium mt-0.5">{tenant.companyName}</p>
              )}
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                tenant.status === 'ACTIVE'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {tenant.status}
            </span>
          </div>

          <div className="mt-6 space-y-3.5 border-t border-slate-800/80 pt-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Phone size={13} className="text-slate-500" /> Phone
              </span>
              <span className="text-slate-200 font-medium text-xs">{tenant.phone}</span>
            </div>

            {tenant.alternatePhone && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Phone size={13} className="text-slate-500" /> Alternate Phone
                </span>
                <span className="text-slate-200 text-xs">{tenant.alternatePhone}</span>
              </div>
            )}

            {tenant.email && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Mail size={13} className="text-slate-500" /> Email
                </span>
                <span className="text-slate-200 text-xs">{tenant.email}</span>
              </div>
            )}

            {tenant.identificationNumber && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <FileText size={13} className="text-slate-500" /> CNIC / NTN
                </span>
                <span className="text-slate-200 font-mono text-xs">
                  {tenant.identificationNumber}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-500" /> City / Country
              </span>
              <span className="text-slate-200 text-xs">
                {tenant.city}, {tenant.country}
              </span>
            </div>

            {tenant.address && (
              <div className="pt-2 border-t border-slate-800/40">
                <span className="text-[11px] text-slate-400 block mb-1">Correspondence Address</span>
                <p className="text-xs text-slate-300 leading-relaxed">{tenant.address}</p>
              </div>
            )}

            {tenant.notes && (
              <div className="pt-2 border-t border-slate-800/40">
                <span className="text-[11px] text-slate-400 block mb-1">Remarks & Notes</span>
                <p className="text-xs text-slate-400 italic leading-relaxed">{tenant.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Card (2 cols): Current Tenancy Overview */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                  Current Tenancy
                </span>
                <h3 className="text-lg font-bold text-white mt-1">Active Leased Unit</h3>
              </div>
              {currentAgreement && (
                <span className="font-mono text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-1 rounded-lg">
                  {currentAgreement.agreementNumber}
                </span>
              )}
            </div>

            {currentAgreement ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
                    <span className="text-[11px] text-slate-400">Monthly Agreed Rent</span>
                    <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                      {formatPKR(currentAgreement.monthlyRent)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Due Day {currentAgreement.dueDay} of each month
                    </div>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
                    <span className="text-[11px] text-slate-400">Lease Period</span>
                    <div className="text-xs font-semibold text-white mt-1">
                      {formatDate(currentAgreement.startDate)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      to {formatDate(currentAgreement.endDate)}
                    </div>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
                    <span className="text-[11px] text-slate-400">Property & Location</span>
                    <div className="text-xs font-semibold text-white mt-1 truncate">
                      {currentAgreement.propertyId?.propertyName}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-medium">
                      Unit: {currentAgreement.unitDetails?.unitName || 'Occupied Unit'}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-4 text-xs text-slate-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Unit Type & Floor:</span>
                    <span className="text-slate-200 font-medium">
                      {currentAgreement.unitDetails?.unitType || 'Commercial'} —{' '}
                      {currentAgreement.unitDetails?.floor || 'Floor'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Security Deposit:</span>
                    <span className="text-slate-200 font-mono">
                      {formatPKR(currentAgreement.securityDeposit || 0)}
                    </span>
                  </div>
                  {currentAgreement.renewalDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Scheduled Renewal:</span>
                      <span className="text-amber-400 font-medium">
                        {formatDate(currentAgreement.renewalDate)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/60 my-auto">
                <Building size={32} className="mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">No Current Active Lease</p>
                <p className="text-xs text-slate-500 mt-1">
                  This tenant does not currently occupy any leasable units.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agreement History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-indigo-400" />
            <h3 className="text-base font-bold text-white">Tenancy Agreement History</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {agreements.length} {agreements.length === 1 ? 'Record' : 'Records'}
          </span>
        </div>

        {agreements.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No historical agreements found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Agreement #</th>
                  <th className="py-2.5 px-3">Property</th>
                  <th className="py-2.5 px-3">Unit</th>
                  <th className="py-2.5 px-3">Start Date</th>
                  <th className="py-2.5 px-3">End Date</th>
                  <th className="py-2.5 px-3 text-right">Monthly Rent</th>
                  <th className="py-2.5 px-3 text-center">Due Day</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {agreements.map((agr) => (
                  <tr key={agr._id} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 font-mono font-medium text-indigo-300">
                      {agr.agreementNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">
                      {agr.propertyId?.propertyName || 'Property'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-medium">
                      {agr.unitDetails?.unitName || 'Unit'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{formatDate(agr.startDate)}</td>
                    <td className="py-2.5 px-3 text-slate-400">{formatDate(agr.endDate)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                      {formatPKR(agr.monthlyRent)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-300">
                      Day {agr.dueDay}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          agr.status === 'ACTIVE'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : agr.status === 'EXPIRED'
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                            : agr.status === 'TERMINATED'
                            ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {agr.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rent Due Schedule & History */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-emerald-400" />
            <h3 className="text-base font-bold text-white">Monthly Rent Due Schedule</h3>
          </div>
          <span className="text-xs text-slate-500">
            Expected rent billing ledger 
          </span>
        </div>

        {rentDueHistory.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            No rent due records generated for this tenant yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Rent Month</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Property</th>
                  <th className="py-2.5 px-3">Unit</th>
                  <th className="py-2.5 px-3 text-right">Expected Rent</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rentDueHistory.map((rd) => (
                  <tr key={rd._id} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 font-mono font-semibold text-white">
                      {rd.rentMonth}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{formatDate(rd.dueDate)}</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {rd.propertyId?.propertyName || 'Property'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-medium">{rd.unitName}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                      {formatPKR(rd.expectedRentAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                        {rd.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default TenantDetailPage;
