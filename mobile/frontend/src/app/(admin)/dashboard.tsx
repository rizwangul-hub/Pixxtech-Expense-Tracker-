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
  adminAPI,
  verificationAPI,
  TransactionItem,
} from '@/services/api';
import { StatusBadge } from '@/components/StatusBadge';

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
    });
  } catch {
    return dateStr;
  }
};

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [loggingOut, setLoggingOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Live backend data
  const [macro, setMacro] = useState<{
    closingAvailableBalance: number;
    totalRentalIncomeReceived: number;
    totalNetExpenses: number;
    netPosition: number;
  } | null>(null);

  const [verificationSummary, setVerificationSummary] = useState<{
    pendingRentCount: number;
    pendingExpenseCount: number;
    totalPendingCount: number;
  } | null>(null);

  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);

  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [glanceRes, sumRes, ledgerRes] = await Promise.all([
        adminAPI.getFinancialAtAGlance('2026-08').catch(() => null),
        verificationAPI.getSummary().catch(() => null),
        adminAPI.getMasterLedger({ month: '2026-08', limit: 5 }).catch(() => null),
      ]);

      if (glanceRes?.macro) {
        setMacro(glanceRes.macro);
      }
      if (sumRes?.data) {
        setVerificationSummary({
          pendingRentCount: sumRes.data.pendingRentCount || 0,
          pendingExpenseCount: sumRes.data.pendingExpenseCount || 0,
          totalPendingCount: sumRes.data.totalPendingCount || 0,
        });
      }
      if (ledgerRes?.transactions) {
        setRecentTransactions(ledgerRes.transactions);
      }
    } catch (err) {
      console.error('[AdminDashboard] Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleLogoutPress = () => {
    Alert.alert(
      'Confirm Sign Out',
      'Are you sure you want to sign out of the Administrator portal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            await logout();
          },
        },
      ]
    );
  };

  const totalPending = verificationSummary?.totalPendingCount || 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top App Bar */}
      <View style={styles.topBar}>
        <View style={styles.headerLeft}>
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
          <Feather name="log-out" size={18} color="#DC2626" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadDashboardData(true)}
            colors={['#2563EB']}
          />
        }
      >
        {/* Administrator Profile Card */}
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.avatarLetter}>
              {user?.name ? user.name.charAt(0).toUpperCase() : 'K'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'Khurshid Anwar'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'khurshid@pixxtechnologies.com'}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <Feather name="shield" size={12} color="#7C3AED" style={{ marginRight: 4 }} />
                <Text style={styles.roleBadgeText}>{user?.role || 'ADMIN'}</Text>
              </View>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusBadgeText}>FULL ACCESS</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Pending Verification Notice Banner */}
        <TouchableOpacity
          style={[
            styles.pendingNoticeBanner,
            totalPending > 0 ? styles.pendingNoticeAlert : styles.pendingNoticeClear,
          ]}
          activeOpacity={0.8}
          onPress={() => router.push('/(admin)/pending-queue')}
        >
          <View
            style={[
              styles.pendingIconBox,
              { backgroundColor: totalPending > 0 ? '#FEE2E2' : '#DCFCE7' },
            ]}
          >
            <Feather
              name={totalPending > 0 ? 'clock' : 'check-circle'}
              size={20}
              color={totalPending > 0 ? '#DC2626' : '#16A34A'}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.pendingNoticeTitle}>
              {totalPending > 0
                ? `${totalPending} Pending Submissions`
                : 'All Entries Verified'}
            </Text>
            <Text style={styles.pendingNoticeDesc}>
              {totalPending > 0
                ? `${verificationSummary?.pendingRentCount || 0} Rent • ${
                    verificationSummary?.pendingExpenseCount || 0
                  } Expenses awaiting approval`
                : 'Central financial ledger is completely up to date'}
            </Text>
          </View>

          <View style={styles.pendingNoticeBtn}>
            <Text style={styles.pendingNoticeBtnText}>Review</Text>
            <Feather name="arrow-right" size={14} color="#2563EB" />
          </View>
        </TouchableOpacity>

        {/* Macro Financial Overview Card */}
        <View style={styles.macroCard}>
          <Text style={styles.macroHeading}>CLOSING AVAILABLE BALANCE (AUGUST 2026)</Text>
          <Text style={styles.macroBalance}>
            {formatPKR(macro?.closingAvailableBalance)}
          </Text>

          <View style={styles.macroGrid}>
            <View style={styles.macroCol}>
              <Text style={styles.macroLabel}>Rental Received</Text>
              <Text style={[styles.macroVal, { color: '#16A34A' }]}>
                {formatPKR(macro?.totalRentalIncomeReceived)}
              </Text>
            </View>
            <View style={styles.macroDivider} />
            <View style={styles.macroCol}>
              <Text style={styles.macroLabel}>Net Expenses</Text>
              <Text style={[styles.macroVal, { color: '#DC2626' }]}>
                {formatPKR(macro?.totalNetExpenses)}
              </Text>
            </View>
          </View>
        </View>

        {/* Section: Management Modules */}
        <Text style={styles.sectionHeading}>ADMINISTRATIVE MODULES</Text>
        <View style={styles.modulesGrid}>
          {/* 1. Pending Verification */}
          <TouchableOpacity
            style={styles.moduleCard}
            activeOpacity={0.7}
            onPress={() => router.push('/(admin)/pending-queue')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="check-square" size={22} color="#D97706" />
              {totalPending > 0 && (
                <View style={styles.moduleBadge}>
                  <Text style={styles.moduleBadgeText}>{totalPending}</Text>
                </View>
              )}
            </View>
            <Text style={styles.moduleTitle}>Verification</Text>
            <Text style={styles.moduleSubtitle}>Review & verify queue</Text>
          </TouchableOpacity>

          {/* 2. Properties & Units */}
          <TouchableOpacity
            style={styles.moduleCard}
            activeOpacity={0.7}
            onPress={() => router.push('/(admin)/properties')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="grid" size={22} color="#2563EB" />
            </View>
            <Text style={styles.moduleTitle}>Properties</Text>
            <Text style={styles.moduleSubtitle}>7 Plazas & Unit Rolls</Text>
          </TouchableOpacity>

          {/* 3. Banks & Custodians */}
          <TouchableOpacity
            style={styles.moduleCard}
            activeOpacity={0.7}
            onPress={() => router.push('/(admin)/accounts')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: '#F3E8FF' }]}>
              <MaterialCommunityIcons name="bank-outline" size={22} color="#9333EA" />
            </View>
            <Text style={styles.moduleTitle}>Accounts & Banks</Text>
            <Text style={styles.moduleSubtitle}>5 Banks • 4 Custodians</Text>
          </TouchableOpacity>

          {/* 4. Master Transactions */}
          <TouchableOpacity
            style={styles.moduleCard}
            activeOpacity={0.7}
            onPress={() => router.push('/(admin)/transactions')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: '#ECFDF5' }]}>
              <MaterialCommunityIcons name="receipt" size={22} color="#059669" />
            </View>
            <Text style={styles.moduleTitle}>Transactions</Text>
            <Text style={styles.moduleSubtitle}>Central ledger feed</Text>
          </TouchableOpacity>

          {/* 5. Account Ledgers */}
          <TouchableOpacity
            style={styles.moduleCard}
            activeOpacity={0.7}
            onPress={() => router.push('/(admin)/ledgers')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: '#E0F2FE' }]}>
              <Feather name="book-open" size={22} color="#0284C7" />
            </View>
            <Text style={styles.moduleTitle}>Ledgers</Text>
            <Text style={styles.moduleSubtitle}>Running account ledgers</Text>
          </TouchableOpacity>

          {/* 6. Financial Reports */}
          <TouchableOpacity
            style={styles.moduleCard}
            activeOpacity={0.7}
            onPress={() => router.push('/(admin)/reports')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: '#FDF2F8' }]}>
              <Feather name="file-text" size={22} color="#DB2777" />
            </View>
            <Text style={styles.moduleTitle}>Reports & PDFs</Text>
            <Text style={styles.moduleSubtitle}>Monthly balance sheets</Text>
          </TouchableOpacity>

          {/* 7. Add Rent Collection */}
          <TouchableOpacity
            style={styles.moduleCard}
            activeOpacity={0.7}
            onPress={() => router.push('/(admin)/add-rent')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: '#F0FDF4' }]}>
              <Feather name="dollar-sign" size={22} color="#16A34A" />
            </View>
            <Text style={styles.moduleTitle}>Add Rent</Text>
            <Text style={styles.moduleSubtitle}>Direct rent collection</Text>
          </TouchableOpacity>

          {/* 8. Add Expense Voucher */}
          <TouchableOpacity
            style={styles.moduleCard}
            activeOpacity={0.7}
            onPress={() => router.push('/(admin)/add-expense')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: '#FEF2F2' }]}>
              <Feather name="credit-card" size={22} color="#DC2626" />
            </View>
            <Text style={styles.moduleTitle}>Add Expense</Text>
            <Text style={styles.moduleSubtitle}>3-tier classified voucher</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Recent Central Transactions */}
        <View style={styles.recentSectionHeader}>
          <Text style={styles.sectionHeading}>RECENT POSTED TRANSACTIONS</Text>
          <TouchableOpacity onPress={() => router.push('/(admin)/transactions')}>
            <Text style={styles.viewAllLink}>View All</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#2563EB" style={{ marginVertical: 16 }} />
        ) : recentTransactions.length === 0 ? (
          <View style={styles.emptyRecentCard}>
            <Text style={styles.emptyRecentText}>No recent transactions found.</Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {recentTransactions.slice(0, 3).map((item) => {
              const isRent = item.transactionType === 'RENT';
              return (
                <View key={item._id} style={styles.recentRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.recentTopRow}>
                      <Text style={styles.recentVn}>
                        {item.voucherNo ? `VN-${item.voucherNo}` : 'VN-—'}
                      </Text>
                      <Text style={styles.recentDate}>{formatDate(item.date)}</Text>
                    </View>
                    <Text style={styles.recentDetail} numberOfLines={1}>
                      {item.detail || 'Central transaction'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                    <Text
                      style={[
                        styles.recentAmount,
                        { color: isRent ? '#16A34A' : '#DC2626' },
                      ]}
                    >
                      {formatPKR(item.amount)}
                    </Text>
                    <StatusBadge status={item.status || 'VERIFIED'} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Security & Authorization Details */}
        <Text style={[styles.sectionHeading, { marginTop: 24 }]}>AUTHORIZATION PROFILE</Text>
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Administrator Name</Text>
            <Text style={styles.profileValue}>{user?.name || 'Khurshid Anwar'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Assigned Role</Text>
            <Text style={[styles.profileValue, { color: '#7C3AED' }]}>{user?.role || 'ADMIN'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>RBAC Status</Text>
            <Text style={[styles.profileValue, { color: '#16A34A', fontWeight: '700' }]}>
              Authorized for Management & Verification
            </Text>
          </View>
        </View>
      </ScrollView>
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
    width: 140,
    height: 42,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    gap: 6,
  },
  logoutButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  userEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  pendingNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  pendingNoticeAlert: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  pendingNoticeClear: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  pendingIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pendingNoticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  pendingNoticeDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  pendingNoticeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pendingNoticeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  macroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  macroHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  macroBalance: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
    marginBottom: 14,
  },
  macroGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
  },
  macroCol: {
    flex: 1,
  },
  macroLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  macroVal: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  macroDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 2,
  },
  modulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  moduleCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
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
  moduleIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  moduleBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  moduleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  moduleSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 14,
  },
  recentSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  viewAllLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  recentList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  recentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentVn: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  recentDate: {
    fontSize: 11,
    color: '#64748B',
  },
  recentDetail: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
  },
  recentAmount: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  emptyRecentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyRecentText: {
    fontSize: 13,
    color: '#64748B',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  profileLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  profileValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
});
