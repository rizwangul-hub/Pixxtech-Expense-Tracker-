import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { adminAPI, TransactionItem } from '@/services/api';
import { StatusBadge } from '@/components/StatusBadge';

const formatPKR = (val?: number): string => {
  if (val === undefined || val === null || isNaN(val)) return 'Rs. 0.00';
  return 'Rs. ' + Math.abs(val).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export default function TransactionsScreen() {
  const router = useRouter();

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2026-08');

  const loadTransactions = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const params: { month?: string; search?: string; limit?: number } = {
        limit: 100,
      };
      if (selectedMonth) params.month = selectedMonth;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await adminAPI.getMasterLedger(params);
      setTransactions(res.transactions || []);
      setTotalAmount(res.totalAmount || 0);
    } catch (err) {
      console.error('[TransactionsScreen] Failed to load transactions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth, searchQuery]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const renderTransaction = ({ item }: { item: TransactionItem }) => {
    const isExpense = item.transactionType === 'EXPENSE';
    const isRent = item.transactionType === 'RENT';

    const categoryName = item.categoryId?.name || (isRent ? 'Rental Income' : 'General');
    const propertyName = item.propertyId?.plazaName || 'General / None';
    const creditAccount = item.crAccountId?.name || '—';
    const debitAccount = item.drAccountId?.name || '—';

    return (
      <View style={styles.card}>
        {/* Header: Voucher No, Date & Status */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.voucherNo}>
              {item.voucherNo ? `VN-${item.voucherNo}` : 'VN-—'}
            </Text>
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          </View>
          <View style={styles.amountContainer}>
            <Text
              style={[
                styles.amountText,
                { color: isRent ? '#16A34A' : '#DC2626' },
              ]}
            >
              {formatPKR(item.amount)}
            </Text>
            <View style={{ marginTop: 4, alignItems: 'flex-end' }}>
              <StatusBadge status={item.status || 'VERIFIED'} />
            </View>
          </View>
        </View>

        {/* Narration */}
        <Text style={styles.detailText} numberOfLines={2}>
          {item.detail || 'No description provided'}
        </Text>

        {/* Metadata Details */}
        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Head:</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{categoryName}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Property:</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{propertyName}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Credit A/C:</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{creditAccount}</Text>
          </View>
          {debitAccount !== '—' && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Debit A/C:</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{debitAccount}</Text>
            </View>
          )}
        </View>

        {/* Footer: Submitter */}
        <View style={styles.cardFooter}>
          <Feather name="user" size={12} color="#64748B" />
          <Text style={styles.submittedByText}>
            Logged by: {item.createdBy?.name || 'Administrator'}
          </Text>
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
          <Text style={styles.headerTitle}>Master Transactions</Text>
          <Text style={styles.headerSubtitle}>
            {transactions.length} Records • Month: {selectedMonth}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshIconBtn}
          onPress={() => loadTransactions(true)}
          disabled={loading || refreshing}
        >
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Total Volume Banner */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>TOTAL TRANSACTION VOLUME</Text>
        <Text style={styles.totalValue}>{formatPKR(totalAmount)}</Text>
      </View>

      {/* Month Filter Selector */}
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

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by VN, narration, or account..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={() => loadTransactions()}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Fetching transactions...</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item._id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadTransactions(true)}
              colors={['#2563EB']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Transactions Found</Text>
              <Text style={styles.emptySubtitle}>
                No verified transactions recorded for this period.
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
  totalCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  monthRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  monthChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  voucherNo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
  },
  detailText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 10,
  },
  metaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    gap: 4,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    maxWidth: '70%',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  submittedByText: {
    fontSize: 11,
    color: '#64748B',
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
