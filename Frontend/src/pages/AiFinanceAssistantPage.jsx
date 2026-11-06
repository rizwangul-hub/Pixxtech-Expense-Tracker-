import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Trash2,
  RefreshCw,
  TrendingUp,
  Receipt,
  Landmark,
  Building2,
  AlertTriangle,
  ArrowRight,
  Bot,
  User,
  Check,
  Copy,
  ChevronRight,
  ShieldCheck,
  Clock,
  X,
  Wallet,
  CheckCircle2,
  XCircle,
  Download,
  FileText,
} from 'lucide-react';
import { aiAPI } from '../services/api.js';

const SUGGESTED_QUESTIONS = [
  { text: 'Give me Bank Al Falah ledger in PDF', icon: Landmark, tag: 'PDF' },
  { text: 'Rizwan Ullah complete salary ledger in PDF', icon: User, tag: 'PDF' },
  { text: 'Generate October 2026 Profit & Loss report in PDF', icon: TrendingUp, tag: 'PDF' },
  { text: 'Attendance report for all employees in PDF', icon: Clock, tag: 'PDF' },
  { text: 'Total expenses this month', icon: Receipt, tag: 'Expenses' },
  { text: 'Rent collected this month', icon: TrendingUp, tag: 'Rental' },
  { text: 'What is the total balance of our accounts?', icon: Landmark, tag: 'Liquidity' },
  { text: 'Collect Rs. 25,000 rent from Flat 4 in UBL', icon: Wallet, tag: 'Operations' },
  { text: 'Record Rs. 5,000 electricity expense under Electricity', icon: Receipt, tag: 'Operations' },
  { text: 'Show me the latest transactions', icon: Clock, tag: 'Ledger' },
];

/**
 * Lightweight, robust Markdown Renderer for AI responses
 * Handles headers, bold text, bullet lists, blockquotes, and Markdown tables
 */
