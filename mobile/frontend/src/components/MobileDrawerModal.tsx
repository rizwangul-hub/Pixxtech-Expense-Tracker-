import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { verificationAPI } from '@/services/api';

interface MobileDrawerModalProps {
  visible: boolean;
  onClose: () => void;
  currentRoute?: string;
}

export default function MobileDrawerModal({
  visible,
  onClose,
  currentRoute = '',
}: MobileDrawerModalProps) {
  const router = useRouter();
  const { user, isAdmin, isDataEntry, logout, role } = useAuth();
  const isVerifier = role === 'VERIFIER' || role === 'VERIFICATION_MANAGER';
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    if (!visible) return;
    let isMounted = true;
    if (isAdmin || isVerifier) {
      verificationAPI.getSummary()
        .then((res) => {
          if (isMounted && res?.data) {
            setPendingCount(res.data.totalPendingCount || 0);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [visible, isAdmin, isVerifier]);

  const prefix = isAdmin ? '/(admin)' : '/(data-entry)';

  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      iconName: 'grid',
      badge: 'Core',
      badgeColor: '#DBEAFE',
      badgeTextColor: '#1E40AF',
      route: `${prefix}/dashboard`,
      visible: true,
    },
    {
      id: 'ledgers',
      label: 'Ledgers',
      iconName: 'book-open',
      badge: 'Journal',
      badgeColor: '#DBEAFE',
      badgeTextColor: '#1E40AF',
      route: `${prefix}/ledgers`,
      visible: !isDataEntry,
    },
    {
      id: 'staff',
      label: 'Staff HR',
      iconName: 'users',
      badge: 'HR / Payroll',
      badgeColor: '#F3E8FF',
      badgeTextColor: '#6B21A8',
      route: `${prefix}/staff`,
      visible: isAdmin || isDataEntry,
    },
    {
      id: 'chart-of-accounts',
      label: 'Chart of Accounts',
      iconName: 'layers',
      badge: 'Admin',
      badgeColor: '#CCFBF1',
      badgeTextColor: '#115E59',
      route: `/(admin)/chart-of-accounts`,
      visible: isAdmin,
    },
    {
      id: 'verification',
      label: 'Verification Queue',
      iconName: 'shield',
      badge: pendingCount > 0 ? `${pendingCount} Pending` : 'Verifier',
      badgeColor: pendingCount > 0 ? '#EF4444' : '#FEF3C7',
      badgeTextColor: pendingCount > 0 ? '#FFFFFF' : '#92400E',
      route: `/(admin)/pending-queue`,
      visible: isAdmin || isVerifier,
    },
    {
      id: 'operational',
      label: 'Data Entry Terminal',
      iconName: 'file-text',
      badge: 'Operator',
      badgeColor: '#D1FAE5',
      badgeTextColor: '#065F46',
      route: `${prefix}/dashboard`,
      visible: true,
    },
    {
      id: 'properties',
      label: 'Properties',
      iconName: 'home',
      badge: 'Portfolio',
      badgeColor: '#F1F5F9',
      badgeTextColor: '#334155',
      route: `${prefix}/properties`,
      visible: !isDataEntry,
    },
    {
      id: 'tenants',
      label: 'Tenants',
      iconName: 'user-check',
      badge: 'Active',
      badgeColor: '#D1FAE5',
      badgeTextColor: '#065F46',
      route: `${prefix}/tenants`,
      visible: !isDataEntry,
    },
    {
      id: 'agreements',
      label: 'Agreements',
      iconName: 'file-minus',
      badge: 'Active',
      badgeColor: '#E0E7FF',
      badgeTextColor: '#3730A3',
      route: `${prefix}/agreements`,
      visible: !isDataEntry,
    },
    {
      id: 'rent-due',
      label: 'Rent Due',
      iconName: 'clock',
      badge: 'Billing',
      badgeColor: '#FEF3C7',
      badgeTextColor: '#92400E',
      route: `${prefix}/rent-due`,
      visible: !isDataEntry,
    },
    {
      id: 'income',
      label: 'Rent Received',
      iconName: 'trending-up',
      badge: 'Active',
      badgeColor: '#D1FAE5',
      badgeTextColor: '#065F46',
      route: `${prefix}/rent-received`,
      visible: !isDataEntry,
    },
    {
      id: 'other-income',
      label: 'Other Income',
      iconName: 'dollar-sign',
      badge: 'Active',
      badgeColor: '#CCFBF1',
      badgeTextColor: '#115E59',
      route: `${prefix}/other-income`,
      visible: true,
    },
    {
      id: 'expenses',
      label: 'Expenses',
      iconName: 'credit-card',
      badge: 'Active',
      badgeColor: '#FFE4E6',
      badgeTextColor: '#9F1239',
      route: `${prefix}/expenses`,
      visible: true,
    },
    {
      id: 'accounts',
      label: 'Accounts',
      iconName: 'database',
      badge: 'Active',
      badgeColor: '#DBEAFE',
      badgeTextColor: '#1E40AF',
      route: `${prefix}/accounts`,
      visible: !isDataEntry,
    },
    {
      id: 'transfers',
      label: 'Transfers',
      iconName: 'repeat',
      badge: 'Active',
      badgeColor: '#E0E7FF',
      badgeTextColor: '#3730A3',
      route: `${prefix}/transfers`,
      visible: true,
    },
    {
      id: 'transactions',
      label: 'Transactions',
      iconName: 'list',
      badge: 'Ledger',
      badgeColor: '#F1F5F9',
      badgeTextColor: '#334155',
      route: `${prefix}/transactions`,
      visible: !isDataEntry,
    },
    {
      id: 'reports',
      label: 'Reports',
      iconName: 'bar-chart-2',
      badge: 'Financial',
      badgeColor: '#EDE9FE',
      badgeTextColor: '#5B21B6',
      route: `${prefix}/reports`,
      visible: !isDataEntry,
    },
    {
      id: 'monthly-reports',
      label: 'Monthly Reports',
      iconName: 'award',
      badge: 'Publish',
      badgeColor: '#D1FAE5',
      badgeTextColor: '#065F46',
      route: `${prefix}/monthly-reports`,
      visible: !isDataEntry,
    },
    {
      id: 'users',
      label: 'Users',
      iconName: 'shield-off',
      badge: 'Admin',
      badgeColor: '#E0E7FF',
      badgeTextColor: '#3730A3',
      route: `/(admin)/users`,
      visible: isAdmin,
    },
  ].filter((item) => item.visible);

  const handleNavigate = (route: string) => {
    onClose();
    router.push(route as any);
  };

  const handleLogout = async () => {
    onClose();
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <SafeAreaView style={styles.drawerContainer}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Feather name="layers" size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.brandTitle}>PIXX TECHNOLOGIES</Text>
                <Text style={styles.brandSubtitle}>Property Finance & Ledger ERP</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Feather name="x" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* User Profile Info */}
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.name || 'Authorized User'}</Text>
              <View style={styles.rolePill}>
                <Text style={styles.rolePillText}>
                  {isAdmin ? 'ADMINISTRATOR' : isVerifier ? 'VERIFIER' : 'DATA ENTRY OPERATOR'}
                </Text>
              </View>
            </View>
          </View>

          {/* Navigation Items */}
          <ScrollView
            style={styles.navList}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionHeader}>NAVIGATION MODULES</Text>

            {navigationItems.map((item) => {
              const isActive = currentRoute === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.navItem, isActive && styles.navItemActive]}
                  onPress={() => handleNavigate(item.route)}
                >
                  <View style={styles.navLeft}>
                    <Feather
                      name={item.iconName as any}
                      size={18}
                      color={isActive ? '#FFFFFF' : '#475569'}
                    />
                    <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                      {item.label}
                    </Text>
                  </View>

                  {!!item.badge && (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : item.badgeColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: isActive ? '#FFFFFF' : item.badgeTextColor },
                        ]}
                      >
                        {item.badge}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Feather name="log-out" size={18} color="#EF4444" />
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  drawerContainer: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  brandTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#F8FAFC',
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  userName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  rolePillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#3730A3',
    letterSpacing: 0.5,
  },
  navList: {
    flex: 1,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  navItemActive: {
    backgroundColor: '#2563EB',
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  navLabelActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
});
