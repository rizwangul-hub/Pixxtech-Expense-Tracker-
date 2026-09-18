import React, { useState, useEffect } from 'react';
import { MainLayout } from './layouts/MainLayout.jsx';
import { DashboardHome } from './pages/DashboardHome.jsx';
import { UserManager } from './pages/UserManager.jsx';
import { PropertiesPage } from './pages/PropertiesPage.jsx';
import { PropertyDetailPage } from './pages/PropertyDetailPage.jsx';
import { TenantsPage } from './pages/TenantsPage.jsx';
import { TenantDetailPage } from './pages/TenantDetailPage.jsx';
import { AgreementsPage } from './pages/AgreementsPage.jsx';
import { RentDuePage } from './pages/RentDuePage.jsx';
import { RentReceivedPage } from './pages/RentReceivedPage.jsx';
import { AccountsPage } from './pages/AccountsPage.jsx';
import { ChartOfAccountsPage } from './pages/ChartOfAccountsPage.jsx';
import { AccountLedgerPage } from './pages/AccountLedgerPage.jsx';
import { LedgersPage } from './pages/LedgersPage.jsx';
import { TransfersPage } from './pages/TransfersPage.jsx';
import { TransactionsPage } from './pages/TransactionsPage.jsx';
import { OtherIncomePage } from './pages/OtherIncomePage.jsx';
import { FinancialReportsPage } from './pages/FinancialReportsPage.jsx';
import { MonthlyReportsHistoryPage } from './pages/MonthlyReportsHistoryPage.jsx';
import { DataEntryDashboard } from './pages/DataEntryDashboard.jsx';
import { AdminPublisherDashboard } from './pages/AdminPublisherDashboard.jsx';
import { VerifierDashboard } from './pages/VerifierDashboard.jsx';
import { StaffPage } from './pages/StaffPage.jsx';
import { LoginForm } from './components/LoginForm.jsx';
import loadingImg from './assets/image/loading.png';
import { authAPI } from './services/api.js';
import { hasPermission, isAdmin, isVerifier, isDataEntry, PERMISSIONS } from './utils/permissions.js';

const sectionFromPath = (pathname) => {
  const pathSection = pathname.replace(/^\/+|\/+$/g, '');
  return pathSection || 'dashboard';
};

const pathForSection = (section) => (section === 'dashboard' ? '/' : `/${section}`);

const SECTION_PERMISSIONS = {
  ledgers: PERMISSIONS.ENTER_DATA,
  properties: PERMISSIONS.VIEW_FINANCIALS,
  tenants: PERMISSIONS.VIEW_FINANCIALS,
  agreements: PERMISSIONS.VIEW_FINANCIALS,
  'rent-due': PERMISSIONS.VIEW_FINANCIALS,
  income: PERMISSIONS.VIEW_FINANCIALS,
  'rent-received': PERMISSIONS.VIEW_FINANCIALS,
  'other-income': PERMISSIONS.ENTER_DATA,
  expenses: PERMISSIONS.ENTER_DATA,
  operational: PERMISSIONS.ENTER_DATA,
  accounts: PERMISSIONS.MANAGE_MASTER_DATA,
  'account-ledger': PERMISSIONS.VIEW_FINANCIALS,
  transfers: PERMISSIONS.ENTER_DATA,
  transactions: PERMISSIONS.VIEW_FINANCIALS,
  reports: PERMISSIONS.VIEW_FINANCIALS,
  'monthly-reports': PERMISSIONS.EXPORT_REPORTS,
  users: PERMISSIONS.MANAGE_USERS,
  staff: PERMISSIONS.MANAGE_USERS,
  settings: PERMISSIONS.MANAGE_SETTINGS,
};

const getAccessibleSection = (section, user) => {
  if (section === 'chart-of-accounts' && !isAdmin(user)) {
    return 'dashboard';
  }
  if (section === 'expenses' && !isAdmin(user) && !isVerifier(user)) {
    return 'dashboard';
  }
  const requiredPermission = SECTION_PERMISSIONS[section];
  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    return 'dashboard';
  }
  return section;
};

