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
} from 'lucide-react';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { downloadReceiptImage, downloadAllReceipts } from '../utils/downloadReceipt.js';

export function ReceiptViewerModal({ entry, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);

  if (!entry) return null;

  // Normalize attachments from entry.attachments or entry.entryData?.attachments
  const rawList =
    entry.attachments && entry.attachments.length > 0
      ? entry.attachments
      : entry.entryData?.attachments && entry.entryData.attachments.length > 0
      ? entry.entryData.attachments
      : [];

  const attachments = rawList
    .map((att, idx) => {
      if (typeof att === 'string') {
        return {
          url: att,
          originalName: `Receipt_${idx + 1}.jpg`,
        };
      }
      return {
        url: att?.url || '',
        publicId: att?.publicId || '',
        originalName: att?.originalName || `Receipt_${idx + 1}.jpg`,
        size: att?.size || 0,
        mimeType: att?.mimeType || 'image/jpeg',
      };
    })
    .filter((a) => Boolean(a.url));

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
  const voucherLabel = entry.voucherNo || entry.voucherNumber || 'Voucher';
  const submitterName = entry.submittedByName || entry.submittedBy?.name || 'Sarfraz';

  const handleDownloadCurrent = async () => {
    try {
      setDownloading(true);
      const ext = currentItem.url.split('.').pop().split(/[?#]/)[0] || 'jpg';
      const cleanExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'].includes(ext.toLowerCase()) ? ext : 'jpg';
      const filename = currentItem.originalName || `${voucherLabel}_Receipt_${currentIndex + 1}.${cleanExt}`;
      await downloadReceiptImage(currentItem.url, filename);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAll = async () => {
    try {
      setDownloading(true);
      await downloadAllReceipts(attachments, `${voucherLabel}_Receipt`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[95vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-blue-950/80 border border-blue-800/60 text-blue-400">
              <ImageIcon size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-white text-sm truncate">
                  Purchase / Receipt Evidence
                </h3>
                {entry.voucherNo && (
                  <span className="font-mono text-xs font-bold text-amber-400 bg-amber-950/70 border border-amber-800/60 px-2 py-0.5 rounded">
                    VN: #{entry.voucherNo}
                  </span>
                )}
                {attachments.length > 1 && (
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    {currentIndex + 1} of {attachments.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                Uploaded by <strong className="text-slate-200">{submitterName}</strong> &bull; Amount:{' '}
                <strong className="text-emerald-400 font-mono">{formatPKR(entry.amount)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadCurrent}
              disabled={downloading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              title="Download this image to your device"
            >
              <Download size={13} className={downloading ? 'animate-bounce' : ''} />
              <span className="hidden sm:inline">Download Receipt</span>
              <span className="sm:hidden">Download</span>
            </button>

            {attachments.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={downloading}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                title="Download all attached receipts"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Download All ({attachments.length})</span>
                <span className="sm:hidden">All ({attachments.length})</span>
              </button>
            )}

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

        {/* Modal Main Content: Image Display */}
        <div className="flex-1 min-h-[260px] max-h-[65vh] bg-slate-950/70 p-3 sm:p-5 flex items-center justify-center relative overflow-hidden">
          {/* Navigation Arrows (if multiple images) */}
          {attachments.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : attachments.length - 1))}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/80 shadow-lg backdrop-blur-xs transition"
                title="Previous receipt"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => (prev < attachments.length - 1 ? prev + 1 : 0))}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/80 shadow-lg backdrop-blur-xs transition"
                title="Next receipt"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          {/* Current Image */}
          <div className="max-w-full max-h-full flex flex-col items-center justify-center">
            <img
              src={currentItem.url}
              alt={currentItem.originalName || 'Receipt'}
              className="max-h-[58vh] max-w-full object-contain rounded-lg border border-slate-800 shadow-xl select-none"
            />
          </div>
        </div>

        {/* Multi-Image Thumbnails Strip */}
        {attachments.length > 1 && (
          <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
              Receipts:
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

        {/* Modal Footer: Metadata & Actions */}
        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shrink-0">
          <div className="space-y-0.5">
            <div className="font-semibold text-slate-200 line-clamp-1">
              {entry.detail || 'Purchase / Expense description'}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
              {entry.date && (
                <span>Date: <strong className="text-slate-300">{formatDate(entry.date)}</strong></span>
              )}
              {entry.categoryId?.name && (
                <span>Head: <strong className="text-amber-300">{entry.categoryId.name}</strong></span>
              )}
              {entry.propertyId?.plazaName && (
                <span>Property: <strong className="text-blue-300">{entry.propertyId.plazaName}</strong></span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={currentItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
              title="Open high-resolution image in new tab"
            >
              <ExternalLink size={13} />
              <span>Open in New Tab</span>
            </a>

            <button
              type="button"
              onClick={handleDownloadCurrent}
              disabled={downloading}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition disabled:opacity-50"
            >
              <Download size={13} className={downloading ? 'animate-bounce' : ''} />
              <span>Download File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReceiptViewerModal;
