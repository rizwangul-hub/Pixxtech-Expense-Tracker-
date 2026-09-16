import axios from 'axios';

const configuredApiURL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
const apiBaseURL = configuredApiURL
  ? `${configuredApiURL.replace(/\/api$/i, '')}/api`
  : '/api';

const api = axios.create({
  baseURL: apiBaseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const uploadAPI = {
  images: async (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));
    const res = await api.post('/uploads/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

// Request interceptor: attach JWT token if present in localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: catch 401 unauthenticated
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Dispatch custom event so React app knows user was logged out
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
};

export const usersAPI = {
  getUsers: async () => {
    const res = await api.get('/users');
    return res.data;
  },
  createUser: async (userData) => {
    const res = await api.post('/users', userData);
    return res.data;
  },
  toggleUserStatus: async (id) => {
    const res = await api.patch(`/users/${id}/status`);
    return res.data;
  },
};

export const propertiesAPI = {
  getProperties: async (params = {}) => {
    const res = await api.get('/properties', { params });
    return res.data;
  },
  getPropertyById: async (id) => {
    const res = await api.get(`/properties/${id}`);
    return res.data;
  },
  createProperty: async (propertyData) => {
    const res = await api.post('/properties', propertyData);
    return res.data;
  },
  updateProperty: async (id, propertyData) => {
    const res = await api.put(`/properties/${id}`, propertyData);
    return res.data;
  },
  togglePropertyStatus: async (id) => {
    const res = await api.patch(`/properties/${id}/status`);
    return res.data;
  },
  getPropertyUnits: async (id, params = {}) => {
    const res = await api.get(`/properties/${id}/units`, { params });
    return res.data;
  },
  addUnit: async (propertyId, unitData) => {
    const res = await api.post(`/properties/${propertyId}/units`, unitData);
    return res.data;
  },
};

export const unitsAPI = {
  getUnitById: async (id) => {
    const res = await api.get(`/units/${id}`);
    return res.data;
  },
  updateUnit: async (id, unitData) => {
    const res = await api.put(`/units/${id}`, unitData);
    return res.data;
  },
  toggleUnitStatus: async (id, statusData) => {
    const res = await api.patch(`/units/${id}/status`, statusData);
    return res.data;
  },
};

export const tenantsAPI = {
  getTenants: async (params = {}) => {
    const res = await api.get('/tenants', { params });
    return res.data;
  },
  getTenantById: async (id) => {
    const res = await api.get(`/tenants/${id}`);
    return res.data;
  },
  createTenant: async (data) => {
    const res = await api.post('/tenants', data);
    return res.data;
  },
  updateTenant: async (id, data) => {
    const res = await api.put(`/tenants/${id}`, data);
    return res.data;
  },
  toggleTenantStatus: async (id) => {
    const res = await api.patch(`/tenants/${id}/status`);
    return res.data;
  },
};

export const agreementsAPI = {
  getAgreements: async (params = {}) => {
    const res = await api.get('/agreements', { params });
    return res.data;
  },
  getAgreementById: async (id) => {
    const res = await api.get(`/agreements/${id}`);
    return res.data;
  },
  getNextNumber: async () => {
    const res = await api.get('/agreements/next-number');
    return res.data;
  },
  createAgreement: async (data) => {
    const res = await api.post('/agreements', data);
    return res.data;
  },
  updateAgreement: async (id, data) => {
    const res = await api.put(`/agreements/${id}`, data);
    return res.data;
  },
  toggleAgreementStatus: async (id, statusData) => {
    const res = await api.patch(`/agreements/${id}/status`, statusData);
    return res.data;
  },
};

export const rentDueAPI = {
  getRentDue: async (params = {}) => {
    const res = await api.get('/rent-due', { params });
    return res.data;
  },
  getRentDueSummary: async (params = {}) => {
    const res = await api.get('/rent-due/summary', { params });
    return res.data;
  },
  generateRentDue: async (data) => {
    const res = await api.post('/rent-due/generate', data);
    return res.data;
  },
  getRentDueById: async (id) => {
    const res = await api.get(`/rent-due/${id}`);
    return res.data;
  },
};

export const transactionsAPI = {
  recordVoucher: async (voucherData) => {
    const res = await api.post('/transactions/voucher', voucherData);
    return res.data;
  },
  getMyEntries: async () => {
    const res = await api.get('/transactions/my-entries');
    return res.data;
  },
  suggestVoucherNo: async (month) => {
    const params = month ? { month } : {};
    const res = await api.get('/transactions/suggest-vn', { params });
    return res.data;
  },
  updatePending: async (id, data) => {
    const res = await api.put(`/transactions/${id}`, data);
    return res.data;
  },
};

export const rentAPI = {
  collectRent: async (data) => {
    const res = await api.post('/rent/collect', data);
    return res.data;
  },
  getPlazaUnits: async (propertyId, month) => {
    const params = month ? { month } : {};
    const res = await api.get(`/rent/plaza-units/${propertyId}`, { params });
    return res.data;
  },
};

export const rentReceivedAPI = {
  getRentReceipts: async (params = {}) => {
    const res = await api.get('/rent-received', { params });
    return res.data;
  },
  getRentReceiptById: async (id) => {
    const res = await api.get(`/rent-received/${id}`);
    return res.data;
  },
  recordRentReceived: async (data) => {
    const res = await api.post('/rent-received', data);
    return res.data;
  },
  getSummary: async (params = {}) => {
    const res = await api.get('/rent-received/summary', { params });
    return res.data;
  },
  getPropertySummary: async (params = {}) => {
    const res = await api.get('/rent-received/property-summary', { params });
    return res.data;
  },
  getAccountSummary: async (params = {}) => {
    const res = await api.get('/rent-received/account-summary', { params });
    return res.data;
  },
  getTenantActiveLease: async (tenantId, params = {}) => {
    const res = await api.get(`/rent-received/tenant-lease/${tenantId}`, { params });
    return res.data;
  },
  reverseReceipt: async (id, data = {}) => {
    const res = await api.patch(`/rent-received/${id}/reverse`, data);
    return res.data;
  },
};

export const vouchersAPI = {
  getAllTransactions: async (params = {}) => {
    const res = await api.get('/vouchers/transactions', { params });
    return res.data;
  },
  getVoucherById: async (id) => {
    const res = await api.get(`/vouchers/${id}`);
    return res.data;
  },
  getVoucherByNumber: async (voucherNo) => {
    const res = await api.get(`/vouchers/number/${voucherNo}`);
    return res.data;
  },
  createVoucher: async (data) => {
    const res = await api.post('/vouchers', data);
    return res.data;
  },
  suggestNextVoucherNo: async () => {
    const res = await api.get('/vouchers/suggest-vn');
    return res.data;
  },
  reverseVoucher: async (id, data = {}) => {
    const res = await api.patch(`/vouchers/${id}/reverse`, data);
    return res.data;
  },
  syncLegacy: async () => {
    const res = await api.post('/vouchers/sync-legacy');
    return res.data;
  },
  getPrintDetail: async (id) => {
    const res = await api.get(`/vouchers/print-detail/${id}`);
    return res.data;
  },
  downloadSingleVoucherPDF: async (id, voucherNo) => {
    const res = await api.get(`/vouchers/download-pdf/${id}`, {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Voucher_${voucherNo || id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  },
  printSingleVoucherPDF: async (id) => {
    const res = await api.get(`/vouchers/download-pdf/${id}`, {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const blobUrl = window.URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.src = blobUrl;

    document.body.appendChild(iframe);

    return new Promise((resolve) => {
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch (e) {
            console.error('Iframe print failed, falling back to window.open:', e);
            window.open(blobUrl, '_blank');
          }
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
            window.URL.revokeObjectURL(blobUrl);
            resolve(true);
          }, 60000);
        }, 500);
      };
    });
  },
};

export const accountsAPI = {
  getAccounts: async (params = {}) => {
    const res = await api.get('/accounts', { params });
    return res.data;
  },
  getAccountById: async (id) => {
    const res = await api.get(`/accounts/${id}`);
    return res.data;
  },
  createAccount: async (data) => {
    const res = await api.post('/accounts', data);
    return res.data;
  },
  updateAccount: async (id, data) => {
    const res = await api.put(`/accounts/${id}`, data);
    return res.data;
  },
  toggleAccountStatus: async (id) => {
    const res = await api.patch(`/accounts/${id}/status`);
    return res.data;
  },
  getAccountLedger: async (id, params = {}) => {
    const res = await api.get(`/accounts/${id}/ledger`, { params });
    return res.data;
  },
  getMonthlySummary: async (params = {}) => {
    const res = await api.get('/accounts/monthly-summary', { params });
    return res.data;
  },
  getActiveSummary: async () => {
    const res = await api.get('/accounts/active-summary');
    return res.data;
  },
  getCategories: async () => {
    const res = await api.get('/accounts/categories-list');
    return res.data;
  },
  createCategory: async (data) => {
    const res = await api.post('/accounts/categories', data);
    return res.data;
  },
  getProperties: async () => {
    const res = await api.get('/accounts/properties-list');
    return res.data;
  },
};

export const transfersAPI = {
  getTransfers: async (params = {}) => {
    const res = await api.get('/transfers', { params });
    return res.data;
  },
  getTransferById: async (id) => {
    const res = await api.get(`/transfers/${id}`);
    return res.data;
  },
  executeTransfer: async (data) => {
    const res = await api.post('/transfers', data);
    return res.data;
  },
};

export const adminAPI = {
  getFinancialAtAGlance: async (month) => {
    const params = month ? { month } : {};
    const res = await api.get('/admin/financial-at-a-glance', { params });
    return res.data;
  },
  getMasterLedger: async (params = {}) => {
    const res = await api.get('/admin/master-ledger', { params });
    return res.data;
  },
  verifyTransaction: async (id) => {
    const res = await api.patch(`/admin/transactions/${id}/verify`);
    return res.data;
  },
  updateTransaction: async (id, data) => {
    const res = await api.put(`/admin/transactions/${id}`, data);
    return res.data;
  },
  deleteTransaction: async (id) => {
    const res = await api.delete(`/admin/transactions/${id}`);
    return res.data;
  },
  getRentalIncomeSummary: async (month) => {
    const params = month ? { month } : {};
    const res = await api.get('/admin/rental-income-summary', { params });
    return res.data;
  },
  getAccountReconciliation: async (accountId, month) => {
    const params = month ? { month } : {};
    const res = await api.get(`/admin/reconcile/account-statement/${accountId}`, { params });
    return res.data;
  },
  getHeadWiseExpenses: async (month) => {
    const params = month ? { month } : {};
    const res = await api.get('/admin/head-wise-summary', { params });
    return res.data;
  },
};

export const reportsAPI = {
  downloadFundsReportPDF: async (month) => {
    const params = month ? { month } : {};
    const res = await api.get('/reports/funds-management-pdf', {
      params,
      responseType: 'blob', // Important for handling binary PDF stream
    });

    // Create a Blob URL and trigger automatic browser file download
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Pixx_Technologies_Funds_Report_${month || 'August-2026'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  },
};

export const otherIncomeAPI = {
  getHeads: async (params = {}) => {
    const res = await api.get('/other-income/heads', { params });
    return res.data;
  },
  createHead: async (data) => {
    const res = await api.post('/other-income/heads', data);
    return res.data;
  },
  updateHead: async (id, data) => {
    const res = await api.put(`/other-income/heads/${id}`, data);
    return res.data;
  },
  getAll: async (params = {}) => {
    const res = await api.get('/other-income', { params });
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/other-income/${id}`);
    return res.data;
  },
  record: async (data) => {
    const res = await api.post('/other-income', data);
    return res.data;
  },
  getMonthlySummary: async (params = {}) => {
    const res = await api.get('/other-income/monthly-summary', { params });
    return res.data;
  },
  reverse: async (id, data = {}) => {
    const res = await api.post(`/other-income/${id}/reverse`, data);
    return res.data;
  },
};

// Financial Reports, Ledgers, Summaries & Exports
export const financialReportsAPI = {
  getMonthlySummary: async (month) => {
    const params = month ? { month } : {};
    const res = await api.get('/reports/monthly-financial-summary', { params });
    return res.data;
  },
  getAccountLedger: async (accountId, params = {}) => {
    const res = await api.get(`/reports/account-ledger/${accountId}`, { params });
    return res.data;
  },
  getExpenseSummary: async (params = {}) => {
    const res = await api.get('/reports/expense-summary', { params });
    return res.data;
  },
  getPropertyExpense: async (params = {}) => {
    const res = await api.get('/reports/property-expense', { params });
    return res.data;
  },
  getAllTransactions: async (params = {}) => {
    const res = await api.get('/reports/all-transactions', { params });
    return res.data;
  },
  getReconciliation: async (params = {}) => {
    const res = await api.get('/reports/reconciliation', { params });
    return res.data;
  },
  downloadPDF: async (month) => {
    const params = month ? { month } : {};
    const res = await api.get('/reports/funds-management-pdf', {
      params,
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Pixx_Technologies_Funds_Report_${month || 'Monthly'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  },
  downloadExcel: async (params = {}) => {
    const res = await api.get('/reports/export/excel', {
      params,
      responseType: 'blob',
    });
    const type = params.type || 'report';
    const period = params.month || 'All';
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Pixx_${type}_${period}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  },
  downloadCSV: async (params = {}) => {
    const res = await api.get('/reports/export/csv', {
      params,
      responseType: 'blob',
    });
    const type = params.type || 'report';
    const period = params.month || 'All';
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Pixx_${type}_${period}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  },
};

// Monthly Report Lifecycle, Status & Audit
export const monthlyReportsAPI = {
  getReports: async () => {
    const res = await api.get('/monthly-reports');
    return res.data;
  },
  getReportByMonth: async (month) => {
    const res = await api.get(`/monthly-reports/${month}`);
    return res.data;
  },
  generateReport: async (data) => {
    const res = await api.post('/monthly-reports/generate', data);
    return res.data;
  },
  validateReconciliation: async (month) => {
    const res = await api.get(`/monthly-reports/${month}/validate`);
    return res.data;
  },
  updateStatus: async (month, data) => {
    const res = await api.patch(`/monthly-reports/${month}/status`, data);
    return res.data;
  },
};

// Verification & Temporary Pending Entries API (Sarfraz -> Khurshid Anwar -> Central Ledger)
export const verificationAPI = {
  getPending: async (params = {}) => {
    const res = await api.get('/verification/pending', { params });
    return res.data;
  },
  getSummary: async () => {
    const res = await api.get('/verification/summary');
    return res.data;
  },
  getMySubmissions: async () => {
    const res = await api.get('/verification/my-submissions');
    return res.data;
  },
  getEntryById: async (id) => {
    const res = await api.get(`/verification/${id}`);
    return res.data;
  },
  submitPending: async (data) => {
    const res = await api.post('/verification/submit', data);
    return res.data;
  },
  updatePending: async (id, data) => {
    const res = await api.put(`/verification/${id}`, data);
    return res.data;
  },
  verifyEntry: async (id) => {
    const res = await api.post(`/verification/${id}/verify`);
    return res.data;
  },
  rejectEntry: async (id, reason = '') => {
    const res = await api.post(`/verification/${id}/reject`, { rejectionReason: reason });
    return res.data;
  },
  deletePending: async (id) => {
    const res = await api.delete(`/verification/${id}`);
    return res.data;
  },
};

// Central Ledger API
export const ledgersAPI = {
  getEntities: async (type) => {
    const params = type ? { type } : {};
    const res = await api.get('/ledgers/entities', { params });
    return res.data;
  },
  queryLedger: async (params = {}) => {
    const res = await api.get('/ledgers/query', { params });
    return res.data;
  },
};

export default api;