export function App() {
  const [user, setUser] = useState(null);
  const [currentSection, setCurrentSection] = useState(() => sectionFromPath(window.location.pathname));
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      const cachedUser = localStorage.getItem('user');

      if (token && cachedUser) {
        try {
          const parsedUser = JSON.parse(cachedUser);
          setUser(parsedUser);
          const initialSection = getAccessibleSection(
            sectionFromPath(window.location.pathname),
            parsedUser
          );
          setCurrentSection(initialSection);
          if (initialSection === 'dashboard' && window.location.pathname !== '/') {
            window.history.replaceState({}, '', '/');
          }

          // Silently verify with backend
          const res = await authAPI.getMe();
          if (res?.user) {
            setUser(res.user);
            localStorage.setItem('user', JSON.stringify(res.user));
            const verifiedSection = getAccessibleSection(
              sectionFromPath(window.location.pathname),
              res.user
            );
            setCurrentSection(verifiedSection);
            if (verifiedSection === 'dashboard' && window.location.pathname !== '/') {
              window.history.replaceState({}, '', '/');
            }
          }
        } catch (err) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();

    const handleAuthLogout = () => {
      setUser(null);
      setCurrentSection('dashboard');
      setSelectedPropertyId(null);
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    const handlePopState = () => {
      const cachedUser = localStorage.getItem('user');
      const parsedUser = cachedUser ? JSON.parse(cachedUser) : null;
      const section = getAccessibleSection(
        sectionFromPath(window.location.pathname),
        parsedUser
      );
      setCurrentSection(section);
      if (section === 'dashboard' && window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleLoginSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    const section = getAccessibleSection(
      sectionFromPath(window.location.pathname),
      authenticatedUser
    );
    setCurrentSection(section);
    if (section === 'dashboard' && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setCurrentSection('dashboard');
    setSelectedPropertyId(null);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 w-screen h-screen bg-slate-950 overflow-hidden select-none">
        <img
          src={loadingImg}
          alt="PIXX TECHNOLOGIES Loading..."
          className="w-full h-full object-cover object-center"
        />
      </div>
    );
  }

  // Unauthenticated user -> Login view
  if (!user) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  // Main Application Layout View Switching
  const handleNavChange = (viewId) => {
    setCurrentSection(viewId);
    window.history.pushState({}, '', pathForSection(viewId));
    if (viewId !== 'property-detail') {
      setSelectedPropertyId(null);
    }
    if (viewId !== 'tenant-detail') {
      setSelectedTenantId(null);
    }
    if (viewId !== 'account-ledger') {
      setSelectedAccountId(null);
    }
  };

  const handleSelectProperty = (id) => {
    setSelectedPropertyId(id);
    setCurrentSection('property-detail');
  };

  const handleBackToProperties = () => {
    setSelectedPropertyId(null);
    setCurrentSection('properties');
  };

  const handleSelectTenant = (id) => {
    setSelectedTenantId(id);
    setCurrentSection('tenant-detail');
  };

  const handleBackToTenants = () => {
    setSelectedTenantId(null);
    setCurrentSection('tenants');
  };

  const handleSelectAccount = (id) => {
    setSelectedAccountId(id);
    setCurrentSection('account-ledger');
  };

  const handleBackToAccounts = () => {
    setSelectedAccountId(null);
    setCurrentSection('accounts');
  };

  return (
    <MainLayout
      user={user}
      currentView={
        currentSection === 'property-detail'
          ? 'properties'
          : currentSection === 'tenant-detail'
          ? 'tenants'
          : currentSection === 'account-ledger'
          ? 'accounts'
          : currentSection
      }
      onViewChange={handleNavChange}
      onLogout={handleLogout}
      onOpenTerminal={() => {
        setCurrentSection('operational');
        window.history.pushState({}, '', '/operational');
      }}
    >
      {currentSection === 'verification' && (isVerifier(user) || isAdmin(user)) ? (
        <VerifierDashboard
          user={user}
          onOpenMasterAccounts={() => setCurrentSection('accounts')}
          onOpenProperties={() => setCurrentSection('properties')}
        />
      ) : currentSection === 'expenses' || currentSection === 'operational' ? (
        isVerifier(user) ? (
          <VerifierDashboard
            user={user}
            onOpenMasterAccounts={() => setCurrentSection('accounts')}
            onOpenProperties={() => setCurrentSection('properties')}
          />
        ) : isAdmin(user) ? (
          <AdminPublisherDashboard
            user={user}
            onLogout={handleLogout}
            onSwitchToDataEntry={() => setCurrentSection('verification')}
          />
        ) : (
          <DataEntryDashboard user={user} />
        )
      ) : currentSection === 'users' && isAdmin(user) ? (
        <UserManager currentUser={user} />
      ) : currentSection === 'properties' ? (
        <PropertiesPage
          currentUser={user}
          onSelectProperty={handleSelectProperty}
        />
      ) : currentSection === 'property-detail' && selectedPropertyId ? (
        <PropertyDetailPage
          propertyId={selectedPropertyId}
          currentUser={user}
          onBack={handleBackToProperties}
        />
      ) : currentSection === 'tenants' ? (
        <TenantsPage
          currentUser={user}
          onSelectTenant={handleSelectTenant}
          onNavigateToAgreements={() => setCurrentSection('agreements')}
        />
      ) : currentSection === 'tenant-detail' && selectedTenantId ? (
        <TenantDetailPage
          tenantId={selectedTenantId}
          currentUser={user}
          onBack={handleBackToTenants}
        />
      ) : currentSection === 'agreements' ? (
        <AgreementsPage
          currentUser={user}
          onSelectTenant={handleSelectTenant}
        />
      ) : currentSection === 'rent-due' ? (
        <RentDuePage
          currentUser={user}
          onSelectTenant={handleSelectTenant}
        />
      ) : (currentSection === 'income' || currentSection === 'rent-received') ? (
        <RentReceivedPage
          currentUser={user}
          onNavigateToRentDue={() => setCurrentSection('rent-due')}
          onNavigateToAccounts={() => setCurrentSection('accounts')}
          onSelectTenant={handleSelectTenant}
        />
      ) : currentSection === 'other-income' ? (
        <OtherIncomePage
          currentUser={user}
          onNavigateToAccounts={() => setCurrentSection('accounts')}
          onNavigateToTransactions={() => setCurrentSection('transactions')}
        />
      ) : currentSection === 'chart-of-accounts' && isAdmin(user) ? (
        <ChartOfAccountsPage currentUser={user} />
      ) : currentSection === 'ledgers' ? (
        <LedgersPage currentUser={user} />
      ) : currentSection === 'accounts' || currentSection === 'settings' ? (
        <AccountsPage
          currentUser={user}
          onSelectAccount={handleSelectAccount}
          onNavigateToTransfers={() => setCurrentSection('transfers')}
        />
      ) : currentSection === 'account-ledger' && selectedAccountId ? (
        <AccountLedgerPage
          accountId={selectedAccountId}
          currentUser={user}
          onBack={handleBackToAccounts}
          onNavigateToTransfers={() => setCurrentSection('transfers')}
        />
      ) : currentSection === 'transfers' ? (
        <TransfersPage
          currentUser={user}
          onSelectAccount={handleSelectAccount}
        />
      ) : currentSection === 'transactions' ? (
        <TransactionsPage
          user={user}
        />
      ) : currentSection === 'reports' ? (
        <FinancialReportsPage
          currentUser={user}
        />
      ) : currentSection === 'monthly-reports' ? (
        <MonthlyReportsHistoryPage
          currentUser={user}
        />
      ) : currentSection === 'staff' ? (
        <StaffPage
          currentUser={user}
        />
      ) : (
        <DashboardHome
          user={user}
          onNavigateToUsers={() => setCurrentSection('users')}
          onNavigateToProperties={() => setCurrentSection('properties')}
          onNavigateToTenants={() => setCurrentSection('tenants')}
          onNavigateToAgreements={() => setCurrentSection('agreements')}
          onNavigateToRentDue={() => setCurrentSection('rent-due')}
          onNavigateToRentReceived={() => setCurrentSection('income')}
          onNavigateToOtherIncome={() => setCurrentSection('other-income')}
          onNavigateToAccounts={() => setCurrentSection('accounts')}
          onNavigateToTransfers={() => setCurrentSection('transfers')}
          onNavigateToTransactions={() => setCurrentSection('transactions')}
          onNavigateToReports={() => setCurrentSection('reports')}
          onOpenTerminal={() => setCurrentSection('operational')}
        />
      )}
    </MainLayout>
  );
}

export default App;
