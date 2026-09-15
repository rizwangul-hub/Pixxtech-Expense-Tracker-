import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Lock,
  Mail,
  User,
} from 'lucide-react';
import { usersAPI } from '../services/api.js';
import { formatDate, formatDateTime } from '../utils/formatters.js';

export function UserManager({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'DATA_ENTRY',
  });
  const [formErrors, setFormErrors] = useState({});

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await usersAPI.getUsers();
      if (res?.success) {
        setUsers(res.data || []);
      } else {
        setError(res?.message || 'Failed to fetch users.');
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      setError(err.response?.data?.message || 'Could not load users list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (user) => {
    if (user._id === currentUser?.id || user._id === currentUser?._id) {
      alert('Security Protection: You cannot deactivate your own account.');
      return;
    }

    const action = user.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} user '${user.name}'?`)) {
      return;
    }

    try {
      const res = await usersAPI.toggleUserStatus(user._id);
      if (res?.success) {
        setActionSuccess(res.message);
        fetchUsers();
        setTimeout(() => setActionSuccess(''), 4000);
      }
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} user.`);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Full name is required.';
    if (!formData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(formData.email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }
    if (!formData.password) {
      errors.password = 'Password is required.';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters long.';
    }
    if (!['ADMIN', 'DATA_ENTRY'].includes(formData.role)) {
      errors.role = 'Role must be ADMIN or DATA_ENTRY.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setCreating(true);
    setFormErrors({});
    try {
      const res = await usersAPI.createUser({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
      });

      if (res?.success) {
        setActionSuccess(res.message);
        setModalOpen(false);
        setFormData({ name: '', email: '', password: '', role: 'DATA_ENTRY' });
        fetchUsers();
        setTimeout(() => setActionSuccess(''), 4000);
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || 'Failed to create user.';
      if (err.response?.data?.errors) {
        setFormErrors(err.response.data.errors);
      } else {
        setFormErrors({ general: serverMsg });
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
              Admin Access Only
            </span>
            <span className="text-xs text-slate-400">RBAC User Management</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users size={22} className="text-indigo-400" />
            System User Accounts
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage authenticated operators, assign roles (ADMIN or DATA_ENTRY), and control system access.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh user list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => {
              setFormErrors({});
              setModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
          >
            <UserPlus size={16} />
            Add New User
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {actionSuccess && (
        <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="bg-rose-950/80 border border-rose-600/60 text-rose-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
          <AlertTriangle size={16} className="text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Assigned Role</th>
                <th className="px-4 py-3">Account Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3">Created On</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-400">
                    Loading authenticated users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-400">
                    No users found in database.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = u._id === currentUser?.id || u._id === currentUser?._id;
                  const isUserAdmin = u.role === 'ADMIN' || u.role === 'ADMIN_PUBLISHER';

                  return (
                    <tr key={u._id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white flex items-center gap-2">
                          {u.name}
                          {isCurrent && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded border ${
                            isUserAdmin
                              ? 'bg-indigo-950 text-indigo-300 border-indigo-700/60'
                              : 'bg-teal-950 text-teal-300 border-teal-700/60'
                          }`}
                        >
                          {isUserAdmin ? 'ADMIN' : 'DATA ENTRY'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 w-fit ${
                            u.isActive
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
                              : 'bg-rose-950/60 text-rose-300 border-rose-700/50'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              u.isActive ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-slate-300 font-mono text-[11px]">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}
                      </td>

                      <td className="px-4 py-3.5 text-slate-400 font-mono text-[11px]">
                        {formatDate(u.createdAt, 'DD-MMM-YYYY')}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          disabled={isCurrent}
                          onClick={() => handleToggleStatus(u)}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium border transition ${
                            isCurrent
                              ? 'opacity-30 cursor-not-allowed border-slate-800 text-slate-600'
                              : u.isActive
                              ? 'bg-rose-950/30 text-rose-300 border-rose-800/40 hover:bg-rose-900/40'
                              : 'bg-emerald-950/30 text-emerald-300 border-emerald-800/40 hover:bg-emerald-900/40'
                          }`}
                          title={isCurrent ? 'Cannot toggle own account' : ''}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <UserPlus size={18} className="text-indigo-400" />
                Create New Authorized User
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {formErrors.general && (
              <div className="p-3 bg-rose-950/80 border border-rose-700/60 rounded text-rose-300 text-xs">
                {formErrors.general}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Muhammad Usman"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {formErrors.name && (
                  <p className="text-rose-400 text-[11px] mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="usman@pixxtechnologies.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                {formErrors.email && (
                  <p className="text-rose-400 text-[11px] mt-1">{formErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Password <span className="text-rose-400">* (minimum 6 characters)</span>
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {formErrors.password && (
                  <p className="text-rose-400 text-[11px] mt-1">{formErrors.password}</p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Assigned RBAC Role <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="DATA_ENTRY">DATA_ENTRY (Voucher entry & rent collection)</option>
                  <option value="ADMIN">ADMIN (Full audit, report export & user management)</option>
                </select>
                {formErrors.role && (
                  <p className="text-rose-400 text-[11px] mt-1">{formErrors.role}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                >
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManager;
