import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  accountsAPI,
  accountLedgersAPI,
  AccountItem,
} from '@/services/api';

const formatPKR = (val?: number): string => {
  if (val === undefined || val === null || isNaN(val)) return 'Rs. 0.00';
  const isNeg = val < 0;
  const formatted = 'Rs. ' + Math.abs(val).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNeg ? `(${formatted})` : formatted;
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export default function LedgersScreen() {
  const router = useRouter();
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();

  // Accounts grouped
  const [banks, setBanks] = useState<AccountItem[]>([]);
  const [custodians, setCustodians] = useState<AccountItem[]>([]);
  const [allAccounts, setAllAccounts] = useState<AccountItem[]>([]);
  const [activeAccountType, setActiveAccountType] = useState<'ALL' | 'BANKS' | 'CASH'>('ALL');

  const [selectedAccountId, setSelectedAccountId] = useState<string>(accountId || '');
  const [selectedMonth, setSelectedMonth] = useState('2026-08');

  const [ledgerData, setLedgerData] = useState<{
    account?: AccountItem;
    ledgerEntries: Array<{
      _id: string;
      date: string;
      voucherNo: string;
      detail: string;
      drAmount: number;
      crAmount: number;
      runningBalance: number;
      status?: string;
    }>;
    summary?: {
      openingBalance: number;
      totalMoneyIn: number;
      totalMoneyOut: number;
      closingBalance: number;
      currentBalance: number;
      transactionCount: number;
    };
  } | null>(null);

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 1. Load accounts list
  useEffect(() => {
    const loadAccountsList = async () => {
      try {
        setLoadingAccounts(true);
        const res = await accountsAPI.getActiveSummary();
        const bankList = res.grouped?.banks || [];
        const cashList = res.grouped?.custodians || [];
        setBanks(bankList);
        setCustodians(cashList);
        const combined = [...bankList, ...cashList];
        setAllAccounts(combined);

        // Preselect passed ID or first available account
        if (accountId) {
          setSelectedAccountId(accountId);
          const found = combined.find((a) => a._id === accountId);
          if (found) {
            setActiveAccountType(found.type === 'BANK' ? 'BANKS' : 'CASH');
          }
        } else if (combined.length > 0) {
          setSelectedAccountId(combined[0]._id);
        }
      } catch (err) {
        console.error('[LedgersScreen] Failed to load accounts list:', err);
      } finally {
        setLoadingAccounts(false);
      }
    };
    loadAccountsList();
  }, [accountId]);

  // 2. Load account ledger
  const loadLedger = useCallback(async (isRefresh = false) => {
    if (!selectedAccountId) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoadingLedger(true);
    }

    try {
      const res = await accountLedgersAPI.getAccountLedger(selectedAccountId, {
        month: selectedMonth,
      });
      if (res.data) {
        setLedgerData(res.data);
      }
    } catch (err) {
      console.error('[LedgersScreen] Failed to load account ledger:', err);
    } finally {
      setLoadingLedger(false);
      setRefreshing(false);
    }
  }, [selectedAccountId, selectedMonth]);

  useEffect(() => {
    if (selectedAccountId) {
      loadLedger();
    }
  }, [selectedAccountId, selectedMonth, loadLedger]);

  const selectedAccount = allAccounts.find((a) => a._id === selectedAccountId);

  const visibleAccountChips =
    activeAccountType === 'BANKS'
      ? banks
      : activeAccountType === 'CASH'
      ? custodians
      : allAccounts;

  const renderLedgerEntry = ({
    item,
  }: {
    item: {
      _id: string;
      date: string;
      voucherNo: string;
      detail: string;
      drAmount: number;
      crAmount: number;
      runningBalance: number;
    };
  }) => {
    const isMoneyIn = (item.drAmount || 0) > 0;

    return (
      <View style={styles.entryCard}>
        <View style={styles.entryHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.voucherNo}>
              {item.voucherNo ? `VN-${item.voucherNo}` : 'VN-—'}
            </Text>
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={[
                styles.amountText,
                { color: isMoneyIn ? '#16A34A' : '#DC2626' },
              ]}
            >
              {isMoneyIn ? `+ ${formatPKR(item.drAmount)}` : `- ${formatPKR(item.crAmount)}`}
            </Text>
            <Text style={styles.runningBalLabel}>
              Bal: {formatPKR(item.runningBalance)}
            </Text>
          </View>
        </View>
        <Text style={styles.detailText} numberOfLines={2}>
          {item.detail || 'General Ledger Entry'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {selectedAccount?.type === 'BANK' ? 'Bank Ledger' : 'Cash in Hand Ledger'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {selectedAccount?.name || 'Running Account Ledger'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshIconBtn}
          onPress={() => loadLedger(true)}
          disabled={loadingLedger || refreshing}
        >
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Account Type Selector Tabs */}
      <View style={styles.typeTabs}>
        <TouchableOpacity
          style={[styles.typeTabBtn, activeAccountType === 'ALL' && styles.typeTabBtnActive]}
          onPress={() => setActiveAccountType('ALL')}
        >
          <Text style={[styles.typeTabText, activeAccountType === 'ALL' && styles.typeTabTextActive]}>
            All ({allAccounts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeTabBtn, activeAccountType === 'BANKS' && styles.typeTabBtnActive]}
          onPress={() => {
            setActiveAccountType('BANKS');
            if (banks.length > 0 && !banks.some((b) => b._id === selectedAccountId)) {
              setSelectedAccountId(banks[0]._id);
            }
          }}
        >
          <Text style={[styles.typeTabText, activeAccountType === 'BANKS' && styles.typeTabTextActive]}>
            Banks ({banks.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeTabBtn, activeAccountType === 'CASH' && styles.typeTabBtnActive]}
          onPress={() => {
            setActiveAccountType('CASH');
            if (custodians.length > 0 && !custodians.some((c) => c._id === selectedAccountId)) {
              setSelectedAccountId(custodians[0]._id);
            }
          }}
        >
          <Text style={[styles.typeTabText, activeAccountType === 'CASH' && styles.typeTabTextActive]}>
            Cash Custodians ({custodians.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Account Selector Strip */}
      <View style={styles.accountSelectorWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.accountScrollContent}
        >
          {visibleAccountChips.map((acc) => {
            const isSelected = acc._id === selectedAccountId;
            return (
              <TouchableOpacity
                key={acc._id}
                style={[
                  styles.accountChip,
                  isSelected && styles.accountChipActive,
                ]}
                onPress={() => setSelectedAccountId(acc._id)}
              >
                <Text
                  style={[
                    styles.accountChipText,
                    isSelected && styles.accountChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Month Selector Strip */}
      <View style={styles.monthRow}>
        {['2026-08', '2026-09', '2026-07'].map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.monthChip, selectedMonth === m && styles.monthChipActive]}
            onPress={() => setSelectedMonth(m)}
          >
            <Text
              style={[
                styles.monthChipText,
                selectedMonth === m && styles.monthChipTextActive,
              ]}
            >
              {m}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Ledger Balance Summary Card */}
      {ledgerData?.summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryAccountName}>{selectedAccount?.name || 'Account'}</Text>
              <Text style={styles.summaryAccountSub}>
                {selectedAccount?.type === 'BANK'
                  ? selectedAccount.accountNumber
                    ? `A/C: ${selectedAccount.accountNumber}`
                    : 'Bank Account'
                  : `Custodian: ${selectedAccount?.cashHolder || 'Cash in Hand'}`}
              </Text>
            </View>
            <View style={styles.closingBox}>
              <Text style={styles.closingLabel}>CLOSING BALANCE</Text>
              <Text style={styles.closingValue}>
                {formatPKR(ledgerData.summary.closingBalance)}
              </Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>Opening Balance</Text>
              <Text style={styles.metricValue}>
                {formatPKR(ledgerData.summary.openingBalance)}
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>Money In (+)</Text>
              <Text style={[styles.metricValue, { color: '#16A34A' }]}>
                {formatPKR(ledgerData.summary.totalMoneyIn)}
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>Money Out (-)</Text>
              <Text style={[styles.metricValue, { color: '#DC2626' }]}>
                {formatPKR(ledgerData.summary.totalMoneyOut)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Running Ledger Entries */}
      {loadingLedger ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Calculating running ledger...</Text>
        </View>
      ) : (
        <FlatList
          data={ledgerData?.ledgerEntries || []}
          keyExtractor={(item) => item._id}
          renderItem={renderLedgerEntry}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            ledgerData?.summary ? (
              <View style={styles.openingBalBanner}>
                <View style={styles.openingBalLeft}>
                  <Feather name="corner-down-right" size={14} color="#64748B" />
                  <Text style={styles.openingBalTitle}>Opening Balance</Text>
                </View>
                <Text style={styles.openingBalVal}>
                  {formatPKR(ledgerData.summary.openingBalance)}
                </Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadLedger(true)}
              colors={['#2563EB']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Entries Recorded</Text>
              <Text style={styles.emptySubtitle}>
                No debit or credit transactions found for this account in {selectedMonth}.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  typeTabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  typeTabBtnActive: {
    backgroundColor: '#2563EB',
  },
  typeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  typeTabTextActive: {
    color: '#FFFFFF',
  },
  accountSelectorWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
  },
  accountScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  accountChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: 200,
  },
  accountChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  accountChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  accountChipTextActive: {
    color: '#FFFFFF',
  },
  monthRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  monthChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  summaryAccountName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryAccountSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closingBox: {
    alignItems: 'flex-end',
  },
  closingLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  closingValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  openingBalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  openingBalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  openingBalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  openingBalVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 10,
  },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  voucherNo: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  amountText: {
    fontSize: 15,
    fontWeight: '800',
  },
  runningBalLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  detailText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
});
