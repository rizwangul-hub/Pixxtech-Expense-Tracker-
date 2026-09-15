import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  TrendingUp,
  Receipt,
  Landmark,
  ArrowLeftRight,
  FileSpreadsheet,
  BarChart3,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
  User as UserIcon,
  Layers,
  FileText,
  Coins,
} from 'lucide-react';
import { hasPermission, isAdmin, isVerifier, isDataEntry, PERMISSIONS } from '../utils/permissions.js';
import logo from '../assets/image/logo.png';

export function MainLayout({
  user,
  currentView,
  onViewChange,
  onLogout,
  onOpenTerminal,
  children,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userIsAdmin = isAdmin(user);
  const userIsVerifier = isVerifier(user);
  const userIsDataEntry = isDataEntry(user);
  const canEnterData = hasPermission(user, PERMISSIONS.ENTER_DATA);
  const canManageSettings = hasPermission(user, PERMISSIONS.MANAGE_SETTINGS);

  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      status: 'active',
      badge: 'Core',
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    },
    ...(userIsVerifier || userIsAdmin
      ? [
          {
            id: 'verification',
            label: 'Verification Queue',
            icon: ShieldCheck,
            status: 'active',
            badge: 'Verifier',
            badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
          },
        ]
      : []),
    ...(userIsDataEntry
      ? [
          {
            id: 'operational',
            label: 'Data Entry Terminal',
            icon: Receipt,
            status: 'active',
            badge: 'Operator',
            badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
          },
        ]
      : []),
    {
      id: 'properties',
      label: 'Properties',
      icon: Building2,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Portfolio',
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    },
    {
      id: 'tenants',
      label: 'Tenants',
      icon: Users,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Active',
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    },
    {
      id: 'agreements',
      label: 'Agreements',
      icon: FileText,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Active',
      badgeColor: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
    },
    {
      id: 'rent-due',
      label: 'Rent Due',
      icon: Receipt,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Billing',
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    },
    {
      id: 'income',
      label: 'Rent Received',
      icon: TrendingUp,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Active',
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    },
    {
      id: 'other-income',
      label: 'Other Income',
      icon: Coins,
      status: 'active',
      permission: PERMISSIONS.ENTER_DATA,
      badge: 'Active',
      badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
    },
    {
      id: 'expenses',
      label: 'Expenses',
      icon: Receipt,
      status: canEnterData ? 'active' : 'locked',
      badge: canEnterData ? 'Active' : 'Restricted',
      badgeColor: canEnterData
        ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
        : 'bg-slate-800 text-slate-500 border-slate-700',
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: Landmark,
      status: 'active',
      permission: PERMISSIONS.MANAGE_MASTER_DATA,
      badge: 'Active',
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    },
    {
      id: 'transfers',
      label: 'Transfers',
      icon: ArrowLeftRight,
      status: 'active',
      permission: PERMISSIONS.ENTER_DATA,
      badge: 'Active',
      badgeColor: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: FileSpreadsheet,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Ledger',
      badgeColor: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart3,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Financial',
      badgeColor: 'bg-violet-950/80 text-violet-300 border-violet-700/60',
    },
    {
      id: 'monthly-reports',
      label: 'Monthly Reports',
      icon: FileText,
      status: 'active',
      permission: PERMISSIONS.EXPORT_REPORTS,
      badge: 'Publish',
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    },
    {
      id: 'users',
      label: 'Users',
      icon: ShieldCheck,
      status: userIsAdmin ? 'active' : 'locked',
      badge: userIsAdmin ? 'Admin' : 'Restricted',
      badgeColor: userIsAdmin
        ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60'
        : 'bg-slate-800 text-slate-500 border-slate-700',
      permission: PERMISSIONS.MANAGE_USERS,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      status: canManageSettings ? 'active' : 'locked',
      badge: canManageSettings ? 'Configuration' : 'Restricted',
      badgeColor: canManageSettings
        ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60'
        : 'bg-slate-800 text-slate-500 border-slate-700',
      permission: PERMISSIONS.MANAGE_SETTINGS,
    },
  ];

  const visibleNavigationItems = navigationItems.filter(
    (item) => !item.permission || hasPermission(user, item.permission)
  );

  const handleNavClick = (item) => {
    if (item.status === 'active') {
      onViewChange(item.id);
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="shrink-0 sticky top-0 z-40 h-20 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md px-4 lg:px-6 py-0 flex items-center justify-between shadow-md">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <img
            src={logo}
            alt="Pixx Technologies logo"
            className="pixx-logo-spin h-18 w-18 rounded-lg object-contain"
          />
        </div>

        {/* Right User & Actions */}
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>API Online</span>
          </div>

          {/* Operational Tools Jump */}
          {onOpenTerminal && (
            <button
              onClick={onOpenTerminal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition"
              title="Open operational voucher entry & reporting terminal"
            >
              <FileText size={14} className="text-emerald-400" />
              <span className="hidden md:inline">
                {userIsAdmin ? 'Publisher Control Center' : 'Voucher Entry Terminal'}
              </span>
              <span className="md:hidden">Terminal</span>
            </button>
          )}

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-2.5 py-1 rounded-lg">
            <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
              <UserIcon size={14} />
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-semibold text-slate-200 leading-tight">
                {user?.name || 'Authorized User'}
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                    userIsAdmin
                      ? 'bg-indigo-950 text-indigo-300 border-indigo-700/60'
                      : 'bg-teal-950 text-teal-300 border-teal-700/60'
                  }`}
                >
                  {userIsAdmin ? 'ADMIN' : 'DATA ENTRY'}
                </span>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 hover:border-rose-700 text-xs font-medium transition"
            title="Sign out of system"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Body: Sidebar + Main Content */}
      <div className="min-h-0 flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex md:w-64 h-full flex-col bg-slate-900 border-r border-slate-800 shrink-0">
          <div className="p-4 border-b border-slate-800/80">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers size={13} className="text-emerald-400" />
              Navigation Modules
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {visibleNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const isItemActive = item.status === 'active';

              return (
                <button
                  key={item.id}
                  disabled={!isItemActive}
                  onClick={() => handleNavClick(item)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                      : isItemActive
                      ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'text-slate-500 cursor-not-allowed opacity-60 hover:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isActive ? 'text-white' : isItemActive ? 'text-slate-400' : 'text-slate-600'} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                        isActive
                          ? 'bg-emerald-700 text-emerald-100 border-emerald-500'
                          : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Software Developer</div>
              <div className="text-xs font-semibold text-slate-200">Rizwan Ullah</div>
              <div className="text-[10px] text-emerald-400">Pixx Technologies</div>
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Slide-over Drawer */}
            <div className="relative w-64 max-w-[80%] bg-slate-900 border-r border-slate-800 flex flex-col z-10">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Layers size={14} className="text-emerald-400" />
                  Navigation
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {visibleNavigationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  const isItemActive = item.status === 'active';

                  return (
                    <button
                      key={item.id}
                      disabled={!isItemActive}
                      onClick={() => handleNavClick(item)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                        isActive
                          ? 'bg-emerald-600 text-white font-semibold'
                          : isItemActive
                          ? 'text-slate-300 hover:bg-slate-800'
                          : 'text-slate-500 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400">
                Logged in as: <strong className="text-slate-200">{user?.name}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Main Scrollable Content Area */}
        <main className="min-w-0 min-h-0 flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
