import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Key,
  Trash2,
  History,
  Download,
  Search,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Activity,
  Clock,
  ShieldAlert,
  LogIn,
  LogOut,
  Eye,
  EyeOff,
} from 'lucide-react';
import { usersAPI } from '../services/api.js';
import { formatDate, formatDateTime } from '../utils/formatters.js';

// Helper to generate a random secure temporary password
const generateRandomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export function UserManager({ currentUser }) {
  // State: User List & Summary
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState({
    totalUsers: 0,
    activeUsers: 0,
    onlineUsers: 0,
    recentLogins: 0,
    totalActivities: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Filtering & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalFilteredUsers, setTotalFilteredUsers] = useState(0);

  // Modals State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [resetModalUser, setResetModalUser] = useState(null);
  const [deleteModalUser, setDeleteModalUser] = useState(null);
  const [historyModalUser, setHistoryModalUser] = useState(null);

  // Create User Form State
  const [createFormData, setCreateFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'DATA_ENTRY',
  });
  const [createFormErrors, setCreateFormErrors] = useState({});
  const [creating, setCreating] = useState(false);

  // Reset Password Modal State
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSuccessData, setResetSuccessData] = useState(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Delete User Modal State
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // User Activity History Modal State
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotalCount, setActivityTotalCount] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityLimit] = useState(15);
  const [activityFilters, setActivityFilters] = useState({
    search: '',
    category: 'ALL',
    action: 'ALL',
    status: 'ALL',
    startDate: '',
    endDate: '',
  });
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Fetch Users List
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (statusFilter !== 'ALL') params.accountStatus = statusFilter;

      const res = await usersAPI.getUsers(params);
      if (res?.success) {
        setUsers(res.data || []);
        if (res.summary) {
          setSummary(res.summary);
        }
        if (res.pagination) {
          setTotalFilteredUsers(res.pagination.totalUsers || 0);
        }
      } else {
        setError(res?.message || 'Failed to fetch users.');
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      setError(err.response?.data?.message || 'Could not load users list.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Trigger search with page reset
  const handleFilterChange = (setter, val) => {
    setter(val);
    setCurrentPage(1);
  };

  // Toggle User Active Status (Enable / Disable)
  const handleToggleStatus = async (targetUser) => {
    const isCurrent = targetUser._id === currentUser?.id || targetUser._id === currentUser?._id;
    if (isCurrent) {
      alert('Security Protection: You cannot deactivate your own account.');
      return;
    }

    const action = targetUser.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} user "${targetUser.name}"? Active user sessions will be invalidated immediately.`)) {
      return;
    }

    try {
      const res = await usersAPI.toggleUserStatus(targetUser._id);
      if (res?.success) {
        setActionSuccess(res.message);
        fetchUsers();
        setTimeout(() => setActionSuccess(''), 4500);
      }
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} user.`);
    }
  };

  // Handle Create User
  const validateCreateForm = () => {
    const errors = {};
    if (!createFormData.name.trim()) errors.name = 'Full name is required.';
    if (!createFormData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(createFormData.email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }
    if (!createFormData.password) {
      errors.password = 'Password is required.';
    } else if (createFormData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters long.';
    }
    if (!['ADMIN', 'DATA_ENTRY'].includes(createFormData.role)) {
      errors.role = 'Role must be ADMIN or DATA_ENTRY.';
    }
    setCreateFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!validateCreateForm()) return;

    setCreating(true);
    setCreateFormErrors({});
    try {
      const res = await usersAPI.createUser({
        name: createFormData.name.trim(),
        email: createFormData.email.trim(),
        password: createFormData.password,
        role: createFormData.role,
      });

      if (res?.success) {
        setActionSuccess(res.message);
        setCreateModalOpen(false);
        setCreateFormData({ name: '', email: '', password: '', role: 'DATA_ENTRY' });
        fetchUsers();
        setTimeout(() => setActionSuccess(''), 4500);
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || 'Failed to create user.';
      if (err.response?.data?.errors) {
        setCreateFormErrors(err.response.data.errors);
      } else {
        setCreateFormErrors({ general: serverMsg });
      }
    } finally {
      setCreating(false);
    }
  };

  // Handle Reset Password Submit
  const handleOpenResetModal = (userItem) => {
    setResetModalUser(userItem);
    setResetPasswordValue(generateRandomPassword());
    setShowPasswordText(true);
    setRequirePasswordChange(true);
    setResetSuccessData(null);
    setCopiedPassword(false);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetPasswordValue || resetPasswordValue.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }

    setResetSubmitting(true);
    try {
      const res = await usersAPI.resetPassword(resetModalUser._id, {
        newPassword: resetPasswordValue,
        requirePasswordChange,
      });
      if (res?.success) {
        setResetSuccessData({
          password: resetPasswordValue,
          message: res.message,
          user: resetModalUser,
        });
        fetchUsers();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleCopyPassword = () => {
    if (resetSuccessData?.password) {
      navigator.clipboard.writeText(resetSuccessData.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 3000);
    }
  };

  // Handle Delete User Submit
  const handleOpenDeleteModal = (userItem) => {
    setDeleteModalUser(userItem);
    setDeleteConfirmationText('');
  };

  const handleDeleteUserSubmit = async (e) => {
    e.preventDefault();
    if (!deleteModalUser) return;

    const trimmedInput = deleteConfirmationText.trim();
    if (trimmedInput !== deleteModalUser.email && trimmedInput !== 'DELETE') {
      alert(`Please type "${deleteModalUser.email}" or "DELETE" to confirm account deletion.`);
      return;
    }

    setDeleting(true);
    try {
      const res = await usersAPI.deleteUser(deleteModalUser._id);
      if (res?.success) {
        setActionSuccess(res.message);
        setDeleteModalUser(null);
        fetchUsers();
        setTimeout(() => setActionSuccess(''), 5000);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user.');
    } finally {
      setDeleting(false);
    }
  };

  // Handle Activity History Modal
  const fetchUserActivity = useCallback(async () => {
    if (!historyModalUser) return;
    setActivityLoading(true);
    try {
      const params = {
        page: activityPage,
        limit: activityLimit,
      };
      if (activityFilters.search.trim()) params.search = activityFilters.search.trim();
      if (activityFilters.category !== 'ALL') params.category = activityFilters.category;
      if (activityFilters.action !== 'ALL') params.action = activityFilters.action;
      if (activityFilters.status !== 'ALL') params.status = activityFilters.status;
      if (activityFilters.startDate) params.startDate = activityFilters.startDate;
      if (activityFilters.endDate) params.endDate = activityFilters.endDate;

      const res = await usersAPI.getUserActivity(historyModalUser._id, params);
      if (res?.success) {
        setActivityLogs(res.data || []);
        if (res.pagination) {
          setActivityTotalCount(res.pagination.totalRecords || 0);
        }
      }
    } catch (err) {
      console.error('Fetch activity error:', err);
    } finally {
      setActivityLoading(false);
    }
  }, [historyModalUser, activityPage, activityLimit, activityFilters]);

  useEffect(() => {
    if (historyModalUser) {
      fetchUserActivity();
    }
  }, [historyModalUser, fetchUserActivity]);

  const handleOpenHistoryModal = (userItem) => {
    setHistoryModalUser(userItem);
    setActivityPage(1);
    setActivityFilters({
      search: '',
      category: 'ALL',
      action: 'ALL',
      status: 'ALL',
      startDate: '',
      endDate: '',
    });
    setExpandedLogId(null);
  };

  const handleExportUserActivityCsv = async () => {
    if (!historyModalUser) return;
    setExportingCsv(true);
    try {
      const params = {};
      if (activityFilters.search.trim()) params.search = activityFilters.search.trim();
      if (activityFilters.category !== 'ALL') params.category = activityFilters.category;
      if (activityFilters.action !== 'ALL') params.action = activityFilters.action;
      if (activityFilters.status !== 'ALL') params.status = activityFilters.status;
      if (activityFilters.startDate) params.startDate = activityFilters.startDate;
      if (activityFilters.endDate) params.endDate = activityFilters.endDate;

      const cleanName = historyModalUser.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `activity_history_${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`;
      await usersAPI.exportUserActivityCsv(historyModalUser._id, params, filename);
    } catch (err) {
      alert('Failed to export activity logs CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  // Presence badge renderer
  const renderPresenceBadge = (presence) => {
    switch (presence) {
      case 'ONLINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-600/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Online
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-600/40">
            <Clock size={11} className="text-amber-400" />
            Session Expired
          </span>
        );
      case 'DISABLED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-700/50">
            <ShieldAlert size={11} className="text-rose-400" />
            Disabled
          </span>
        );
      case 'DELETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-900 text-zinc-400 border border-zinc-700 line-through">
            <Trash2 size={11} className="text-zinc-500" />
            Deleted
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            Offline
          </span>
        );
    }
  };

  // Action Badge Helper
  const getActionBadge = (action) => {
    switch (action) {
      case 'LOGIN_SUCCESS':
      case 'LOGIN':
        return 'bg-emerald-950 text-emerald-300 border-emerald-700/60';
      case 'LOGIN_FAILED':
        return 'bg-rose-950 text-rose-300 border-rose-700/60';
      case 'LOGOUT':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      case 'CREATE':
        return 'bg-blue-950 text-blue-300 border-blue-700/60';
      case 'UPDATE':
        return 'bg-amber-950 text-amber-300 border-amber-700/60';
      case 'VERIFY':
        return 'bg-teal-950 text-teal-300 border-teal-700/60';
      case 'UNVERIFY':
        return 'bg-purple-950 text-purple-300 border-purple-700/60';
      case 'REJECT':
      case 'DELETE':
        return 'bg-rose-950 text-rose-300 border-rose-700/60';
      case 'RESET_PASSWORD':
        return 'bg-indigo-950 text-indigo-300 border-indigo-700/60';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const totalPages = Math.ceil(totalFilteredUsers / pageSize) || 1;
  const activityTotalPages = Math.ceil(activityTotalCount / activityLimit) || 1;

  return (
    <div className="space-y-6">
      {/* 1. Header & Summary Metric Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                Security & Audit Management
              </span>
              <span className="text-xs text-slate-400">Pixx Technologies ERP</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Users size={22} className="text-indigo-400" />
              User Accounts & Activity Audit Logs
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage authorized operators, inspect live presence, track complete user activity audit histories, reset credentials, and securely manage accounts.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Refresh user list & summary"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => {
                setCreateFormErrors({});
                setCreateModalOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
            >
              <UserPlus size={16} />
              Add New User
            </button>
          </div>
        </div>

        {/* Summary Metric Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={13} className="text-indigo-400" /> Total Users
            </div>
            <div className="text-xl font-bold text-white font-mono mt-1">
              {summary.totalUsers || 0}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-400" /> Active Users
            </div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
              {summary.activeUsers || 0}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Online Now
            </div>
            <div className="text-xl font-bold text-emerald-300 font-mono mt-1">
              {summary.onlineUsers || 0}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <LogIn size={13} className="text-blue-400" /> 24h Logins
            </div>
            <div className="text-xl font-bold text-blue-300 font-mono mt-1">
              {summary.recentLogins || 0}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3 col-span-2 sm:col-span-1">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity size={13} className="text-amber-400" /> Total Activities
            </div>
            <div className="text-xl font-bold text-amber-300 font-mono mt-1">
              {(summary.totalActivities || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2 shadow-sm animate-fade-in">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-950/80 border border-rose-600/60 text-rose-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2 shadow-sm">
          <AlertTriangle size={16} className="text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Search & Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
            placeholder="Search by full name or email address..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1">
            <Filter size={13} className="text-slate-400" />
            <select
              value={roleFilter}
              onChange={(e) => handleFilterChange(setRoleFilter, e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none text-xs"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">ADMIN / ADMIN_PUBLISHER</option>
              <option value="DATA_ENTRY">DATA_ENTRY / Accountant</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1">
            <span className="text-slate-400 text-[11px]">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none text-xs"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Accounts</option>
              <option value="DISABLED">Disabled Accounts</option>
              <option value="DELETED">Deleted Accounts</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1">
            <span className="text-slate-400 text-[11px]">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => handleFilterChange(setPageSize, Number(e.target.value))}
              className="bg-transparent text-slate-200 focus:outline-none text-xs font-mono"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Upgraded Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">User & Email</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Presence</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-center">Logins</th>
                <th className="px-3 py-3">Last Login (PKT)</th>
                <th className="px-3 py-3">Last Logout</th>
                <th className="px-3 py-3">Last Active</th>
                <th className="px-3 py-3 text-center">Activities</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw size={20} className="animate-spin inline-block mb-2 text-indigo-400" />
                    <div>Loading system user accounts & activity statistics...</div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-12 text-center text-slate-400">
                    No users matching the selected filters.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = u._id === currentUser?.id || u._id === currentUser?._id;
                  const isUserAdmin = u.role === 'ADMIN' || u.role === 'ADMIN_PUBLISHER';
                  const isDeleted = Boolean(u.isDeleted);

                  return (
                    <tr
                      key={u._id}
                      className={`hover:bg-slate-800/40 transition ${
                        isDeleted ? 'opacity-60 bg-slate-950/40' : ''
                      }`}
                    >
                      {/* Name & Email */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          {u.name}
                          {isCurrent && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                              You
                            </span>
                          )}
                          {isDeleted && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800/60">
                              Soft Deleted
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{u.email}</div>
                      </td>

                      {/* Assigned Role */}
                      <td className="px-3 py-3.5">
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded border whitespace-nowrap ${
                            isUserAdmin
                              ? 'bg-indigo-950 text-indigo-300 border-indigo-700/60'
                              : 'bg-teal-950 text-teal-300 border-teal-700/60'
                          }`}
                        >
                          {isUserAdmin ? 'ADMIN' : 'ACCOUNTANT'}
                        </span>
                      </td>

                      {/* Live Presence */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {renderPresenceBadge(u.presence)}
                      </td>

                      {/* Account Status */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {isDeleted ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-700">
                            Deleted
                          </span>
                        ) : u.isActive ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700/50">
                            Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-700/50">
                            Disabled
                          </span>
                        )}
                      </td>

                      {/* Total Logins */}
                      <td className="px-3 py-3.5 text-center font-mono text-[11px] text-slate-300">
                        {u.loginCount || 0}
                      </td>

                      {/* Last Login */}
                      <td className="px-3 py-3.5 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}
                      </td>

                      {/* Last Logout */}
                      <td className="px-3 py-3.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {u.lastLogoutAt ? formatDateTime(u.lastLogoutAt) : '—'}
                      </td>

                      {/* Last Activity */}
                      <td className="px-3 py-3.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {u.lastActiveAt ? formatDateTime(u.lastActiveAt) : '—'}
                      </td>

                      {/* Total Activities Recorded */}
                      <td className="px-3 py-3.5 text-center">
                        <button
                          onClick={() => handleOpenHistoryModal(u)}
                          className="font-mono text-[11px] text-indigo-400 hover:text-indigo-300 underline font-semibold"
                          title="Click to view activity history"
                        >
                          {(u.totalActivities || 0).toLocaleString()}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Full History */}
                          <button
                            onClick={() => handleOpenHistoryModal(u)}
                            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white transition"
                            title="View Full Activity Audit History"
                          >
                            <History size={14} className="text-indigo-400" />
                          </button>

                          {/* Reset Password */}
                          {!isDeleted && (
                            <button
                              onClick={() => handleOpenResetModal(u)}
                              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-amber-300 transition"
                              title="Reset Password"
                            >
                              <Key size={14} className="text-amber-400" />
                            </button>
                          )}

                          {/* Activate / Deactivate Toggle */}
                          {!isDeleted && (
                            <button
                              disabled={isCurrent}
                              onClick={() => handleToggleStatus(u)}
                              className={`px-2 py-1 rounded text-[11px] font-medium border transition ${
                                isCurrent
                                  ? 'opacity-30 cursor-not-allowed border-slate-800 text-slate-600'
                                  : u.isActive
                                  ? 'bg-rose-950/30 text-rose-300 border-rose-800/40 hover:bg-rose-900/40'
                                  : 'bg-emerald-950/30 text-emerald-300 border-emerald-800/40 hover:bg-emerald-900/40'
                              }`}
                              title={isCurrent ? 'Cannot toggle own account' : u.isActive ? 'Deactivate account' : 'Activate account'}
                            >
                              {u.isActive ? 'Disable' : 'Enable'}
                            </button>
                          )}

                          {/* Delete User */}
                          {!isDeleted && (
                            <button
                              disabled={isCurrent}
                              onClick={() => handleOpenDeleteModal(u)}
                              className={`p-1.5 rounded-md border transition ${
                                isCurrent
                                  ? 'opacity-30 cursor-not-allowed bg-slate-800 text-slate-600 border-slate-800'
                                  : 'bg-rose-950/30 hover:bg-rose-900/40 text-rose-400 border-rose-800/50'
                              }`}
                              title={isCurrent ? 'Cannot delete own account' : 'Delete user account'}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Bar */}
        {totalFilteredUsers > 0 && (
          <div className="bg-slate-950/80 border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing <span className="text-white font-mono">{Math.min((currentPage - 1) * pageSize + 1, totalFilteredUsers)}</span> to{' '}
              <span className="text-white font-mono">{Math.min(currentPage * pageSize, totalFilteredUsers)}</span> of{' '}
              <span className="text-white font-mono">{totalFilteredUsers}</span> accounts
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="font-mono text-slate-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL: View Full History & Audit Logs                                   */}
      {/* ========================================================================= */}
      {historyModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header / User Profile Banner */}
            <div className="bg-slate-950 border-b border-slate-800 p-4 sm:p-5 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
                    Activity Audit Trail
                  </span>
                  {renderPresenceBadge(historyModalUser.presence)}
                  {historyModalUser.isDeleted && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                      Account Deleted
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <User size={18} className="text-indigo-400" />
                  {historyModalUser.name}{' '}
                  <span className="text-xs text-slate-400 font-mono font-normal">
                    ({historyModalUser.email})
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1 font-mono">
                  <span>Role: <strong className="text-slate-200">{historyModalUser.role}</strong></span>
                  <span>Joined: <strong className="text-slate-200">{formatDate(historyModalUser.createdAt, 'DD-MMM-YYYY')}</strong></span>
                  <span>Total Logins: <strong className="text-slate-200">{historyModalUser.loginCount || 0}</strong></span>
                  <span>Recorded Actions: <strong className="text-indigo-400">{activityTotalCount}</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleExportUserActivityCsv}
                  disabled={exportingCsv || activityTotalCount === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-40"
                  title="Download user audit history as CSV"
                >
                  <Download size={14} />
                  {exportingCsv ? 'Exporting...' : 'Export CSV'}
                </button>
                <button
                  onClick={() => setHistoryModalUser(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-950/60 border-b border-slate-800/80 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex-1 min-w-[200px] relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={activityFilters.search}
                  onChange={(e) => {
                    setActivityFilters({ ...activityFilters, search: e.target.value });
                    setActivityPage(1);
                  }}
                  placeholder="Filter by description, voucher # or record..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-2 py-1 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activityFilters.category}
                  onChange={(e) => {
                    setActivityFilters({ ...activityFilters, category: e.target.value });
                    setActivityPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="FINANCIAL">Financial (Expenses/Transfers)</option>
                  <option value="RENT">Rent & Tenancy</option>
                  <option value="PAYROLL">Payroll & Salaries</option>
                  <option value="PROPERTY">Properties & Units</option>
                  <option value="USER_MANAGEMENT">User Management</option>
                  <option value="AUTH">Authentication / Logins</option>
                  <option value="BACKUP">Database Backups</option>
                </select>

                <select
                  value={activityFilters.action}
                  onChange={(e) => {
                    setActivityFilters({ ...activityFilters, action: e.target.value });
                    setActivityPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
                >
                  <option value="ALL">All Actions</option>
                  <option value="LOGIN_SUCCESS">Login Success</option>
                  <option value="LOGIN_FAILED">Login Failed</option>
                  <option value="LOGOUT">Logout</option>
                  <option value="CREATE">Create</option>
                  <option value="UPDATE">Update</option>
                  <option value="DELETE">Delete</option>
                  <option value="VERIFY">Verify</option>
                  <option value="UNVERIFY">Unverify</option>
                  <option value="REJECT">Reject</option>
                  <option value="RESET_PASSWORD">Reset Password</option>
                </select>

                <select
                  value={activityFilters.status}
                  onChange={(e) => {
                    setActivityFilters({ ...activityFilters, status: e.target.value });
                    setActivityPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
                >
                  <option value="ALL">All Results</option>
                  <option value="SUCCESS">Success Only</option>
                  <option value="FAILED">Failed Only</option>
                </select>

                <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-0.5">
                  <Calendar size={12} className="text-slate-400" />
                  <input
                    type="date"
                    value={activityFilters.startDate}
                    onChange={(e) => {
                      setActivityFilters({ ...activityFilters, startDate: e.target.value });
                      setActivityPage(1);
                    }}
                    className="bg-transparent text-slate-300 text-xs focus:outline-none"
                    title="From date"
                  />
                  <span className="text-slate-500 text-xs">to</span>
                  <input
                    type="date"
                    value={activityFilters.endDate}
                    onChange={(e) => {
                      setActivityFilters({ ...activityFilters, endDate: e.target.value });
                      setActivityPage(1);
                    }}
                    className="bg-transparent text-slate-300 text-xs focus:outline-none"
                    title="To date"
                  />
                </div>
              </div>
            </div>

            {/* Activity Stream Table / List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {activityLoading ? (
                <div className="py-16 text-center text-slate-400">
                  <RefreshCw size={24} className="animate-spin inline-block text-indigo-400 mb-2" />
                  <p className="text-xs">Fetching chronological audit trail...</p>
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
                  <History size={28} className="inline-block text-slate-500 mb-2" />
                  <p className="text-xs font-medium text-slate-300">No recorded activities found.</p>
                  <p className="text-[11px] text-slate-500 mt-1">Try adjusting the filter criteria or date range.</p>
                </div>
              ) : (
                activityLogs.map((log) => {
                  const isExpanded = expandedLogId === log._id;
                  const hasChanges = log.changes && (log.changes.previous || log.changes.updated);
                  const isFailed = log.status === 'FAILED';

                  return (
                    <div
                      key={log._id}
                      className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 hover:border-slate-700 transition space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border whitespace-nowrap ${getActionBadge(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>

                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
                            {log.module}
                          </span>

                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                              isFailed
                                ? 'bg-rose-950 text-rose-300 border-rose-800'
                                : 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50'
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-500" />
                          <span>{log.formattedLocalTime || formatDateTime(log.timestamp)}</span>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-white font-medium pl-0.5 leading-relaxed">
                        {log.description}
                      </p>

                      {/* Metadata bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 font-mono border-t border-slate-800/50">
                        <div className="flex items-center gap-3">
                          {log.recordType && (
                            <span>Target: <span className="text-slate-300">{log.recordType}</span></span>
                          )}
                          {log.ipAddress && (
                            <span>IP: <span className="text-slate-300">{log.ipAddress}</span></span>
                          )}
                          {log.metadata?.voucherNo && (
                            <span>Voucher: <span className="text-indigo-400 font-bold">#{log.metadata.voucherNo}</span></span>
                          )}
                        </div>

                        {(hasChanges || log.userAgent) && (
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                            className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-sans text-xs font-semibold"
                          >
                            <span>{isExpanded ? 'Hide Details' : 'View Changes & Meta'}</span>
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        )}
                      </div>

                      {/* Expanded Change Diff & Client Details */}
                      {isExpanded && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-xs bg-slate-900/90 rounded-lg p-3 space-y-2.5">
                          {log.userAgent && (
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Device / User Agent:</span>
                              <div className="text-[11px] font-mono text-slate-300 break-all bg-slate-950 p-1.5 rounded mt-0.5 border border-slate-800">
                                {log.userAgent}
                              </div>
                            </div>
                          )}

                          {hasChanges && (
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Change Details:</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                {log.changes.previous && (
                                  <div className="bg-slate-950 p-2.5 rounded border border-rose-900/40">
                                    <div className="text-[10px] font-bold uppercase text-rose-400 mb-1">Previous Values:</div>
                                    <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap break-all overflow-x-auto">
                                      {JSON.stringify(log.changes.previous, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.changes.updated && (
                                  <div className="bg-slate-950 p-2.5 rounded border border-emerald-900/40">
                                    <div className="text-[10px] font-bold uppercase text-emerald-400 mb-1">Updated Values:</div>
                                    <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap break-all overflow-x-auto">
                                      {JSON.stringify(log.changes.updated, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Activity Pagination Footer */}
            {activityTotalCount > 0 && (
              <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
                <div>
                  Showing <span className="text-white font-mono">{Math.min((activityPage - 1) * activityLimit + 1, activityTotalCount)}</span> to{' '}
                  <span className="text-white font-mono">{Math.min(activityPage * activityLimit, activityTotalCount)}</span> of{' '}
                  <span className="text-white font-mono">{activityTotalCount}</span> records
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={activityPage <= 1}
                    onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="font-mono text-slate-300">
                    Page {activityPage} of {activityTotalPages}
                  </span>
                  <button
                    disabled={activityPage >= activityTotalPages}
                    onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: Reset Password                                                  */}
      {/* ========================================================================= */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Key size={18} className="text-amber-400" />
                Reset User Password
              </div>
              <button
                onClick={() => setResetModalUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {resetSuccessData ? (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 bg-emerald-950/80 border border-emerald-600/60 rounded-lg text-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-300">
                    <CheckCircle2 size={16} />
                    Password Reset Successfully!
                  </div>
                  <p className="text-[11px] leading-relaxed text-emerald-200/90">
                    All prior active sessions for <strong>{resetSuccessData.user.name}</strong> have been invalidated immediately.
                  </p>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">New Temporary Password:</span>
                  <div className="flex items-center justify-between gap-2 bg-slate-900 p-2 rounded border border-slate-700">
                    <code className="text-sm font-mono font-bold text-amber-300 tracking-wider">
                      {resetSuccessData.password}
                    </code>
                    <button
                      onClick={handleCopyPassword}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                    >
                      {copiedPassword ? (
                        <>
                          <Check size={13} className="text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Please securely share this temporary password with the user. It will not be shown again.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setResetModalUser(null)}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5 text-xs">
                <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-1">
                  <div className="text-slate-300 font-semibold">{resetModalUser.name}</div>
                  <div className="text-slate-400 font-mono text-[11px]">{resetModalUser.email}</div>
                  <div className="text-[11px] text-amber-400/90 pt-1">
                    ⚠️ Changing password immediately invalidates all active sessions across all devices for this user.
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold">New Password</label>
                    <button
                      type="button"
                      onClick={() => setResetPasswordValue(generateRandomPassword())}
                      className="text-indigo-400 hover:text-indigo-300 text-[11px] underline"
                    >
                      Generate Random Password
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                    <input
                      type={showPasswordText ? 'text' : 'password'}
                      required
                      value={resetPasswordValue}
                      onChange={(e) => setResetPasswordValue(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-10 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showPasswordText ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="requirePasswordChange"
                    checked={requirePasswordChange}
                    onChange={(e) => setRequirePasswordChange(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="requirePasswordChange" className="text-slate-300 text-xs select-none">
                    Require user to change password on their next login
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition disabled:opacity-40"
                  >
                    {resetSubmitting ? 'Resetting...' : 'Confirm Reset'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL: Delete User Confirmation                                        */}
      {/* ========================================================================= */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-rose-900/60 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <Trash2 size={18} />
                Delete User Account
              </div>
              <button
                onClick={() => setDeleteModalUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 bg-rose-950/70 border border-rose-800/60 rounded-lg text-rose-200 text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-rose-300">
                <AlertTriangle size={15} />
                Warning: Account Soft Deletion
              </div>
              <p className="text-[11px] leading-relaxed text-rose-200/90">
                You are about to delete user <strong>{deleteModalUser.name}</strong> (<span className="font-mono">{deleteModalUser.email}</span>).
              </p>
              <p className="text-[11px] leading-relaxed text-rose-200/80">
                The user will be immediately blocked from logging in and all active sessions revoked.
                All historical financial vouchers, transactions, audit logs, and payroll records created by this user will be <strong>100% safely preserved</strong> for audit integrity.
              </p>
            </div>

            <form onSubmit={handleDeleteUserSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Type <span className="font-mono text-rose-300 select-all font-bold">{deleteModalUser.email}</span> or <span className="font-bold text-rose-300 font-mono">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  required
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="Type email or DELETE to confirm"
                  className="w-full bg-slate-950 border border-rose-900/60 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeleteModalUser(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    deleting ||
                    (deleteConfirmationText.trim() !== deleteModalUser.email &&
                      deleteConfirmationText.trim() !== 'DELETE')
                  }
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete User Permanently'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL: Create New Authorized User                                      */}
      {/* ========================================================================= */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <UserPlus size={18} className="text-indigo-400" />
                Create New Authorized User
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {createFormErrors.general && (
              <div className="p-3 bg-rose-950/80 border border-rose-700/60 rounded text-rose-300 text-xs">
                {createFormErrors.general}
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
                    value={createFormData.name}
                    onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
                    placeholder="e.g. Muhammad Usman"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {createFormErrors.name && (
                  <p className="text-rose-400 text-[11px] mt-1">{createFormErrors.name}</p>
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
                    value={createFormData.email}
                    onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                    placeholder="usman@pixxtechnologies.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                {createFormErrors.email && (
                  <p className="text-rose-400 text-[11px] mt-1">{createFormErrors.email}</p>
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
                    value={createFormData.password}
                    onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {createFormErrors.password && (
                  <p className="text-rose-400 text-[11px] mt-1">{createFormErrors.password}</p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Assigned RBAC Role <span className="text-rose-400">*</span>
                </label>
                <select
                  value={createFormData.role}
                  onChange={(e) => setCreateFormData({ ...createFormData, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="DATA_ENTRY">ACCOUNTANT (DATA_ENTRY — voucher entry & rent collection)</option>
                  <option value="ADMIN">ADMIN (Full audit, report export & user management)</option>
                </select>
                {createFormErrors.role && (
                  <p className="text-rose-400 text-[11px] mt-1">{createFormErrors.role}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-40"
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
