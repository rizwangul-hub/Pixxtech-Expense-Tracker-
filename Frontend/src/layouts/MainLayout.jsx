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
  BookOpen,
  Sparkles,
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
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    {
      id: 'ledgers',
      label: 'Ledgers',
      icon: BookOpen,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Journal',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    ...(userIsAdmin || userIsDataEntry
      ? [
          {
            id: 'staff',
            label: 'Staff HR',
            icon: Users,
            status: 'active',
            permission: userIsAdmin ? PERMISSIONS.MANAGE_USERS : PERMISSIONS.ENTER_DATA,
            badge: 'HR / Payroll',
            badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
          },
        ]
      : []),
    ...(userIsAdmin
      ? [
          {
            id: 'chart-of-accounts',
            label: 'Chart of Accounts',
            icon: Layers,
            status: 'active',
            badge: 'Admin',
            badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
          },
        ]
      : []),
    ...(userIsVerifier || userIsAdmin
      ? [
          {
            id: 'verification',
            label: 'Verification Queue',
            icon: ShieldCheck,
            status: 'active',
            badge: 'Verifier',
            badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
          },
        ]
      : []),
    ...(userIsDataEntry || userIsAdmin || userIsVerifier
      ? [
          {
            id: 'operational',
            label: 'Data Entry Terminal',
            icon: Receipt,
            status: 'active',
            badge: 'Operator',
            badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
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
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    {
      id: 'tenants',
      label: 'Tenants',
      icon: Users,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Active',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    {
      id: 'agreements',
      label: 'Agreements',
      icon: FileText,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Active',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    },
    {
      id: 'rent-due',
      label: 'Rent Due',
      icon: Receipt,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Billing',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    {
      id: 'income',
      label: 'Rent Received',
      icon: TrendingUp,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Active',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    {
      id: 'other-income',
      label: 'Other Income',
      icon: Coins,
      status: 'active',
      permission: PERMISSIONS.ENTER_DATA,
      badge: 'Active',
      badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
    },
    {
      id: 'expenses',
      label: 'Expenses',
      icon: Receipt,
      status: canEnterData ? 'active' : 'locked',
      badge: canEnterData ? 'Active' : 'Restricted',
      badgeColor: canEnterData
        ? 'bg-rose-100 text-rose-800 border-rose-200'
        : 'bg-slate-100 text-slate-400 border-slate-200',
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: Landmark,
      status: 'active',
      permission: PERMISSIONS.MANAGE_MASTER_DATA,
      badge: 'Active',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    {
      id: 'transfers',
      label: 'Transfers',
      icon: ArrowLeftRight,
      status: 'active',
      permission: PERMISSIONS.ENTER_DATA,
      badge: 'Active',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: FileSpreadsheet,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Ledger',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart3,
      status: 'active',
      permission: PERMISSIONS.VIEW_FINANCIALS,
      badge: 'Financial',
      badgeColor: 'bg-violet-100 text-violet-800 border-violet-200',
    },
    {
      id: 'monthly-reports',
      label: 'Monthly Reports',
      icon: FileText,
      status: 'active',
      permission: PERMISSIONS.EXPORT_REPORTS,
      badge: 'Publish',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    {
      id: 'users',
      label: 'Users',
      icon: ShieldCheck,
      status: userIsAdmin ? 'active' : 'locked',
      badge: userIsAdmin ? 'Admin' : 'Restricted',
      badgeColor: userIsAdmin
        ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
        : 'bg-slate-100 text-slate-400 border-slate-200',
      permission: PERMISSIONS.MANAGE_USERS,
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
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="shrink-0 sticky top-0 z-40 h-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-0 flex items-center justify-between shadow-2xs">
        {/* Left Branding */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200/80 transition"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl p-1 bg-gradient-to-b from-slate-50 to-slate-100 border border-slate-200/80 shadow-2xs flex items-center justify-center shrink-0">
              <img
                src={logo}
                alt="Pixx Technologies logo"
                className="pixx-logo-spin h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none">
                  PIXX TECHNOLOGIES
                </h1>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200/80 hidden xl:inline-block">
                  ERP
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-1 hidden sm:block">
                Corporate Expense Tracker & Enterprise Ledger System
              </p>
            </div>
          </div>
        </div>

        {/* Right User & Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Status Indicator */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-xs font-bold text-emerald-800 shadow-2xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span>API Online</span>
          </div>

          {/* Operational Tools Jump */}
          {onOpenTerminal && (
            <button
              onClick={onOpenTerminal}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-sm hover:shadow transition transform active:scale-95 text-white-keep"
              title="Open operational voucher entry & reporting terminal"
            >
              <Sparkles size={14} className="text-amber-300" />
              <span className="hidden md:inline">
                {userIsAdmin ? 'Publisher Control Center' : 'Voucher Entry Terminal'}
              </span>
              <span className="md:hidden">Terminal</span>
            </button>
          )}

          {/* User Profile Pill */}
          <div className="flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 px-3 py-1.5 rounded-xl transition shadow-2xs">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-slate-900 via-slate-800 to-blue-900 text-white font-black text-xs shadow-2xs flex items-center justify-center border border-slate-300/40 shrink-0">
              <UserIcon size={15} className="text-white-keep" />
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black text-slate-900 leading-tight">
                {user?.name || 'Authorized User'}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                    userIsAdmin
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200/90'
                      : userIsVerifier
                      ? 'bg-amber-50 text-amber-800 border-amber-200/90'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200/90'
                  }`}
                >
                  {userIsAdmin ? 'ADMINISTRATOR' : userIsVerifier ? 'VERIFIER' : 'DATA ENTRY'}
                </span>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100/90 text-rose-700 border border-rose-200/80 text-xs font-bold transition shadow-2xs hover:shadow-xs active:scale-95"
            title="Sign out of system"
          >
            <LogOut size={15} />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Body: Sidebar + Main Content */}
      <div className="min-h-0 flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex md:w-72 h-full flex-col bg-white border-r border-slate-200 shrink-0 shadow-xs">
          <div className="p-4 border-b border-slate-200">
            <div className="text-xs uppercase font-black tracking-wider text-slate-700 flex items-center gap-2">
              <Layers size={16} className="text-blue-600" />
              Navigation Modules
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {visibleNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const isItemActive = item.status === 'active';

              return (
                <button
                  key={item.id}
                  disabled={!isItemActive}
                  onClick={() => handleNavClick(item)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-bold transition min-h-[50px] ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md font-black text-white-keep'
                      : isItemActive
                      ? 'text-slate-900 hover:bg-slate-100 hover:text-blue-700 font-bold'
                      : 'text-slate-400 cursor-not-allowed opacity-60 hover:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <Icon size={21} className={isActive ? 'text-white-keep' : isItemActive ? 'text-slate-700' : 'text-slate-400'} />
                    <span className="text-[15px] font-bold leading-none">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                        isActive
                          ? 'bg-blue-700 text-white border-blue-500 text-white-keep'
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
          <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
            <div>
              <div className="text-[11px] uppercase font-bold tracking-wider text-slate-500">Software Developer</div>
              <div className="text-sm font-black text-slate-900">Rizwan Ullah</div>
              <div className="text-xs font-bold text-blue-700">Pixx Technologies</div>
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Slide-over Drawer */}
            <div className="relative w-72 max-w-[85%] bg-white border-r border-slate-200 flex flex-col z-10 shadow-xl">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <Layers size={18} className="text-blue-600" />
                  Navigation
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded bg-slate-100 text-slate-600 hover:text-slate-900"
                >
                  <X size={20} />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {visibleNavigationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  const isItemActive = item.status === 'active';

                  return (
                    <button
                      key={item.id}
                      disabled={!isItemActive}
                      onClick={() => handleNavClick(item)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-bold transition min-h-[48px] ${
                        isActive
                          ? 'bg-blue-600 text-white font-black text-white-keep'
                          : isItemActive
                          ? 'text-slate-900 hover:bg-slate-100'
                          : 'text-slate-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={20} />
                        <span className="text-[15px] font-bold">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-slate-200 text-xs text-slate-600 bg-slate-50">
                Logged in as: <strong className="text-slate-900 font-bold">{user?.name}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Main Scrollable Content Area */}
        <main className="min-w-0 min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
          <div className="w-full space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
