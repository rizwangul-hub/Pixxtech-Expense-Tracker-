import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { storage } from './storage';

// Determine the authoritative API Base URL
const rawEnvUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const normalizedUrl = rawEnvUrl ? rawEnvUrl.replace(/\/+$/, '') : 'https://pixxtech-expense-tracker.vercel.app';

export const API_BASE_URL = normalizedUrl.endsWith('/api')
  ? normalizedUrl
  : `${normalizedUrl}/api`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Listener type for 401 unauthorized session expiration
type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

export const setSessionExpiredHandler = (handler: SessionExpiredHandler | null) => {
  sessionExpiredHandler = handler;
};

// Request Interceptor: Attach JWT Token from SecureStore
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await storage.getToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('[API Interceptor] Failed to attach auth token:', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthorized / Token Expiration
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response && error.response.status === 401) {
      console.warn('[API Interceptor] 401 Unauthorized encountered. Expiring session...');
      await storage.clearAuth();
      if (sessionExpiredHandler) {
        sessionExpiredHandler();
      }
    }
    return Promise.reject(error);
  }
);

// ==================== TYPE DEFINITIONS ====================

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'DATA_ENTRY' | 'VERIFIER' | 'VERIFICATION_MANAGER' | 'ADMIN_PUBLISHER';
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  user: UserProfile;
}

export interface MeResponse {
  success: boolean;
  user: UserProfile;
}

export interface AccountItem {
  _id: string;
  name: string;
  type: 'BANK' | 'CASH';
  accountNumber?: string;
  bankName?: string;
  cashHolder?: string;
  currentBalance: number;
  closingBalance?: number;
  isCashCustodian?: boolean;
  balanceStatus?: 'HEALTHY' | 'LOW' | 'NEGATIVE';
}

export interface PropertyItem {
  _id: string;
  plazaName: string;
  location?: string;
  totalMonthlyRentRoll?: number;
  units?: Array<{
    _id: string;
    unitName: string;
    agreedRent?: number;
    tenantName?: string;
  }>;
}

export interface PlazaUnitItem {
  _id: string;
  unitName: string;
  tenantName?: string;
  dueDay?: number;
  agreedRent: number;
  paidThisMonth: number;
  balanceDue: number;
  isFullyPaid: boolean;
  defaultReceivingAccount?: {
    _id: string;
    name: string;
    type: string;
    accountNumber?: string;
  };
  isActive?: boolean;
}

export interface CategoryItem {
  _id: string;
  name: string;
  type: 'EXPENSE' | 'INCOME';
  expenseClassification?: 'GENERAL_EXPENSE' | 'PROPERTY_OWN_EXPENSE' | 'UNIT_EXPENSE';
  propertyId?: { _id: string; plazaName?: string } | string | null;
  unitId?: { _id: string; unitName?: string } | string | null;
  isRentalHead?: boolean;
}

export interface TransactionItem {
  _id: string;
  voucherNo: string;
  date: string;
  detail: string;
  amount: number;
  transactionType?: 'EXPENSE' | 'RENT' | 'INCOME' | 'TRANSFER';
  categoryId?: { _id: string; name: string } | null;
  drAccountId?: { _id: string; name: string; type?: string } | null;
  crAccountId?: { _id: string; name: string; type?: string } | null;
  propertyId?: { _id: string; plazaName?: string } | null;
  unitId?: string | null;
  expenseClassification?: string;
  status?: string;
  createdBy?: { _id: string; name: string; email: string } | null;
  createdAt: string;
  notes?: string;
  attachments?: string[];
}

export interface PendingEntryItem {
  _id: string;
  entryType: 'EXPENSE' | 'RENT' | 'TRANSFER';
  amount: number;
  date: string;
  voucherNo?: string;
  detail: string;
  status: 'PENDING_VERIFICATION' | 'EDITED' | 'VERIFIED' | 'REJECTED';
  rentMonth?: string;
  propertyId?: { _id: string; plazaName?: string } | null;
  unitId?: string | null;
  tenantId?: { _id: string; fullName?: string } | null;
  categoryId?: { _id: string; name: string } | null;
  drAccountId?: { _id: string; name: string } | null;
  crAccountId?: { _id: string; name: string } | null;
  receivingAccountId?: { _id: string; name: string } | null;
  expenseClassification?: string;
  submittedBy?: { _id: string; name: string; email: string } | null;
  submittedByName?: string;
  submittedAt: string;
  auditLog?: Array<{
    action: string;
    performedBy: string;
    timestamp: string;
    notes?: string;
  }>;
  attachments?: string[];
  rejectionReason?: string;
}

