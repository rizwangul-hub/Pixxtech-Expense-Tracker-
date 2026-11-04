import React, { useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
import { aiAPI } from '../services/api.js';

/**
 * Reusable AI Narration Enhancement Button powered by Google Gemini
 */
export const AiNarrationButton = ({
  narration = '',
  onEnhanced,
  context = {},
  disabled = false,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error' | null
  const [statusMsg, setStatusMsg] = useState('');

  const handleEnhance = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (disabled || loading) return;

    try {
      setLoading(true);
      setStatus(null);
      setStatusMsg('');

      const res = await aiAPI.enhanceNarration(narration, context);

      if (res && res.enhanced) {
        onEnhanced(res.enhanced);
        setStatus('success');
        setStatusMsg(res.engine?.includes('gemini') ? 'Polished by Gemini AI!' : 'Polished with Smart Bookkeeping AI!');
        setTimeout(() => {
          setStatus(null);
          setStatusMsg('');
        }, 3500);
      } else {
        setStatus('error');
        setStatusMsg('Could not enhance narration.');
        setTimeout(() => setStatus(null), 3000);
      }
    } catch (err) {
      console.warn('AI Narration error:', err.message);
      setStatus('error');
      setStatusMsg(err.response?.data?.message || 'AI request failed');
      setTimeout(() => setStatus(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleEnhance}
        disabled={disabled || loading}
        title="Analyze and improve narration grammar, structure & clarity with Gemini AI"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 active:scale-95 transition-all shadow-xs border border-indigo-400/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
            <span>Gemini Analyzing...</span>
          </>
        ) : status === 'success' ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-200" />
            <span className="text-emerald-100">Polished!</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
            <span>Analyze with AI</span>
          </>
        )}
      </button>

      {statusMsg && (
        <span
          className={`text-[11px] font-semibold transition-all ${
            status === 'success' ? 'text-emerald-600 font-bold' : 'text-rose-600'
          }`}
        >
          {statusMsg}
        </span>
      )}
    </div>
  );
};

export default AiNarrationButton;
