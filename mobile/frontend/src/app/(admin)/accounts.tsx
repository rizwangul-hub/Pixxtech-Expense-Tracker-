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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { accountsAPI, AccountItem } from '@/services/api';

const formatPKR = (val?: number): string => {
  if (val === undefined || val === null || isNaN(val)) return 'Rs. 0.00';
  const isNeg = val < 0;
  const formatted = 'Rs. ' + Math.abs(val).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNeg ? `(${formatted})` : formatted;
};

export default function AccountsScreen() {
  const router = useRouter();

  const [banks, setBanks] = useState<AccountItem[]>([]);
  const [custodians, setCustodians] = useState<AccountItem[]>([]);
  const [allAccounts, setAllAccounts] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'BANKS' | 'CASH'>('ALL');

  const loadAccounts = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await accountsAPI.getActiveSummary();
      const bankList = res.grouped?.banks || [];
      const cashList = res.grouped?.custodians || [];
      setBanks(bankList);
      setCustodians(cashList);
      setAllAccounts([...bankList, ...cashList]);
    } catch (err) {
      console.error('[AccountsScreen] Failed to load accounts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const totalBankBalance = banks.reduce((sum, b) => sum + (b.currentBalance || 0), 0);
  const totalCashBalance = custodians.reduce((sum, c) => sum + (c.currentBalance || 0), 0);
  const totalLiquidFunds = totalBankBalance + totalCashBalance;

  const displayedList =
    activeTab === 'BANKS'
      ? banks
      : activeTab === 'CASH'
      ? custodians
      : allAccounts;

  const handleOpenLedger = (account: AccountItem) => {
    router.push({
      pathname: '/(admin)/ledgers',
      params: { accountId: account._id },
    });
  };

  const renderAccount = ({ item }: { item: AccountItem }) => {
    const isBank = item.type === 'BANK';
    const isNegative = (item.currentBalance || 0) < 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View
            style={[
              styles.accountIconBox,
              { backgroundColor: isBank ? '#EFF6FF' : '#ECFDF5' },
            ]}
          >
            {isBank ? (
              <MaterialCommunityIcons name="bank-outline" size={22} color="#2563EB" />
            ) : (
              <MaterialCommunityIcons name="cash-multiple" size={22} color="#059669" />
            )}
          </View>

          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.accountName}>{item.name}</Text>
            <Text style={styles.accountSub}>
              {isBank
                ? item.accountNumber
                  ? `A/C: ${item.accountNumber}`
                  : item.bankName || 'Bank Account'
                : `Custodian: ${item.cashHolder || 'Cash in Hand'}`}
            </Text>
          </View>

          <View style={styles.typeBadge}>
            <Text style={[styles.typeBadgeText, { color: isBank ? '#2563EB' : '#059669' }]}>
              {isBank ? 'BANK' : 'CUSTODIAN'}
            </Text>
          </View>
        </View>

        {/* Balance Row */}
        <View style={styles.balanceRow}>
          <View>
            <Text style={styles.balanceLabel}>CURRENT BALANCE</Text>
            <Text
              style={[
                styles.balanceValue,
                { color: isNegative ? '#DC2626' : '#0F172A' },
              ]}
            >
              {formatPKR(item.currentBalance)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.ledgerBtn}
            activeOpacity={0.7}
            onPress={() => handleOpenLedger(item)}
          >
            <Feather name="book-open" size={13} color="#2563EB" />
            <Text style={styles.ledgerBtnText}>View Ledger</Text>
          </TouchableOpacity>
        </View>
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
          <Text style={styles.headerTitle}>Banks & Custodians</Text>
          <Text style={styles.headerSubtitle}>
            {banks.length} Banks • {custodians.length} Cash Custodians
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshIconBtn}
          onPress={() => loadAccounts(true)}
          disabled={loading || refreshing}
        >
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Liquid Funds Overview Banner */}
      <View style={styles.fundsCard}>
        <Text style={styles.fundsLabel}>TOTAL LIQUID POSITION</Text>
        <Text style={styles.fundsValue}>{formatPKR(totalLiquidFunds)}</Text>
        <View style={styles.fundsSplitRow}>
          <View style={styles.splitItem}>
            <Text style={styles.splitLabel}>Banks ({banks.length})</Text>
            <Text style={styles.splitValue}>{formatPKR(totalBankBalance)}</Text>
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitItem}>
            <Text style={styles.splitLabel}>Cash in Hand ({custodians.length})</Text>
            <Text style={styles.splitValue}>{formatPKR(totalCashBalance)}</Text>
          </View>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'ALL' && styles.tabButtonActive]}
          onPress={() => setActiveTab('ALL')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'ALL' && styles.tabButtonTextActive,
            ]}
          >
            All Accounts ({allAccounts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'BANKS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('BANKS')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'BANKS' && styles.tabButtonTextActive,
            ]}
          >
            Banks ({banks.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'CASH' && styles.tabButtonActive]}
          onPress={() => setActiveTab('CASH')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'CASH' && styles.tabButtonTextActive,
            ]}
          >
            Cash ({custodians.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Accounts List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Fetching accounts & balances...</Text>
        </View>
      ) : (
        <FlatList
          data={displayedList}
          keyExtractor={(item) => item._id}
          renderItem={renderAccount}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadAccounts(true)}
              colors={['#2563EB']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Accounts Found</Text>
              <Text style={styles.emptySubtitle}>No financial accounts in this category.</Text>
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
  fundsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  fundsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  fundsValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
    marginBottom: 12,
  },
  fundsSplitRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
  },
  splitItem: {
    flex: 1,
  },
  splitLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  splitValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  splitDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  accountIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  accountSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  typeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  ledgerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  ledgerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
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
