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
import { verificationAPI, PendingEntryItem } from '@/services/api';
import { StatusBadge } from '@/components/StatusBadge';

// Helper to format currency in PKR
const formatPKR = (amount: number): string => {
  return 'Rs. ' + Math.abs(amount).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Helper to format date
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export default function PendingQueueScreen() {
  const router = useRouter();

  const [entries, setEntries] = useState<PendingEntryItem[]>([]);
  const [summary, setSummary] = useState<{
    pendingRentCount: number;
    pendingExpenseCount: number;
    totalPendingCount: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'RENT' | 'EXPENSE'>('ALL');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const params: { entryType?: string; search?: string } = {};
      if (activeTab !== 'ALL') {
        params.entryType = activeTab;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const [pendingRes, summaryRes] = await Promise.all([
        verificationAPI.getPending(params),
        verificationAPI.getSummary(),
      ]);

      setEntries(pendingRes.data?.entries || []);
      if (summaryRes?.data) {
        setSummary({
          pendingRentCount: summaryRes.data.pendingRentCount || 0,
          pendingExpenseCount: summaryRes.data.pendingExpenseCount || 0,
          totalPendingCount: summaryRes.data.totalPendingCount || 0,
        });
      }
    } catch (err) {
      console.error('[PendingQueue] Failed to load pending entries:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEntryPress = (entry: PendingEntryItem) => {
    router.push({
      pathname: '/(admin)/verification-detail',
      params: { id: entry._id },
    });
  };

  const renderItem = ({ item }: { item: PendingEntryItem }) => {
    const isRent = item.entryType === 'RENT';
    const propertyName =
      typeof item.propertyId === 'object' && item.propertyId?.plazaName
        ? item.propertyId.plazaName
        : 'General';

    const accountName =
      (isRent ? item.receivingAccountId?.name : item.crAccountId?.name) || 'Not specified';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => handleEntryPress(item)}
      >
        {/* Card Header: Type Badge & Status */}
        <View style={styles.cardHeader}>
          <View style={styles.typeBadgeContainer}>
            <View
              style={[
                styles.typeIconBox,
                { backgroundColor: isRent ? '#DCFCE7' : '#FEE2E2' },
              ]}
            >
              {isRent ? (
                <Feather name="dollar-sign" size={14} color="#16A34A" />
              ) : (
                <Feather name="credit-card" size={14} color="#DC2626" />
              )}
            </View>
            <Text
              style={[
                styles.typeBadgeText,
                { color: isRent ? '#15803D' : '#B91C1C' },
              ]}
            >
              {isRent ? 'RENT RECEIPT' : 'EXPENSE VOUCHER'}
            </Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        {/* Voucher No & Amount */}
        <View style={styles.amountRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.voucherNo}>
              {item.voucherNo ? `VN-${item.voucherNo}` : 'Pending VN'}
            </Text>
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          </View>
          <Text
            style={[
              styles.amountText,
              { color: isRent ? '#16A34A' : '#DC2626' },
            ]}
          >
            {formatPKR(item.amount)}
          </Text>
        </View>

        {/* Narration / Detail */}
        <Text style={styles.detailText} numberOfLines={2}>
          {item.detail || 'No description provided'}
        </Text>

        {/* Property & Account Meta */}
        <View style={styles.metaBox}>
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={13} color="#64748B" style={styles.metaIcon} />
            <Text style={styles.metaText} numberOfLines={1}>
              {propertyName}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons
              name="bank-outline"
              size={13}
              color="#64748B"
              style={styles.metaIcon}
            />
            <Text style={styles.metaText} numberOfLines={1}>
              {accountName}
            </Text>
          </View>
        </View>

        {/* Card Footer: Submitted By & Review Arrow */}
        <View style={styles.cardFooter}>
          <View style={styles.submittedByRow}>
            <Feather name="user" size={13} color="#64748B" />
            <Text style={styles.submittedByText}>
              By: {item.submittedByName || item.submittedBy?.name || 'Sarfraz'}
            </Text>
          </View>
          <View style={styles.reviewButton}>
            <Text style={styles.reviewButtonText}>Review</Text>
            <Feather name="chevron-right" size={14} color="#2563EB" />
          </View>
        </View>
      </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Pending Verification</Text>
          <Text style={styles.headerSubtitle}>
            Review & verify entries from Data Entry
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshIconBtn}
          onPress={() => loadData(true)}
          disabled={loading || refreshing}
        >
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Summary Counters Banner */}
      <View style={styles.counterBanner}>
        <View style={styles.counterItem}>
          <Text style={styles.counterValue}>{summary?.totalPendingCount ?? '—'}</Text>
          <Text style={styles.counterLabel}>Total Pending</Text>
        </View>
        <View style={styles.counterDivider} />
        <View style={styles.counterItem}>
          <Text style={[styles.counterValue, { color: '#16A34A' }]}>
            {summary?.pendingRentCount ?? '—'}
          </Text>
          <Text style={styles.counterLabel}>Rent Receipts</Text>
        </View>
        <View style={styles.counterDivider} />
        <View style={styles.counterItem}>
          <Text style={[styles.counterValue, { color: '#DC2626' }]}>
            {summary?.pendingExpenseCount ?? '—'}
          </Text>
          <Text style={styles.counterLabel}>Expense Vouchers</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by VN, description, or property..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={() => loadData()}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
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
            All Pending ({summary?.totalPendingCount ?? 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'RENT' && styles.tabButtonActive]}
          onPress={() => setActiveTab('RENT')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'RENT' && styles.tabButtonTextActive,
            ]}
          >
            Rent ({summary?.pendingRentCount ?? 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'EXPENSE' && styles.tabButtonActive]}
          onPress={() => setActiveTab('EXPENSE')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'EXPENSE' && styles.tabButtonTextActive,
            ]}
          >
            Expenses ({summary?.pendingExpenseCount ?? 0})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Entries List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Fetching pending queue...</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              colors={['#2563EB']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Feather name="check-circle" size={40} color="#16A34A" />
              </View>
              <Text style={styles.emptyTitle}>All Caught Up!</Text>
              <Text style={styles.emptySubtitle}>
                There are no pending submissions awaiting verification. All operational entries have been processed.
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
  counterBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  counterItem: {
    flex: 1,
    alignItems: 'center',
  },
  counterValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  counterLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  counterDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    height: '70%',
    alignSelf: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  amountRow: {
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
  amountText: {
    fontSize: 18,
    fontWeight: '800',
  },
  detailText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 12,
  },
  metaBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    marginRight: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  submittedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  submittedByText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewButtonText: {
    fontSize: 13,
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
    paddingHorizontal: 24,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});
