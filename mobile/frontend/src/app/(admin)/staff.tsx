import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { staffAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function StaffHRScreen() {
  const { isAdmin } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);

  const loadStaff = async () => {
    try {
      setLoading(true);
      const res = await staffAPI.getEmployees();
      const rawList = res?.data?.employees || res?.employees || res?.data || [];
      setEmployees(Array.isArray(rawList) ? rawList : []);
    } catch (err: any) {
      console.warn('Failed to load staff:', err.message);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleDeleteEmployee = (id: string, name: string) => {
    Alert.alert(
      'Delete Employee',
      `Are you sure you want to delete employee "${name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await staffAPI.deleteEmployee(id);
              Alert.alert('Success', 'Employee deleted successfully.');
              loadStaff();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.message || 'Failed to delete employee.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* App Bar / Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Staff HR & Payroll</Text>
          <Text style={styles.headerSubtitle}>Corporate Employees Roster</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadStaff}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading staff directory...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{employees.length}</Text>
              <Text style={styles.statLbl}>Total Staff</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>Active</Text>
              <Text style={styles.statLbl}>Payroll Status</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Employee Records</Text>

          {employees.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="users" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Staff Members Registered</Text>
              <Text style={styles.emptySubtitle}>Employee HR records will appear here.</Text>
            </View>
          ) : (
            employees.map((emp) => (
              <View key={emp._id || emp.id} style={styles.empCard}>
                <View style={styles.empHeader}>
                  <View style={styles.empAvatar}>
                    <Text style={styles.avatarTxt}>
                      {(emp.name || emp.fullName || 'E').charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empName}>{emp.name || emp.fullName || 'Employee'}</Text>
                    <Text style={styles.empRole}>{emp.designation || emp.role || 'Staff Member'}</Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteEmployee(emp._id || emp.id, emp.name || emp.fullName)}
                    >
                      <Feather name="trash-2" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.empDetails}>
                  <View style={styles.detailRow}>
                    <Feather name="mail" size={13} color="#64748B" />
                    <Text style={styles.detailTxt}>{emp.email || emp.contact || 'N/A'}</Text>
                  </View>
                  {!!emp.basicSalary && (
                    <View style={styles.detailRow}>
                      <Feather name="dollar-sign" size={13} color="#16A34A" />
                      <Text style={[styles.detailTxt, { color: '#16A34A', fontWeight: '800' }]}>
                        Rs. {Number(emp.basicSalary).toLocaleString()} / month
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="staff"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  menuBtn: { padding: 8, borderRadius: 8, backgroundColor: '#F1F5F9' },
  refreshBtn: { padding: 8, borderRadius: 8, backgroundColor: '#EFF6FF' },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  headerSubtitle: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 13, color: '#64748B', fontWeight: '600' },
  body: { flex: 1, padding: 16 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  statLbl: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 2 },
  divider: { width: 1, height: 30, backgroundColor: '#334155' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#334155', marginTop: 10 },
  emptySubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  empCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  empHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  empAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  avatarTxt: { fontSize: 16, fontWeight: '900', color: '#2563EB' },
  empName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  empRole: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  deleteBtn: { padding: 8, borderRadius: 8, backgroundColor: '#FEF2F2' },
  empDetails: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTxt: { fontSize: 12, color: '#475569', fontWeight: '600' },
});
