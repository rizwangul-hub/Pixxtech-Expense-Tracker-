import React, { useState, useEffect } from 'react';
import { Printer, Download, X, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { vouchersAPI } from '../services/api.js';
import { formatPKR } from '../utils/formatters.js';

// Image assets
import pixxLogo from '../assets/image/logo.png';
import sarfrazSign from '../assets/image/sarfrazsign.png';
import khurshidSign from '../assets/image/khurshidsign.png';

export function SingleVoucherPrintModal({ transactionId, voucherId, initialData, onClose }) {
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [error, setError] = useState('');

  const targetId = transactionId || voucherId || initialData?._id;

  useEffect(() => {
    const fetchDetail = async () => {
      if (!targetId && !initialData) {
        setError('No valid transaction ID provided for printing.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError('');
        const res = await vouchersAPI.getPrintDetail(targetId);
        const payload = res.data || res;
        setData(payload);
      } catch (err) {
        console.error('Failed to load voucher print detail:', err);
        setError(err.response?.data?.message || err.message || 'Failed to fetch voucher print details.');
      } finally {
        setLoading(false);
      }
    };

    if (targetId && !initialData?.property) {
      fetchDetail();
    }
  }, [targetId]);

  const handlePrint = async () => {
    try {
      setPrintingPdf(true);
      await vouchersAPI.printSingleVoucherPDF(targetId);
    } catch (err) {
      console.error('Print PDF error:', err);
      window.print();
    } finally {
      setPrintingPdf(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setDownloadingPdf(true);
      await vouchersAPI.downloadSingleVoucherPDF(targetId, data?.voucherNo);
    } catch (err) {
      console.error('Download PDF error:', err);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 text-center space-y-3 shadow-xl border border-slate-200">
          <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto" />
          <div className="text-xs font-bold text-slate-700">Retrieving official transaction record...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 text-center shadow-xl border border-slate-200">
          <AlertTriangle size={32} className="text-rose-600 mx-auto" />
          <div className="text-xs font-bold text-slate-900">{error || 'Record not found.'}</div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold w-full"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const isPending = data.status === 'PENDING' || data.status === 'PENDING_VERIFICATION';
  const isRent = data.documentTitle?.includes('RENT') || data.reportCategory === 'Rent';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md overflow-y-auto flex justify-center p-2 sm:p-4 md:p-6 font-sans">
      {/* Container wrapper */}
      <div className="relative bg-slate-200 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col my-auto border border-slate-300 overflow-hidden">
        {/* Top Screen Action Bar (Hidden during printing) */}
        <div className="bg-slate-900 text-white px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2.5 no-print border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-blue-400" />
            <span className="text-xs font-black uppercase tracking-wider">
              A4 Voucher ({data.voucherNo})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={downloadingPdf || printingPdf}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition"
              title="Download official A4 PDF"
            >
              <Download size={14} />
              {downloadingPdf ? 'Downloading...' : 'PDF'}
            </button>
            <button
              onClick={handlePrint}
              disabled={downloadingPdf || printingPdf}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition"
              title="Print exact PDF voucher"
            >
              <Printer size={14} />
              {printingPdf ? 'Printing...' : 'Print'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable A4 Document Sheet */}
        <div className="p-4 sm:p-8 bg-slate-300 flex justify-center overflow-x-auto">
          <div
            id="printable-voucher-area"
            className="printable-a4-voucher bg-white text-slate-900 p-8 shadow-2xl rounded-none w-[210mm] min-h-[297mm] mx-auto flex flex-col justify-between border border-slate-300"
            style={{ width: '210mm', minHeight: '290mm', boxSizing: 'border-box' }}
          >
            {/* Upper Content Section */}
            <div className="space-y-5">
              {/* 1. Pixx Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
                <div className="flex items-center gap-4">
                  <img
                    src={pixxLogo}
                    alt="Pixx Technologies Logo"
                    className="h-14 w-auto object-contain"
                  />
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                      PIXX TECHNOLOGIES
                    </h1>
                    <p className="text-[11px] font-bold text-slate-600">
                      Basement Office 4C, Chanbeli Block, Bahria Town Lahore
                    </p>
                    <p className="text-[11px] font-bold text-slate-600">
                      Phone: <span className="font-mono">0345 9028996</span> &bull; Financial Management Systems
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">
                    Official Company Voucher
                  </div>
                  <div className="text-xs font-mono font-black text-blue-900 bg-blue-50 px-2.5 py-1 rounded border border-blue-200 mt-1 inline-block">
                    Voucher #: {data.voucherNo}
                  </div>
                </div>
              </div>

              {/* 2. Document Title & Verification Banner */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-300">
                <div>
                  <h2 className="text-sm font-black tracking-wide text-slate-900 uppercase">
                    {data.documentTitle || (isRent ? 'RENT RECEIPT / VOUCHER' : 'EXPENSE VOUCHER')}
                  </h2>
                  <div className="text-[10px] font-semibold text-slate-500">
                    Transaction Date: <strong className="text-slate-900 font-mono">{data.date ? new Date(data.date).toLocaleDateString('en-GB') : '-'}</strong>
                  </div>
                </div>

                {isPending ? (
                  <div className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1 rounded text-xs font-black uppercase">
                    <AlertTriangle size={14} className="text-amber-700" />
                    PENDING VERIFICATION
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-emerald-100 border border-emerald-300 text-emerald-900 px-3 py-1 rounded text-xs font-black uppercase">
                    <CheckCircle2 size={14} className="text-emerald-700" />
                    POSTED &amp; VERIFIED
                  </div>
                )}
              </div>

              {/* 3. Expense Classification & Information Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Left Card: Core Classification */}
                <div className="bg-slate-50 border border-slate-300 rounded-lg p-3 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 pb-1">
                    Classification &amp; Location
                  </div>

                  {!isRent && (
                    <div>
                      <span className="text-slate-500 font-semibold">Expense Classification: </span>
                      <span className="font-bold text-slate-900">
                        {data.expenseClassification === 'UNIT_EXPENSE'
                          ? 'Unit Expense'
                          : data.expenseClassification === 'PROPERTY_OWN_EXPENSE'
                          ? 'Property Own Expense'
                          : 'General Expense'}
                      </span>
                    </div>
                  )}

                  {data.property?.name && (
                    <div>
                      <span className="text-slate-500 font-semibold">Property / Plaza: </span>
                      <strong className="text-slate-900">{data.property.name}</strong>
                      {data.property.code ? <span className="font-mono text-slate-600"> ({data.property.code})</span> : ''}
                    </div>
                  )}

                  {data.unit?.name && (
                    <div>
                      <span className="text-slate-500 font-semibold">Unit / Shop: </span>
                      <strong className="text-slate-900">{data.unit.name}</strong>
                    </div>
                  )}

                  {data.tenant?.name && (
                    <div>
                      <span className="text-slate-500 font-semibold">Tenant Name: </span>
                      <strong className="text-slate-900">{data.tenant.name}</strong>
                    </div>
                  )}

                  {data.rentMonth && (
                    <div>
                      <span className="text-slate-500 font-semibold">Rent Billing Month: </span>
                      <strong className="text-blue-900 font-mono">{data.rentMonth}</strong>
                    </div>
                  )}
                </div>

                {/* Right Card: Payment Accounts & Audit info */}
                <div className="bg-slate-50 border border-slate-300 rounded-lg p-3 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 pb-1">
                    Accounting &amp; Payment Accounts
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold">Category Head: </span>
                    <strong className="text-slate-900">{data.category?.name || 'General'}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold">Debit Account (Dr.): </span>
                    <strong className="text-slate-900">{data.drAccount?.name || '-'}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold">Credit Account (Cr.): </span>
                    <strong className="text-slate-900">{data.crAccount?.name || '-'}</strong>
                  </div>

                  {data.reference && (
                    <div>
                      <span className="text-slate-500 font-semibold">Cheque / Reference: </span>
                      <strong className="font-mono text-slate-900">{data.reference}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Transaction Narration */}
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                  Transaction Detail / Narration
                </div>
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 leading-relaxed">
                  {data.detail || 'N/A'}
                </div>
              </div>

              {/* 5. Double-Entry Accounting Table */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-800 uppercase font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-2.5">Account Head / Description</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5 text-right">Debit (Dr.)</th>
                      <th className="p-2.5 text-right">Credit (Cr.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold text-slate-900">
                    <tr>
                      <td className="p-2.5">{data.drAccount?.name || data.category?.name || 'Expense/Asset'}</td>
                      <td className="p-2.5">{data.category?.name || 'General'}</td>
                      <td className="p-2.5 text-right font-mono font-bold">{formatPKR(data.amount)}</td>
                      <td className="p-2.5 text-right font-mono text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">{data.crAccount?.name || 'Payment Account'}</td>
                      <td className="p-2.5">{data.category?.name || 'General'}</td>
                      <td className="p-2.5 text-right font-mono text-slate-400">-</td>
                      <td className="p-2.5 text-right font-mono font-bold">{formatPKR(data.amount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 6. Prominent Total Amount Banner */}
              <div className="bg-slate-50 border-2 border-slate-900 text-slate-900 p-3.5 rounded-lg flex items-center justify-between shadow-xs">
                <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                  TOTAL AMOUNT {isRent ? 'RECEIVED' : 'PAID'}
                </span>
                <span className="text-2xl font-black font-mono tracking-tight text-slate-900">
                  {formatPKR(data.amount)}
                </span>
              </div>
            </div>

            {/* Bottom Content Section: Signatures & Footer */}
            <div className="pt-6 space-y-4 border-t border-slate-300">
              {/* Official Signatures Row */}
              <div className="grid grid-cols-2 gap-8 border border-slate-300 rounded-lg p-4 bg-slate-50">
                {/* Prepared By (Sarfraz) */}
                <div className="text-center space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-300 pb-1 mb-2">
                    Prepared By
                  </div>
                  <img
                    src={sarfrazSign}
                    alt="Sarfraz Signature"
                    className="h-12 mx-auto object-contain"
                  />
                  <div className="text-xs font-black text-slate-900 mt-1">Sarfraz</div>
                  <div className="text-[10px] text-slate-500 font-semibold">Data Entry &amp; Operations</div>
                </div>

                {/* Checked By (Khurshid Anwar) */}
                <div className="text-center space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-300 pb-1 mb-2">
                    Checked &amp; Approved By
                  </div>
                  <img
                    src={khurshidSign}
                    alt="Khurshid Anwar Signature"
                    className="h-12 mx-auto object-contain"
                  />
                  <div className="text-xs font-black text-slate-900 mt-1">Khurshid Anwar</div>
                  <div className="text-[10px] text-slate-500 font-semibold">Financial Auditor &amp; Manager</div>
                </div>
              </div>

              {/* Document Footer */}
              <div className="text-center text-[10px] font-semibold text-slate-500 pt-1">
                Pixx Technologies Financial Systems &bull; System Printed Document &bull; Generated on {new Date().toLocaleString('en-GB')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* A4 Media Print CSS Override */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 10mm;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-size: 10pt !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Hide modal backdrop, navigation and screen controls */
          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          /* Force printable voucher to top left of print page */
          #printable-voucher-area,
          .printable-a4-voucher {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            max-width: 210mm !important;
            height: 100vh !important;
            min-height: 270mm !important;
            margin: 0 !important;
            padding: 6mm !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 999999 !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }

          .printable-a4-voucher,
          .printable-a4-voucher * {
            visibility: visible !important;
          .printable-a4-voucher span,
          .printable-a4-voucher div,
          .printable-a4-voucher strong,
          .printable-a4-voucher td,
          .printable-a4-voucher th {
            color: #000000 !important;
          }

          /* Total Banner high contrast print styling */
          .printable-a4-voucher .bg-slate-50 {
            background-color: #f8fafc !important;
            border: 2px solid #000000 !important;
          }

          .printable-a4-voucher .bg-slate-50 *,
          .printable-a4-voucher .bg-slate-50 span {
            color: #000000 !important;
          }

          /* High contrast solid borders */
          .printable-a4-voucher .border,
          .printable-a4-voucher .border-b,
          .printable-a4-voucher .border-t,
          .printable-a4-voucher .border-b-2,
          .printable-a4-voucher .border-slate-300,
          .printable-a4-voucher .border-slate-200 {
            border-color: #000000 !important;
          }

          .printable-a4-voucher table {
            border: 1px solid #000000 !important;
            border-collapse: collapse !important;
          }

          .printable-a4-voucher th,
          .printable-a4-voucher td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
          }

          .printable-a4-voucher .bg-slate-50,
          .printable-a4-voucher .bg-slate-100 {
            background-color: #f8fafc !important;
            border-color: #000000 !important;
          }
        }
      `}</style>
    </div>
  );
}

export default SingleVoucherPrintModal;