// ==================== API MODULES ====================

export const authAPI = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await apiClient.post<LoginResponse>('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    return res.data;
  },

  async getMe(): Promise<MeResponse> {
    const res = await apiClient.get<MeResponse>('/auth/me');
    return res.data;
  },

  async checkHealth(): Promise<{ status: string; service: string }> {
    const res = await apiClient.get('/health');
    return res.data;
  },
};

export const accountsAPI = {
  /**
   * Get active accounts grouped into banks and cash custodians with balances
   */
  async getActiveSummary(): Promise<{
    success: boolean;
    totalAccounts: number;
    accounts: AccountItem[];
    grouped: {
      banks: AccountItem[];
      custodians: AccountItem[];
      other: AccountItem[];
    };
  }> {
    const res = await apiClient.get('/accounts/active-summary');
    return res.data;
  },

  /**
   * Get properties list for selection
   */
  async getProperties(): Promise<{
    success: boolean;
    count: number;
    properties: PropertyItem[];
  }> {
    const res = await apiClient.get('/accounts/properties-list');
    return res.data;
  },

  /**
   * Get categories/heads list with optional classification & scoping
   */
  async getCategories(params: {
    type?: string;
    expenseClassification?: string;
    propertyId?: string;
    unitId?: string;
  } = {}): Promise<{
    success: boolean;
    count: number;
    categories: CategoryItem[];
  }> {
    const res = await apiClient.get('/accounts/categories-list', { params });
    return res.data;
  },

  /**
   * Resolve or create canonical expense head
   */
  async createCategory(data: {
    name: string;
    propertyId?: string | null;
    unitId?: string | null;
    expenseClassification?: string;
  }): Promise<{
    success: boolean;
    data?: { category: CategoryItem };
    category?: CategoryItem;
    message: string;
  }> {
    const res = await apiClient.post('/accounts/categories', data);
    return res.data;
  },
};

export const rentAPI = {
  /**
   * Fetch units for a plaza with tenant info, agreed rent, and balance due
   */
  async getPlazaUnits(
    propertyId: string,
    month?: string
  ): Promise<{
    success: boolean;
    property: { _id: string; plazaName: string; totalMonthlyRentRoll?: number };
    targetMonth: string;
    units: PlazaUnitItem[];
  }> {
    const params = month ? { month } : {};
    const res = await apiClient.get(`/rent/plaza-units/${propertyId}`, { params });
    return res.data;
  },

  /**
   * Collect / record rent (for DATA_ENTRY, saves as temporary PENDING_VERIFICATION entry)
   */
  async collectRent(data: {
    propertyId: string;
    unitId: string;
    rentMonth: string;
    receivingAccountId: string;
    amountPaid: number;
    paymentDate?: string;
    notes?: string;
    attachments?: string[];
  }): Promise<{
    success: boolean;
    isPending?: boolean;
    message: string;
    pendingEntry?: PendingEntryItem;
    voucher?: { voucherNo: string };
  }> {
    const res = await apiClient.post('/rent/collect', data);
    return res.data;
  },
};

