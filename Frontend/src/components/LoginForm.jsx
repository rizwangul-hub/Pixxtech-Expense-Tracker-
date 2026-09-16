import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../services/api.js';
import logo from '../assets/image/logo.png';

export const LoginForm = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      const res = await authAPI.login(email, password);
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      onLoginSuccess(res.user);
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || 'Login failed. Please check credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-8 shadow-xl">
        <div className="text-center mb-8 flex flex-col items-center">
          <img
            src={logo}
            alt="Pixx Technologies Logo"
            className="h-24 w-auto object-contain mb-3 drop-shadow-sm"
          />
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Pixx Technologies
          </h1>
          <p className="text-sm font-semibold text-slate-600 mt-1">
            Property Funds & Expense Tracking System
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-snug">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 text-sm">
          <div>
            <label className="block text-slate-800 font-bold mb-1.5 uppercase tracking-wider text-xs">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. entry@pixxtechnologies.com"
                className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-3 py-3 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-800 font-bold mb-1.5 uppercase tracking-wider text-xs">
              Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-500 absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-11 py-3 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-3 top-3 p-0.5 text-slate-500 hover:text-slate-800 transition"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md transition flex items-center justify-center gap-2 text-base text-white-keep disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
            <ArrowRight className="w-5 h-5 text-white-keep" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
