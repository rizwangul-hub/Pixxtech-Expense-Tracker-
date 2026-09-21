import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tenantsAPI } from '@/services/api';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function TenantsScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<any[]>([]);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const res = await tenantsAPI.getTenants();
      setTenants(res.tenants || res.data || []);
    } catch (err: any) {
      console.warn('Failed to load tenants:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tenants Directory</Text>
          <Text style={styles.headerSubtitle}>Active Commercial & Residential Occupants</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadTenants}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading tenants directory...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={styles.sectionTitle}>Registered Tenants ({tenants.length})</Text>

          {tenants.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="user-check" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Tenants Registered</Text>
              <Text style={styles.emptySubtitle}>Tenant directory records will appear here.</Text>
            </View>
          ) : (
            tenants.map((tenant) => (
              <View key={tenant._id || tenant.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>
                      {(tenant.fullName || tenant.name || 'T').charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tenantName}>{tenant.fullName || tenant.name || 'Tenant'}</Text>
                    <Text style={styles.subTxt}>{tenant.cnic || tenant.phone || 'Active Tenant'}</Text>
                  </View>
                </View>

                {!!tenant.agreedRent && (
                  <View style={styles.rentRow}>
                    <Text style={styles.rentLbl}>Agreed Monthly Rent:</Text>
                    <Text style={styles.rentVal}>Rs. {Number(tenant.agreedRent).toLocaleString()}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="tenants"
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { fontSize: 15, fontWeight: '900', color: '#065F46' },
  tenantName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  subTxt: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  rentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  rentLbl: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  rentVal: { fontSize: 13, fontWeight: '800', color: '#16A34A' },
});
