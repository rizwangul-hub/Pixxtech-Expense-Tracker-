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
import { reportsAPI } from '@/services/api';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function RentReceivedScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  const loadRentReceived = async () => {
    try {
      setLoading(true);
      const res = await reportsAPI.getRentalIncomeSummary();
      setSummary(res);
    } catch (err: any) {
      console.warn('Failed to load rent received summary:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRentReceived();
  }, []);

  const totals = summary?.grandTotals || {};
  const plazas = summary?.plazas || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Rent Received</Text>
          <Text style={styles.headerSubtitle}>Rental Income Collections Log</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadRentReceived}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading rental collections...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLbl}>Total Rental Income Collected</Text>
            <Text style={styles.kpiVal}>
              Rs. {Number(totals.totalReceivedAmount || 0).toLocaleString()}
            </Text>
            <Text style={styles.kpiSub}>
              Collection Efficiency: {totals.collectionRate || 0}%
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Collections by Plaza</Text>

          {plazas.map((plaza: any) => (
            <View key={plaza.plazaId} style={styles.plazaCard}>
              <View style={styles.plazaHeader}>
                <Feather name="trending-up" size={18} color="#16A34A" />
                <Text style={styles.plazaName}>{plaza.plazaName}</Text>
              </View>

              <View style={styles.plazaRow}>
                <Text style={styles.pLbl}>Subtotal Collected:</Text>
                <Text style={styles.pVal}>Rs. {Number(plaza.subtotalReceived || 0).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="income"
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
  kpiCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  kpiLbl: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  kpiVal: { fontSize: 20, fontWeight: '900', color: '#4ADE80', marginTop: 4 },
  kpiSub: { fontSize: 11, color: '#CBD5E1', marginTop: 4, fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  plazaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  plazaHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  plazaName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  plazaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  pLbl: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  pVal: { fontSize: 13, fontWeight: '800', color: '#16A34A' },
});
