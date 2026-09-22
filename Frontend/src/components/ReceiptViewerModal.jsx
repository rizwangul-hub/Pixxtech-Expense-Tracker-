import React, { useState } from 'react';
import {
  X,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  FileText,
  Calendar,
  DollarSign,
  User,
  CheckCircle2,
  Building2,
  Printer,
  Sparkles,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { formatPKR, formatDate } from '../utils/formatters.js';
import {
  downloadReceiptImage,
  downloadAllReceipts,
  downloadReceiptEvidenceDocument,
  downloadReceiptEvidenceImage,
  printReceiptEvidenceSlip,
  extractReceiptMetadata,
} from '../utils/downloadReceipt.js';

export function ReceiptViewerModal({ entry, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadType, setDownloadType] = useState('');

  if (!entry) return null;

  const meta = extractReceiptMetadata(entry);
  const attachments = meta.attachments || [];

  if (attachments.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl">
          <ImageIcon size={36} className="mx-auto text-slate-500" />
          <h3 className="text-sm font-bold text-white">No Receipt Images Attached</h3>
          <p className="text-xs text-slate-400">
            This entry was recorded without purchase or receipt image attachments.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const currentItem = attachments[currentIndex] || attachments[0];

  // Handler for full evidence document download (PDF with fallback to Image)
  const handleDownloadFullDocument = async () => {
    try {
      setDownloading(true);
      setDownloadType('pdf');
      await downloadReceiptEvidenceDocument(entry);
    } catch (err) {
      console.error('Download document error:', err);
    } finally {
      setDownloading(false);
      setDownloadType('');
    }
  };

  // Handler for high-res formatted image slip (.jpg)
  const handleDownloadImageSlip = async () => {
    try {
      setDownloading(true);
      setDownloadType('image');
      await downloadReceiptEvidenceImage(entry, currentIndex);
    } catch (err) {
      console.error('Download image slip error:', err);
    } finally {
      setDownloading(false);
      setDownloadType('');
    }
  };

  // Handler to print the receipt slip immediately
  const handlePrintSlip = () => {
    printReceiptEvidenceSlip(entry, currentIndex);
  };

  // Handler for raw original photo download
  const handleDownloadRawPhoto = async () => {
    try {
      setDownloading(true);
      setDownloadType('raw');
      const filename = currentItem.originalName || `Receipt_VN${meta.vNo}_${currentIndex + 1}.jpg`;
      await downloadReceiptImage(currentItem.url, filename);
    } finally {
      setDownloading(false);
      setDownloadType('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[96vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Screen Action Bar */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-blue-950/90 border border-blue-800/60 text-blue-400 shrink-0">
              <ImageIcon size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-white text-sm truncate">
                  Purchase / Receipt Evidence
                </h3>
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded">
                  VN: #{meta.vNo}
                </span>
                {attachments.length > 1 && (
                  <span className="text-[11px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                    Photo {currentIndex + 1} of {attachments.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handleDownloadFullDocument}
              disabled={downloading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              title="Download official A4 PDF with top voucher details + receipt image"
            >
              <Download size={13} className={downloading && downloadType === 'pdf' ? 'animate-bounce' : ''} />
              <span>{downloading && downloadType === 'pdf' ? 'Generating...' : 'Download PDF Slip'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadImageSlip}
              disabled={downloading}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 hidden sm:flex"
              title="Download formatted receipt slip as JPEG Image"
            >
              <Download size={13} className={downloading && downloadType === 'image' ? 'animate-bounce' : ''} />
              <span>Download Image (.jpg)</span>
            </button>

            <button
              type="button"
              onClick={handlePrintSlip}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
              title="Print receipt evidence slip or save as PDF"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 bg-slate-950/50">

          {/* TOP SECTION: Formatted Voucher & Transaction Evidence Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            {/* Header row with Status & Date */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  PIXX TECHNOLOGIES &bull; OFFICIAL RECEIPT EVIDENCE SLIP
                </div>
                <div className="text-xs font-bold text-white mt-0.5">
                  Voucher Number: <span className="font-mono text-amber-400">#{meta.vNo}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {meta.isVerified ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                    <CheckCircle2 size={12} />
                    <span>Verified &amp; Posted</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950/80 text-amber-300 border border-amber-700/60">
                    <Clock size={12} />
                    <span>Pending Verification</span>
                  </span>
                )}
              </div>
            </div>

            {/* 2-Column Metadata Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Left Column: Submission & Location */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800 pb-1">
                  Submission &amp; Location
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Transaction Date:</span>
                  <span className="text-white font-bold font-mono">{meta.dateStr}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Submitted By:</span>
                  <span className="text-white font-bold">{meta.submitter}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Property / Unit:</span>
                  <span className="text-blue-300 font-bold text-right truncate max-w-[200px]" title={meta.propertyName}>
                    {meta.propertyName || 'N/A'} {meta.unitName ? `(${meta.unitName})` : ''}
                  </span>
                </div>
                {meta.tenantName && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Tenant Name:</span>
                    <span className="text-white font-semibold">{meta.tenantName}</span>
                  </div>
                )}
                {meta.rentMonth && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Billing Month:</span>
                    <span className="text-indigo-300 font-mono font-bold">{meta.rentMonth}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Accounts Involved & Category */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800 pb-1">
                  Accounts Involved &amp; Head
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Category Head:</span>
                  <span className="text-amber-300 font-bold">{meta.categoryName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-semibold">Debit Account (Dr):</span>
                  <span className="text-slate-200 font-bold text-right truncate max-w-[190px]" title={meta.drAccount}>
                    {meta.drAccount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-rose-400 font-semibold">Credit Account (Cr):</span>
                  <span className="text-slate-200 font-bold text-right truncate max-w-[190px]" title={meta.crAccount}>
                    {meta.crAccount}
                  </span>
                </div>
                {meta.referenceNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Cheque / Reference:</span>
                    <span className="text-white font-mono">{meta.referenceNumber}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Narration Box */}
            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                Narration / Details:
              </span>
              <p className="text-slate-200 font-medium leading-relaxed">
                {meta.narration}
              </p>
            </div>

            {/* Total Amount Highlight Banner */}
            <div className="p-3 bg-gradient-to-r from-slate-950 to-slate-900 border border-emerald-500/30 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
                  Total Voucher Amount
                </span>
                <span className="text-xs text-slate-500">Official verified payable / receivable amount</span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                {meta.amountStr}
              </div>
            </div>
          </div>

          {/* DOWN SECTION: The Receipt Picture */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-bold text-blue-300 flex items-center gap-1.5">
                <ImageIcon size={14} />
                Attached Purchase / Receipt Picture ({currentIndex + 1} of {attachments.length})
              </span>
              <span className="text-[11px] text-slate-400">
                {currentItem.originalName || 'Receipt Photo'}
              </span>
            </div>

            {/* Image Viewer Frame */}
            <div className="min-h-[300px] max-h-[60vh] bg-black/60 p-4 flex items-center justify-center relative overflow-hidden">
              {/* Prev / Next buttons if multiple */}
              {attachments.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : attachments.length - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 shadow-lg transition"
                    title="Previous receipt image"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => (prev < attachments.length - 1 ? prev + 1 : 0))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 shadow-lg transition"
                    title="Next receipt image"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {/* Centered Receipt Image */}
              <img
                src={currentItem.url}
                alt={currentItem.originalName || 'Receipt'}
                className="max-h-[55vh] max-w-full object-contain rounded-lg border border-slate-800 shadow-2xl select-none"
              />
            </div>

            {/* Multiple Thumbnails Strip */}
            {attachments.length > 1 && (
              <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  All Receipts:
                </span>
                {attachments.map((att, idx) => (
                  <button
                    key={att.url + idx}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative rounded-lg overflow-hidden border-2 transition shrink-0 ${
                      currentIndex === idx
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                        : 'border-slate-800 hover:border-slate-600 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={att.url}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-12 h-12 object-cover"
                    />
                    <span className="absolute bottom-0 right-0 bg-black/80 text-[9px] font-mono text-white px-1">
                      #{idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer: Action Buttons */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <a
              href={currentItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
              title="Open full image in browser tab"
            >
              <ExternalLink size={13} />
              <span>Open in New Tab</span>
            </a>

            <button
              type="button"
              onClick={handleDownloadRawPhoto}
              disabled={downloading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 disabled:opacity-50"
              title="Download original raw photo uploaded by Sarfraz"
            >
              <Download size={13} />
              <span>Original Photo</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadImageSlip}
              disabled={downloading}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition disabled:opacity-50"
              title="Download image with top details and bottom receipt photo"
            >
              <Download size={13} />
              <span>Download Image Slip</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadFullDocument}
              disabled={downloading}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition disabled:opacity-50"
              title="Download official PDF document"
            >
              <Download size={13} className={downloading && downloadType === 'pdf' ? 'animate-bounce' : ''} />
              <span>{downloading && downloadType === 'pdf' ? 'Preparing PDF...' : 'Download Full PDF Slip'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReceiptViewerModal;