function MarkdownRenderer({ content }) {
  if (!content || typeof content !== 'string') return null;

  const lines = content.split('\n');
  const elements = [];
  let currentTable = null;
  let currentList = null;

  const flushTable = () => {
    if (currentTable && Array.isArray(currentTable.rows) && currentTable.rows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-3 overflow-x-auto rounded-lg border border-slate-700/80 shadow-md">
          <table className="w-full text-left text-xs border-collapse">
            {currentTable.headers && (
              <thead className="bg-slate-900 text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-700">
                <tr>
                  {currentTable.headers.map((h, i) => (
                    <th key={i} className="py-2.5 px-3.5 whitespace-nowrap border-r border-slate-800 last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-slate-800 bg-slate-950/60 font-mono">
              {currentTable.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/40 transition">
                  {Array.isArray(row) && row.map((cell, cIdx) => {
                    const isNumeric = /^(PKR|Rs\.?|\d|[+\-,.])/i.test(String(cell || '').trim());
                    return (
                      <td
                        key={cIdx}
                        className={`py-2 px-3.5 text-slate-300 border-r border-slate-800/60 last:border-r-0 whitespace-nowrap ${
                          isNumeric ? 'font-medium' : 'font-sans'
                        }`}
                      >
                        {formatInlineMarkdown(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      currentTable = null;
    }
  };

  const flushList = () => {
    if (currentList && Array.isArray(currentList) && currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-4 list-disc text-slate-300 text-sm">
          {currentList.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {formatInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      currentList = null;
    }
  };

  for (let i = 0; i < (lines?.length || 0); i++) {
    const rawLine = lines[i];
    const line = String(rawLine || '').trim();

    // Markdown Table Detection
    if (line.startsWith('|') && line.endsWith('|')) {
      flushList();
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        continue;
      }

      if (!currentTable) {
        currentTable = { headers: cells, rows: [] };
      } else {
        currentTable.rows.push(cells);
      }
      continue;
    } else {
      flushTable();
    }

    // Markdown Bullet List
    if (/^[-*•]\s+/.test(line)) {
      if (!currentList) currentList = [];
      currentList.push(line.replace(/^[-*•]\s+/, ''));
      continue;
    } else {
      flushList();
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-base font-bold text-white mt-4 mb-1.5 flex items-center gap-1.5 border-b border-slate-800/80 pb-1">
          {formatInlineMarkdown(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold text-indigo-300 mt-3 mb-1">
          {formatInlineMarkdown(line.slice(5))}
        </h4>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-white mt-5 mb-2">
          {formatInlineMarkdown(line.slice(3))}
        </h2>
      );
      continue;
    }

    // Empty Lines
    if (!line) {
      elements.push(<div key={i} className="h-1.5" />);
      continue;
    }

    // Standard Paragraph
    elements.push(
      <p key={i} className="text-slate-300 text-sm leading-relaxed my-1">
        {formatInlineMarkdown(line)}
      </p>
    );
  }

  flushTable();
  flushList();

  return <div className="space-y-1">{elements}</div>;
}

/**
 * Format inline bold **text**, `code`, and highlighting
 */
function formatInlineMarkdown(text = '') {
  const parts = String(text || '').split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      const isAmount = /PKR|Rs\.?|\d+/i.test(inner);
      return (
        <strong key={index} className={`font-bold ${isAmount ? 'text-emerald-400' : 'text-white'}`}>
          {inner}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 text-xs font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/**
 * Downloadable PDF Report Card Component
 */
function PdfDownloadCard({ report, onDownload, downloading }) {
  if (!report) return null;
  const { title, fileName, fileSize, period } = report;

  return (
    <div className="mt-3.5 rounded-xl border border-rose-500/30 bg-gradient-to-r from-slate-900 via-rose-950/20 to-slate-900 p-4 shadow-xl transition-all hover:border-rose-500/50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-red-500 flex items-center justify-center text-white shadow-lg shadow-rose-900/30 flex-shrink-0 mt-0.5">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white tracking-wide">
                {title || 'Financial Report Statement'}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase font-mono">
                PDF
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              {fileName || 'Report.pdf'}{fileSize ? ` • ${fileSize}` : ''}{period ? ` • ${period}` : ''}
            </p>
          </div>
        </div>

        <button
          onClick={() => onDownload(report)}
          disabled={downloading}
          className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-rose-950/40 flex items-center justify-center gap-2 transition disabled:opacity-50 flex-shrink-0"
        >
          {downloading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Downloading...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Interactive Two-Step Confirmation Card for Staged Operations
 */
function TransactionConfirmationCard({
  action,
  status,
  confirmationResult,
  onConfirm,
  onCancel,
  disabled,
}) {
  if (!action || !action.summary) return null;
  const { summary, actionId } = action;

  const isConfirmed = status === 'confirmed';
  const isCancelled = status === 'cancelled';
  const isConfirming = status === 'confirming';
  const isCancelling = status === 'cancelling';

  return (
    <div
      className={`mt-3.5 rounded-xl border p-4 shadow-xl transition-all ${
        isConfirmed
          ? 'bg-emerald-950/30 border-emerald-500/40'
          : isCancelled
          ? 'bg-slate-900/60 border-slate-700/60 opacity-60'
          : 'bg-gradient-to-b from-slate-900 to-slate-950 border-amber-500/50 ring-1 ring-amber-500/20'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {isConfirmed ? (
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : isCancelled ? (
            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
              <XCircle className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 animate-pulse">
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}
          <div>
            <span className="text-xs font-bold text-white uppercase tracking-wider block">
              {summary.type || 'Transaction Confirmation'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {isConfirmed
                ? 'Successfully Saved in Ledger'
                : isCancelled
                ? 'Discarded — No Changes Made'
                : 'Pending User Confirmation'}
            </span>
          </div>
        </div>

        {summary.voucherPreview && (
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
            {isConfirmed && confirmationResult?.voucherNo
              ? confirmationResult.voucherNo
              : summary.voucherPreview}
          </span>
        )}
      </div>

      {/* Structured Key-Value Table */}
      <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {summary.amount !== undefined && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Amount</span>
            <span className="text-base font-bold text-emerald-400 font-mono">
              Rs. {Number(summary.amount).toLocaleString('en-PK')}
            </span>
          </div>
        )}

        {summary.account && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Account</span>
            <span className="font-medium text-slate-200">{summary.account}</span>
          </div>
        )}

        {summary.fromAccount && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">From Account</span>
            <span className="font-medium text-slate-200">{summary.fromAccount}</span>
          </div>
        )}

        {summary.toAccount && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">To Account</span>
            <span className="font-medium text-slate-200">{summary.toAccount}</span>
          </div>
        )}

        {summary.property && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Property / Unit</span>
            <span className="font-medium text-slate-200">{summary.property}</span>
          </div>
        )}

        {summary.tenant && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Tenant</span>
            <span className="font-medium text-slate-200">{summary.tenant}</span>
          </div>
        )}

        {summary.employee && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Employee</span>
            <span className="font-medium text-slate-200">{summary.employee}</span>
          </div>
        )}

        {summary.category && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Expense Head</span>
            <span className="font-medium text-slate-200">{summary.category}</span>
          </div>
        )}

        {summary.rentMonth && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Rent Month</span>
            <span className="font-medium text-slate-200">{summary.rentMonth}</span>
          </div>
        )}

        {summary.date && (
          <div className="flex flex-col bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Date</span>
            <span className="font-medium text-slate-200">{summary.date}</span>
          </div>
        )}
      </div>

      {/* Confirmed Banner */}
      {isConfirmed && (
        <div className="mt-2 p-3 bg-emerald-900/30 border border-emerald-500/40 rounded-lg flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              {confirmationResult?.message || 'Transaction successfully executed and saved in the ledger.'}
            </span>
          </div>
          {confirmationResult?.isPending && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Pending Review
            </span>
          )}
        </div>
      )}

      {/* Cancelled Banner */}
      {isCancelled && (
        <div className="mt-2 p-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-400 flex items-center gap-2">
          <X className="w-3.5 h-3.5" />
          <span>This transaction proposal was discarded. No changes were made to the database.</span>
        </div>
      )}

      {/* Interactive Action Buttons */}
      {!isConfirmed && !isCancelled && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-amber-300/80">
            ⚠️ Review details carefully before saving.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCancel(actionId)}
              disabled={disabled || isConfirming || isCancelling}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel'}
            </button>
            <button
              onClick={() => onConfirm(actionId)}
              disabled={disabled || isConfirming || isCancelling}
              className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {isConfirming ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm & Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AiFinanceAssistantPage({
  currentUser,
  messages: propMessages,
  setMessages: propSetMessages,
}) {
  const [internalMessages, setInternalMessages] = useState([]);
  const messages = Array.isArray(propMessages) ? propMessages : internalMessages;
  const setMessages = typeof propSetMessages === 'function' ? propSetMessages : setInternalMessages;

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [conversationContext, setConversationContext] = useState({ conversationId: null, contextToken: null });
  const [actionStates, setActionStates] = useState({});
  const [actionLoadingStates, setActionLoadingStates] = useState({});
  const [downloadingReports, setDownloadingReports] = useState({});

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    try {
      sessionStorage.removeItem('pixx_ai_finance_chat');
    } catch {}
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, actionStates, downloadingReports]);

  // Fetch AI status on mount
  useEffect(() => {
    aiAPI
      .getStatus()
      .then((res) => setAiStatus(res))
      .catch(() => {});
  }, []);

  const handleDownloadPdf = async (report) => {
    if (!report?.downloadUrl || downloadingReports[report.downloadUrl]) return;
    setDownloadingReports((prev) => ({ ...prev, [report.downloadUrl]: true }));
    try {
      const blob = await aiAPI.downloadReport(report.downloadUrl);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', report.fileName || 'Report.pdf');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Download PDF Error]:', err);
      setError('Failed to download PDF report. Please try again.');
    } finally {
      setDownloadingReports((prev) => ({ ...prev, [report.downloadUrl]: false }));
    }
  };

  const handleConfirmPendingAction = async (actionId) => {
    if (!actionId || loading) return;
    setActionLoadingStates((prev) => ({ ...prev, [actionId]: 'confirming' }));
    try {
      const result = await aiAPI.confirmAction(actionId);
      setActionStates((prev) => ({
        ...prev,
        [actionId]: {
          status: 'confirmed',
          result,
        },
      }));

      const celebrationMsg = {
        id: `ai-confirm-${Date.now()}`,
        role: 'assistant',
        content: `🎉 **${result.message}**\n\n- **Voucher #**: \`${result.voucherNo}\`\n- **Status**: ${
          result.isPending
            ? '⚠️ Staged as Temporary Pending Entry (Awaiting Manager Review)'
            : '✅ Verified Journal Entry Posted'
        }\n- **Timestamp**: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        engine: 'atomic-operations-engine',
      };
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), celebrationMsg].slice(-40));
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to confirm transaction.';
      setError(errMsg);
      setActionStates((prev) => ({
        ...prev,
        [actionId]: {
          status: 'error',
          error: errMsg,
        },
      }));
    } finally {
      setActionLoadingStates((prev) => ({ ...prev, [actionId]: null }));
    }
  };

  const handleCancelPendingAction = async (actionId) => {
    if (!actionId || loading) return;
    setActionLoadingStates((prev) => ({ ...prev, [actionId]: 'cancelling' }));
    try {
      await aiAPI.cancelAction(actionId);
      setActionStates((prev) => ({
        ...prev,
        [actionId]: {
          status: 'cancelled',
        },
      }));
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to cancel proposal.';
      setError(errMsg);
    } finally {
      setActionLoadingStates((prev) => ({ ...prev, [actionId]: null }));
    }
  };

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    setError(null);
    setInput('');

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...(Array.isArray(prev) ? prev : []), userMessage].slice(-40));
    setLoading(true);

    try {
      const historyPayload = (Array.isArray(messages) ? messages : [])
        .filter((m) => m && m.role === 'user')
        .slice(-6)
        .map((m) => ({ role: 'user', content: m.content }));

      const controller = new AbortController();
      requestRef.current = controller;
      const response = await aiAPI.chat(
        query,
        historyPayload,
        controller.signal,
        conversationContext.contextToken ? conversationContext : {}
      );
      if (controller.signal.aborted) return;
      if (response.conversationId && response.contextToken) {
        setConversationContext({
          conversationId: response.conversationId,
          contextToken: response.contextToken,
        });
      }

      const assistantMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.message || 'No response returned.',
        pendingAction: response.pendingAction || null,
        pdfReport: response.pdfReport || null,
        confirmed: response.confirmed || false,
        voucherNo: response.voucherNo || null,
        isPending: response.isPending || false,
        toolCalls: response.toolCalls || [],
        engine: response.engine || 'ai-assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), assistantMessage].slice(-40));
    } catch (err) {
      if (requestRef.current?.signal.aborted) return;
      const errMsg = err.response?.data?.message || err.message || 'Unable to connect to AI Finance Assistant.';
      setError(errMsg);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleClearChat = () => {
    if (loading) return;
    const initial = [
      {
        id: 'welcome',
        role: 'assistant',
        content: `Conversation cleared. How can I help you analyze your financial records, generate PDF reports, or enter transactions?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        engine: 'central-ledger',
      },
    ];
    setMessages(initial);
    setConversationContext({ conversationId: null, contextToken: null });
    setActionStates({});
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const safeMessageList = Array.isArray(messages) ? messages : [];

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] bg-slate-950 text-slate-100 font-sans">
      {/* Top Header Bar */}
      <header className="flex-shrink-0 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">Pixx AI Finance Assistant</h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {aiStatus?.enabled && aiStatus?.hasApiKey ? 'Ready for queries, PDFs & entries' : 'Setup required'}
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Intelligent accounting assistant querying live records, generating official PDF reports & recording confirmed transactions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {aiStatus?.model && (
            <span className="text-xs text-slate-400 font-mono hidden md:inline px-2.5 py-1 bg-slate-800 rounded-lg border border-slate-700">
              {aiStatus.model}
            </span>
          )}
          <button
            onClick={handleClearChat}
            title="Clear Chat Session"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-700/50 rounded-lg transition"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-400" />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>
        </div>
      </header>

      {/* Suggested Quick Question & PDF Chips */}
      <div className="flex-shrink-0 bg-slate-900/50 border-b border-slate-800/60 px-4 py-2 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 min-w-max">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mr-1">
            <Bot className="w-3.5 h-3.5 text-indigo-400" /> Quick Prompts:
          </span>
          {SUGGESTED_QUESTIONS.map((q, idx) => {
            const Icon = q.icon;
            return (
              <button
                key={idx}
                onClick={() => handleSendMessage(q.text)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/70 hover:bg-indigo-900/40 border border-slate-700/60 hover:border-indigo-500/50 rounded-full text-xs text-slate-200 hover:text-white transition disabled:opacity-50"
              >
                <Icon className="w-3 h-3 text-indigo-400" />
                <span>{q.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Finance conversation"
        aria-busy={loading}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
      >
        {safeMessageList.length === 0 && (
          <p className="text-sm text-slate-400">
            Ask for instant financial figures or download official PDF reports (e.g. &ldquo;Give me Bank Al Falah ledger in PDF&rdquo; or &ldquo;October 2026 Profit &amp; Loss in PDF&rdquo;). All PDF documents feature PIXX Technologies branding, verified figures, and one-click downloads.
          </p>
        )}
        {safeMessageList.map((m) => {
          if (!m) return null;
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id || `msg-${Math.random()}`}
              className={`flex gap-3 max-w-4xl ${isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex-shrink-0 flex items-center justify-center shadow-md">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              )}

              <div
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full sm:max-w-[85%]`}
              >
                <div
                  className={`rounded-2xl px-4 py-3 shadow-lg relative group ${
                    isUser
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-tr-none'
                      : 'bg-slate-900 border border-slate-800/80 text-slate-200 rounded-tl-none'
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <div>
                      <MarkdownRenderer content={m.content} />

                      {/* Downloadable PDF Card if PDF was generated */}
                      {m.pdfReport && (
                        <PdfDownloadCard
                          report={m.pdfReport}
                          onDownload={handleDownloadPdf}
                          downloading={Boolean(downloadingReports[m.pdfReport.downloadUrl])}
                        />
                      )}

                      {/* Interactive Confirmation Card if proposal is pending */}
                      {m.pendingAction && (
                        <TransactionConfirmationCard
                          action={m.pendingAction}
                          status={actionStates[m.pendingAction.actionId]?.status || 'pending'}
                          confirmationResult={actionStates[m.pendingAction.actionId]?.result}
                          onConfirm={handleConfirmPendingAction}
                          onCancel={handleCancelPendingAction}
                          disabled={loading}
                        />
                      )}

                      {/* Tool Calls transparency badge */}
                      {Array.isArray(m.toolCalls) && m.toolCalls.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Calculated via: {m.toolCalls.map((t) => t?.name || t).filter(Boolean).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Copy Button for Assistant */}
                  {!isUser && (
                    <button
                      onClick={() => handleCopy(m.id, m.content)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md transition"
                      title="Copy response"
                    >
                      {copiedId === m.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[10px] text-slate-500 font-mono">{m.timestamp}</span>
                  {!isUser && m.engine && (
                    <span className="text-[10px] text-indigo-400/80 font-mono flex items-center gap-1">
                      &bull; {m.engine}
                    </span>
                  )}
                </div>
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex-shrink-0 flex items-center justify-center border border-slate-700 text-xs font-bold text-slate-200 shadow-md">
                  {currentUser?.name?.slice(0, 2).toUpperCase() || 'ME'}
                </div>
              )}
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex gap-3 max-w-4xl mr-auto justify-start items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex-shrink-0 flex items-center justify-center animate-pulse shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-3 shadow-lg">
              <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
              <span className="text-xs text-slate-300 font-medium">
                Retrieving verified records & rendering PDF document...
              </span>
            </div>
          </div>
        )}

        {/* Error Callout */}
        {error && (
          <div className="bg-rose-950/40 border border-rose-800/80 text-rose-300 rounded-xl p-3 flex items-center justify-between text-xs max-w-2xl mx-auto shadow-md">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-bold ml-2 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      <div className="flex-shrink-0 p-3 sm:p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2 shadow-inner focus-within:border-indigo-500/70 transition"
        >
          <textarea
            aria-label="Your financial question, PDF request, or transaction instruction"
            maxLength={1500}
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question, request a PDF (e.g. 'Give me Bank Al Falah ledger in PDF'), or record a transaction..."
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none px-2 py-1.5 focus:outline-none min-h-[40px] max-h-32"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send</span>
              </>
            )}
          </button>
        </form>
        <p className="text-[11px] text-center text-slate-500 mt-2">
          Ask for any report in PDF format for instant, branded downloads. Press <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 font-mono">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 font-mono">Shift+Enter</kbd> for a new line.
        </p>
      </div>
    </div>
  );
}

export default AiFinanceAssistantPage;