export const transactionsAPI = {
  /**
   * Suggest the next sequential voucher number
   */
  async suggestVoucherNo(month?: string): Promise<{
    success: boolean;
    suggestedVoucherNo: string;
    totalVouchersInPeriod?: number;
  }> {
    const params = month ? { month } : {};
    const res = await apiClient.get('/transactions/suggest-vn', { params });
    return res.data;
  },

  /**
   * Record expense voucher (for DATA_ENTRY, creates a PENDING_VERIFICATION entry)
   */
  async recordVoucher(data: {
    date: string;
    voucherNo: string;
    detail: string;
    categoryId: string;
    drAccountId?: string;
    crAccountId: string;
    amount: number;
    propertyId?: string | null;
    unitId?: string | null;
    expenseClassification?: string;
    expenseScope?: string;
    propertyExpenseType?: string;
    attachments?: string[];
    rentMonth?: string | null;
  }): Promise<{
    success: boolean;
    isPending?: boolean;
    message: string;
    pendingEntry?: PendingEntryItem;
    transaction?: TransactionItem;
  }> {
    const res = await apiClient.post('/transactions/voucher', data);
    return res.data;
  },

  /**
   * Get transactions entered by the authenticated user
   */
  async getMyEntries(): Promise<{
    success: boolean;
    count: number;
    transactions: TransactionItem[];
  }> {
    const res = await apiClient.get('/transactions/my-entries');
    return res.data;
  },

  /**
   * Update a pending transaction before verification
   */
  async updatePending(
    id: string,
    data: { detail?: string; checkedBy?: string; notes?: string }
  ): Promise<{
    success: boolean;
    message: string;
    transaction: TransactionItem;
  }> {
    const res = await apiClient.put(`/transactions/${id}`, data);
    return res.data;
  },

  /**
   * Delete pending entry or reverse recorded transaction
   */
  async deleteTransaction(id: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const res = await apiClient.delete(`/transactions/${id}`);
    return res.data;
  },
};

export const verificationAPI = {
  /**
   * Get pending submissions entered by the authenticated Data Entry user
   */
  async getMySubmissions(): Promise<{
    success: boolean;
    message?: string;
    data: PendingEntryItem[];
  }> {
    const res = await apiClient.get('/verification/my-submissions');
    return res.data;
  },

  /**
   * Get single pending entry by ID
   */
  async getPendingEntryById(id: string): Promise<{
    success: boolean;
    entry: PendingEntryItem;
  }> {
    const res = await apiClient.get(`/verification/${id}`);
    return res.data;
  },

  /**
   * Get pending entries queue (Admin / Verification Manager)
   */
  async getPending(params: {
    status?: string;
    entryType?: string;
    propertyId?: string;
    tenantId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    success: boolean;
    data: {
      entries: PendingEntryItem[];
      pagination: {
        total: number;
        page: number;
        pages: number;
        limit: number;
      };
    };
    message?: string;
  }> {
    const res = await apiClient.get('/verification/pending', { params });
    return res.data;
  },

  /**
   * Get verification summary counters / KPIs
   */
  async getSummary(): Promise<{
    success: boolean;
    message?: string;
    data: {
      pendingRentCount: number;
      pendingExpenseCount: number;
      pendingTransferCount?: number;
      totalPendingCount: number;
      submittedTodayCount: number;
      submittedBySarfrazCount: number;
      recentlyVerifiedCount: number;
      recentlyRejectedCount: number;
    };
  }> {
    const res = await apiClient.get('/verification/summary');
    return res.data;
  },

  /**
   * Verify and officially post a pending entry to the central ledger
   */
  async verifyEntry(id: string): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    const res = await apiClient.post(`/verification/${id}/verify`);
    return res.data;
  },

  /**
   * Reject a pending entry
   */
  async rejectEntry(id: string, reason: string = 'Entry rejected by auditor'): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    const res = await apiClient.post(`/verification/${id}/reject`, { rejectionReason: reason });
    return res.data;
  },

  /**
   * Update a pending entry before verification
   */
  async updatePendingEntry(
    id: string,
    data: {
      amount?: number;
      detail?: string;
      voucherNo?: string;
      date?: string;
      rentMonth?: string;
      editNotes?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    data: PendingEntryItem;
  }> {
    const res = await apiClient.put(`/verification/${id}`, data);
    return res.data;
  },

  /**
   * Delete a pending entry
   */
  async deletePendingEntry(id: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const res = await apiClient.delete(`/verification/${id}`);
    return res.data;
  },
};

