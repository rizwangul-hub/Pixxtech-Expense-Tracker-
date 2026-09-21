import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  verificationAPI,
  transactionsAPI,
  PendingEntryItem,
  TransactionItem,
} from '@/services/api';
import StatusBadge from '@/components/StatusBadge';

type UnifiedEntry = {
  id: string;
  isPending: boolean;
  type: 'RENT' | 'EXPENSE' | 'TRANSFER';
  voucherNo: string;
  date: string;
  amount: number;
  detail: string;
  status: string;
  property?: string;
  account?: string;
  rawPending?: PendingEntryItem;
  rawTransaction?: TransactionItem;
};

export default function MyEntriesScreen() {
  const router = useRouter();

  const [filterType, setFilterType] = useState<'ALL' | 'PENDING' | 'RENT' | 'EXPENSE' | 'VERIFIED'>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pendingEntries, setPendingEntries] = useState<PendingEntryItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [subRes, txRes] = await Promise.all([
        verificationAPI.getMySubmissions().catch(() => ({ data: [] })),
        transactionsAPI.getMyEntries().catch(() => ({ transactions: [] })),
      ]);
      setPendingEntries(subRes.data || []);
      setTransactions(txRes.transactions || []);
    } catch (err: any) {
      console.warn('Failed to load my entries:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Merge into unified entries list
  const unifiedEntries: UnifiedEntry[] = useMemo(() => {
    const list: UnifiedEntry[] = [];

    // Add pending submissions
    pendingEntries.forEach((p) => {
      list.push({
        id: p._id,
        isPending: true,
        type: p.entryType || 'EXPENSE',
        voucherNo: p.voucherNo || 'Pending VN',
        date: p.date ? new Date(p.date).toISOString().split('T')[0] : '',
        amount: p.amount || 0,
        detail: p.detail || '',
        status: p.status || 'PENDING_VERIFICATION',
        property: p.propertyId?.plazaName || '',
        account: p.receivingAccountId?.name || p.crAccountId?.name || '',
        rawPending: p,
      });
    });

    // Add verified/recorded transactions
    transactions.forEach((tx) => {
      list.push({
        id: tx._id,
        isPending: false,
        type: tx.transactionType === 'RENT' ? 'RENT' : 'EXPENSE',
        voucherNo: tx.voucherNo || 'VN-—',
        date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
        amount: tx.amount || 0,
        detail: tx.detail || '',
        status: tx.status || 'VERIFIED',
        property: tx.propertyId?.plazaName || '',
        account: tx.crAccountId?.name || tx.drAccountId?.name || '',
        rawTransaction: tx,
      });
    });

    // Sort newest date / createdAt first
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [pendingEntries, transactions]);

  const filteredEntries = useMemo(() => {
    return unifiedEntries.filter((item) => {
      if (filterType === 'PENDING' && !item.isPending && item.status !== 'PENDING_VERIFICATION') return false;
      if (filterType === 'VERIFIED' && (item.isPending || item.status === 'PENDING_VERIFICATION')) return false;
      if (filterType === 'RENT' && item.type !== 'RENT') return false;
      if (filterType === 'EXPENSE' && item.type !== 'EXPENSE') return false;

      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        item.voucherNo?.toLowerCase().includes(q) ||
        item.detail?.toLowerCase().includes(q) ||
        item.property?.toLowerCase().includes(q) ||
        item.account?.toLowerCase().includes(q)
      );
    });
  }, [unifiedEntries, filterType, search]);

  const handleEntryPress = (entry: UnifiedEntry) => {
    router.push({
      pathname: '/(data-entry)/entry-detail',
      params: {
        id: entry.id,
        isPending: entry.isPending ? 'true' : 'false',
        data: JSON.stringify(entry.rawPending || entry.rawTransaction),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>My Entries</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <TouchableOpacity
            style={[styles.tabChip, filterType === 'ALL' && styles.tabChipActive]}
            onPress={() => setFilterType('ALL')}
          >
            <Text style={[styles.tabText, filterType === 'ALL' && styles.tabTextActive]}>
              All ({unifiedEntries.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, filterType === 'PENDING' && styles.tabChipActive]}
            onPress={() => setFilterType('PENDING')}
          >
            <Text style={[styles.tabText, filterType === 'PENDING' && styles.tabTextActive]}>
              Pending Review ({pendingEntries.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, filterType === 'RENT' && styles.tabChipActive]}
            onPress={() => setFilterType('RENT')}
          >
            <Text style={[styles.tabText, filterType === 'RENT' && styles.tabTextActive]}>
              Rent Collections ({unifiedEntries.filter((e) => e.type === 'RENT').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, filterType === 'EXPENSE' && styles.tabChipActive]}
            onPress={() => setFilterType('EXPENSE')}
          >
            <Text style={[styles.tabText, filterType === 'EXPENSE' && styles.tabTextActive]}>
              Expenses ({unifiedEntries.filter((e) => e.type === 'EXPENSE').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, filterType === 'VERIFIED' && styles.tabChipActive]}
            onPress={() => setFilterType('VERIFIED')}
          >
            <Text style={[styles.tabText, filterType === 'VERIFIED' && styles.tabTextActive]}>
              Verified / Recorded ({transactions.length})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        <Feather name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by VN, detail, or plaza..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x-circle" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading submissions from backend...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="folder" size={40} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Entries Found</Text>
              <Text style={styles.emptySubtitle}>
                {search
                  ? 'No submissions match your search query.'
                  : 'You have not submitted any records in this category yet.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isRent = item.type === 'RENT';
            return (
              <TouchableOpacity
                style={styles.entryCard}
                onPress={() => handleEntryPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.cardTypeRow}>
                    <View
                      style={[
                        styles.typeIconBox,
                        isRent ? styles.typeIconRent : styles.typeIconExpense,
                      ]}
                    >
                      <Feather
                        name={isRent ? 'dollar-sign' : 'file-text'}
                        size={16}
                        color={isRent ? '#16A34A' : '#DC2626'}
                      />
                    </View>
                    <View>
                      <Text style={styles.voucherNo}>
                        {isRent ? 'Rent Receipt' : `VN #${item.voucherNo}`}
                      </Text>
                      <Text style={styles.entryDate}>{item.date}</Text>
                    </View>
                  </View>
                  <View style={styles.amountBox}>
                    <Text style={[styles.amountText, isRent && styles.amountTextRent]}>
                      PKR {item.amount?.toLocaleString()}
                    </Text>
                    <StatusBadge status={item.status} size="small" />
                  </View>
                </View>

                {item.property ? (
                  <View style={styles.propertyRow}>
                    <Feather name="home" size={12} color="#64748B" style={{ marginRight: 4 }} />
                    <Text style={styles.propertyText}>{item.property}</Text>
                  </View>
                ) : null}

                <Text style={styles.detailText} numberOfLines={2}>
                  {item.detail}
                </Text>

                <View style={styles.cardFooter}>
                  <Text style={styles.accountText} numberOfLines={1}>
                    {item.account ? `A/C: ${item.account}` : 'General Disbursed'}
                  </Text>
                  <Feather name="chevron-right" size={16} color="#94A3B8" />
                </View>
              </TouchableOpacity>
            );
          }}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  refreshButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  tabsWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabChipActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  typeIconRent: {
    backgroundColor: '#DCFCE7',
  },
  typeIconExpense: {
    backgroundColor: '#FEE2E2',
  },
  voucherNo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  entryDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  amountBox: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amountText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  amountTextRent: {
    color: '#15803D',
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  propertyText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  detailText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  accountText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    maxWidth: '85%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
