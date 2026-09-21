import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import {
  verificationAPI,
  transactionsAPI,
  PendingEntryItem,
  TransactionItem,
} from '@/services/api';
import StatusBadge from '@/components/StatusBadge';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function DataEntryDashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pendingEntries, setPendingEntries] = useState<PendingEntryItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [subRes, txRes] = await Promise.all([
        verificationAPI.getMySubmissions().catch(() => ({ data: [] })),
        transactionsAPI.getMyEntries().catch(() => ({ transactions: [] })),
      ]);
      setPendingEntries(subRes.data || []);
      setRecentTransactions(txRes.transactions || []);
    } catch (err: any) {
      console.warn('Dashboard load failed:', err.message);
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

  const handleLogoutPress = () => {
    Alert.alert('Confirm Sign Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  // KPI Calculations
  const todayStr = new Date().toISOString().split('T')[0];
  const allSubmissions = [
    ...pendingEntries.map((p) => ({
      id: p._id,
      date: p.date ? new Date(p.date).toISOString().split('T')[0] : '',
      amount: p.amount,
      isPending: true,
      status: p.status,
      title: p.entryType === 'RENT' ? 'Rent Receipt' : `VN #${p.voucherNo || '—'}`,
      detail: p.detail,
      property: p.propertyId?.plazaName,
      raw: p,
    })),
    ...recentTransactions.map((t) => ({
      id: t._id,
      date: t.date ? new Date(t.date).toISOString().split('T')[0] : '',
      amount: t.amount,
      isPending: false,
      status: t.status || 'VERIFIED',
      title: t.transactionType === 'RENT' ? 'Rent Receipt' : `VN #${t.voucherNo || '—'}`,
      detail: t.detail,
      property: t.propertyId?.plazaName,
      raw: t,
    })),
  ];

  allSubmissions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const todayCount = allSubmissions.filter((s) => s.date === todayStr).length;
  const pendingCount = pendingEntries.filter((p) => p.status === 'PENDING_VERIFICATION' || p.status === 'EDITED').length;
  const verifiedCount = recentTransactions.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top App Bar */}
      <View style={styles.topBar}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={{ padding: 6, marginRight: 8, borderRadius: 8, backgroundColor: '#F1F5F9' }}
            onPress={() => setDrawerOpen(true)}
          >
            <Feather name="menu" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogoutPress}
          disabled={loggingOut}
          activeOpacity={0.7}
        >
          <Feather name="log-out" size={16} color="#DC2626" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
      >
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.avatarLetter}>
              {user?.name ? user.name.charAt(0).toUpperCase() : 'S'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'Sarfraz'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'sarfraz@pixxtechnologies.com'}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <Feather name="edit-3" size={11} color="#1D4ED8" style={{ marginRight: 4 }} />
                <Text style={styles.roleBadgeText}>DATA ENTRY</Text>
              </View>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusBadgeText}>ACTIVE SESSION</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Real KPI Statistics Grid */}
        <View style={styles.statsGrid}>
          {/* Today's Entries */}
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="calendar" size={18} color="#2563EB" />
            </View>
            <Text style={styles.statNumber}>{todayCount}</Text>
            <Text style={styles.statLabel}>Today's Entries</Text>
          </View>

          {/* Pending Verification */}
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="clock" size={18} color="#D97706" />
            </View>
            <Text style={[styles.statNumber, { color: '#D97706' }]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Pending Review</Text>
          </View>

          {/* Verified / Approved */}
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#DCFCE7' }]}>
              <Feather name="check-circle" size={18} color="#16A34A" />
            </View>
            <Text style={[styles.statNumber, { color: '#16A34A' }]}>{verifiedCount}</Text>
            <Text style={styles.statLabel}>Verified / Active</Text>
          </View>
        </View>

        {/* Section: Operational Quick Actions */}
        <Text style={styles.sectionHeading}>OPERATIONAL ACTIONS</Text>
        <View style={styles.actionsGrid}>
          {/* Add Rent Action */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(data-entry)/add-rent')}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="home" size={24} color="#2563EB" />
            </View>
            <Text style={styles.actionTitle}>Add Rent</Text>
            <Text style={styles.actionSubtitle}>Record received tenant rent</Text>
            <View style={styles.actionArrow}>
              <Feather name="arrow-right" size={16} color="#2563EB" />
            </View>
          </TouchableOpacity>

          {/* Add Expense Action */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(data-entry)/add-expense')}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#FEF2F2' }]}>
              <Feather name="file-text" size={24} color="#DC2626" />
            </View>
            <Text style={styles.actionTitle}>Add Expense</Text>
            <Text style={styles.actionSubtitle}>Disburse bills & office expenses</Text>
            <View style={styles.actionArrow}>
              <Feather name="arrow-right" size={16} color="#DC2626" />
            </View>
          </TouchableOpacity>

          {/* My Entries Action */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(data-entry)/my-entries')}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#F0FDF4' }]}>
              <Feather name="list" size={24} color="#16A34A" />
            </View>
            <Text style={styles.actionTitle}>My Entries</Text>
            <Text style={styles.actionSubtitle}>Review your submitted records</Text>
            <View style={styles.actionArrow}>
              <Feather name="arrow-right" size={16} color="#16A34A" />
            </View>
          </TouchableOpacity>

          {/* Pending Submissions Action */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(data-entry)/my-entries')}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#FFFBEB' }]}>
              <Feather name="alert-circle" size={24} color="#D97706" />
            </View>
            <Text style={styles.actionTitle}>Pending Queue</Text>
            <Text style={styles.actionSubtitle}>Awaiting Admin verification</Text>
            <View style={styles.actionArrow}>
              <Feather name="arrow-right" size={16} color="#D97706" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Section: Recent Submissions Feed */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>RECENT SUBMISSIONS</Text>
          <TouchableOpacity onPress={() => router.push('/(data-entry)/my-entries')}>
            <Text style={styles.seeAllLink}>View All ({allSubmissions.length})</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingFeed}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.loadingFeedText}>Loading live submissions...</Text>
          </View>
        ) : allSubmissions.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Feather name="inbox" size={32} color="#CBD5E1" />
            <Text style={styles.emptyFeedTitle}>No Submissions Yet</Text>
            <Text style={styles.emptyFeedDesc}>
              Tap "Add Rent" or "Add Expense" above to record your first operational entry.
            </Text>
          </View>
        ) : (
          allSubmissions.slice(0, 5).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.feedCard}
              onPress={() =>
                router.push({
                  pathname: '/(data-entry)/entry-detail',
                  params: {
                    id: item.id,
                    isPending: item.isPending ? 'true' : 'false',
                    data: JSON.stringify(item.raw),
                  },
                })
              }
              activeOpacity={0.7}
            >
              <View style={styles.feedCardTop}>
                <View>
                  <Text style={styles.feedTitle}>{item.title}</Text>
                  <Text style={styles.feedDate}>{item.date}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.feedAmount}>PKR {item.amount?.toLocaleString()}</Text>
                  <StatusBadge status={item.status} size="small" />
                </View>
              </View>
              {item.property && (
                <Text style={styles.feedProperty} numberOfLines={1}>
                  🏢 {item.property}
                </Text>
              )}
              <Text style={styles.feedDetail} numberOfLines={1}>
                {item.detail}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="dashboard"
      />
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 130,
    height: 38,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    gap: 4,
  },
  logoutButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  userEmail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.7,
    marginBottom: 10,
    marginLeft: 2,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },
  actionArrow: {
    position: 'absolute',
    top: 14,
    right: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  seeAllLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  loadingFeed: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingFeedText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
  },
  emptyFeed: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFeedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
  },
  emptyFeedDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  feedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  feedCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  feedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  feedDate: {
    fontSize: 11,
    color: '#64748B',
  },
  feedAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  feedProperty: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 2,
  },
  feedDetail: {
    fontSize: 12,
    color: '#64748B',
  },
});