export const adminAPI = {
  /**
   * Get macro financial figures for a given month
   */
  async getFinancialAtAGlance(month?: string): Promise<{
    success: boolean;
    period: string;
    macro: {
      totalRentalIncomeReceived: number;
      totalOtherReceipts: number;
      totalAmountAvailable: number;
      totalNetExpenses: number;
      closingAvailableBalance: number;
      netPosition: number;
    };
    audit?: any;
    matrix?: any;
  }> {
    const params = month ? { month } : {};
    const res = await apiClient.get('/admin/financial-at-a-glance', { params });
    return res.data;
  },

  /**
   * Get master ledger transactions with multi-filter & pagination
   */
  async getMasterLedger(params: {
    month?: string;
    search?: string;
    status?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    success: boolean;
    totalAmount: number;
    pagination: {
      total: number;
      page: number;
      pages: number;
      limit: number;
    };
    transactions: TransactionItem[];
  }> {
    const res = await apiClient.get('/admin/master-ledger', { params });
    return res.data;
  },

  /**
   * Get rental income summary by property for a given month
   */
  async getRentalIncomeSummary(month?: string): Promise<any> {
    const params = month ? { month } : {};
    const res = await apiClient.get('/admin/rental-income-summary', { params });
    return res.data;
  },

  /**
   * Get head-wise expense summary
   */
  async getHeadWiseExpenses(month?: string): Promise<any> {
    const params = month ? { month } : {};
    const res = await apiClient.get('/admin/head-wise-summary', { params });
    return res.data;
  },
};

export const reportsAPI = {
  /**
   * Get monthly financial summary report (Opening/Closing Balance Detail, Bank & Cash Matrix)
   */
  async getMonthlyFinancialSummary(month?: string): Promise<{
    success: boolean;
    period: string;
    accountMatrix: {
      accounts: Array<{
        accountId: string;
        accountName: string;
        accountType: 'BANK' | 'CASH';
        accountNumber?: string;
        openingBalance: number;
        totalInput: number;
        totalOutput: number;
        closingBalance: number;
      }>;
      bankRows: Array<{
        accountId: string;
        accountName: string;
        accountType: string;
        accountNumber?: string;
        openingBalance: number;
        rentalIncome: number;
        otherInput: number;
        totalInput: number;
        rentalExpenses: number;
        otherExpenses: number;
        totalOutput: number;
        closingBalance: number;
      }>;
      cashRows: Array<{
        accountId: string;
        accountName: string;
        accountType: string;
        openingBalance: number;
        rentalIncome: number;
        otherInput: number;
        totalInput: number;
        rentalExpenses: number;
        otherExpenses: number;
        totalOutput: number;
        closingBalance: number;
      }>;
      grandTotal: {
        openingBalance: number;
        rentalIncome: number;
        otherInput: number;
        totalInput: number;
        rentalExpenses: number;
        otherExpenses: number;
        totalOutput: number;
        closingBalance: number;
      };
      totalBankBalance: number;
      totalCashBalance: number;
      grandClosingBalance: number;
    };
    rentalIncomeSummary?: any;
    otherIncomeSummary?: any;
    expenseSummary?: any;
    financialPosition: {
      totalRentalIncome: number;
      totalOtherIncome: number;
      totalIncome: number;
      totalExpenses: number;
      netSurplusDeficit: number;
      totalTransfers: number;
      grandClosingBalance: number;
    };
  }> {
    const params = month ? { month } : {};
    const res = await apiClient.get('/reports/monthly-financial-summary', { params });
    return res.data;
  },

  /**
   * Get rental income summary grouped by property / plaza with units
   */
  async getRentalIncomeSummary(month?: string): Promise<{
    success: boolean;
    period: string;
    grandTotals: {
      totalAgreedRent: number;
      totalPriorReceivable: number;
      totalCurrentDue: number;
      totalReceivedAmount: number;
      totalOutstandingReceivable: number;
      totalAdvanceRentReceived: number;
      collectionRate: number;
    };
    plazas: Array<{
      plazaId: string;
      plazaName: string;
      plazaLocation?: string;
      subtotalAgreedRent: number;
      subtotalReceived: number;
      subtotalReceivable: number;
      subtotalAdvance: number;
      units: Array<{
        unitId: string;
        unitName: string;
        tenantName: string;
        dueDay?: string | number;
        agreedRent: number;
        priorMonthReceivable: number;
        currentMonthActualRent: number;
        receivedAmount: number;
        receivedDate?: string;
        receivingAccountName?: string;
        renewalDate?: string;
        outstandingReceivable: number;
        advanceRentReceived: number;
        statusBadge: string;
        checkedBy?: string;
      }>;
    }>;
  }> {
    const params = month ? { month } : {};
    const res = await apiClient.get('/admin/rental-income-summary', { params });
    return res.data;
  },

  /**
   * Get head-wise expense summary with 3-tier classification totals
   */
  async getHeadWiseSummary(month?: string): Promise<{
    success: boolean;
    periodName: string;
    totalExpensesOverall: number;
    classificationTotals: {
      generalExpenses: number;
      propertyOwnExpenses: number;
      unitExpenses: number;
    };
    heads: Array<{
      categoryId: string;
      headName: string;
      isRentalHead: boolean;
      totalSpent: number;
      transactionCount: number;
    }>;
  }> {
    const params = month ? { month } : {};
    const res = await apiClient.get('/admin/head-wise-summary', { params });
    return res.data;
  },

  /**
   * Get all transactions report with full filter set
   */
  async getAllTransactions(params: {
    month?: string;
    startDate?: string;
    endDate?: string;
    accountId?: string;
    categoryId?: string;
    propertyId?: string;
    type?: string;
    search?: string;
  } = {}): Promise<{
    success: boolean;
    summary: {
      totalAmount: number;
      count: number;
    };
    transactions: TransactionItem[];
  }> {
    const res = await apiClient.get('/reports/all-transactions', { params });
    return res.data;
  },

  /**
   * Get authenticated URL for monthly funds PDF
   */
  async getFundsPDFUrl(month: string = '2026-08'): Promise<string> {
    const token = await storage.getToken();
    return `${API_BASE_URL}/reports/funds-management-pdf?month=${month}&token=${token || ''}`;
  },

  /**
   * Get authenticated URL for single voucher PDF
   */
  async getVoucherPDFUrl(voucherId: string): Promise<string> {
    const token = await storage.getToken();
    return `${API_BASE_URL}/vouchers/download-pdf/${voucherId}?token=${token || ''}`;
  },
};

export const propertiesAPI = {
  /**
   * Get properties list with units
   */
  async getProperties(): Promise<{
    success: boolean;
    data: PropertyItem[];
    message?: string;
  }> {
    const res = await apiClient.get('/properties');
    return res.data;
  },

  /**
   * Get single property by ID
   */
  async getPropertyById(id: string): Promise<{
    success: boolean;
    data: PropertyItem;
  }> {
    const res = await apiClient.get(`/properties/${id}`);
    return res.data;
  },
};

// Add getAccountLedger to accountsAPI
export const accountLedgersAPI = {
  /**
   * Fetch running statement & ledger for a specific account
   */
  async getAccountLedger(
    accountId: string,
    params: { month?: string; startDate?: string; endDate?: string } = {}
  ): Promise<{
    success: boolean;
    message?: string;
    data: {
      account: AccountItem;
      ledgerEntries: Array<{
        _id: string;
        date: string;
        voucherNo: string;
        detail: string;
        drAmount: number;
        crAmount: number;
        runningBalance: number;
        reference?: string;
        status?: string;
      }>;
      summary: {
        openingBalance: number;
        totalMoneyIn: number;
        totalMoneyOut: number;
        closingBalance: number;
        currentBalance: number;
        transactionCount: number;
        filteredPeriod: string;
      };
    };
  }> {
    const res = await apiClient.get(`/accounts/${accountId}/ledger`, { params });
    return res.data;
  },
};

export const staffAPI = {
  async getEmployees(): Promise<any> {
    const res = await apiClient.get('/staff/employees');
    return res.data;
  },
  async createEmployee(data: any): Promise<any> {
    const res = await apiClient.post('/staff/employees', data);
    return res.data;
  },
  async deleteEmployee(id: string): Promise<any> {
    const res = await apiClient.delete(`/staff/employees/${id}`);
    return res.data;
  },
};

export const tenantsAPI = {
  async getTenants(): Promise<any> {
    const res = await apiClient.get('/tenants');
    return res.data;
  },
};

export const agreementsAPI = {
  async getAgreements(): Promise<any> {
    const res = await apiClient.get('/agreements');
    return res.data;
  },
};

export const otherIncomeAPI = {
  async getAllOtherIncome(): Promise<any> {
    const res = await apiClient.get('/other-income');
    return res.data;
  },
};

export const transfersAPI = {
  async getTransfers(): Promise<any> {
    const res = await apiClient.get('/transfers');
    return res.data;
  },
};

export const usersAPI = {
  async getUsers(): Promise<any> {
    const res = await apiClient.get('/users');
    return res.data;
  },
  async toggleUserStatus(id: string): Promise<any> {
    const res = await apiClient.patch(`/users/${id}/status`);
    return res.data;
  },
};

export default apiClient;
