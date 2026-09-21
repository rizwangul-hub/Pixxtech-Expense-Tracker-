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

export default function RentDueScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dueSummary, setDueSummary] = useState<any>(null);

  const loadRentDue = async () => {
    try {
      setLoading(true);
      const res = await reportsAPI.getRentalIncomeSummary();
      setDueSummary(res);
    } catch (err: any) {
      console.warn('Failed to load rent due summary:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRentDue();
  }, []);

  const totals = dueSummary?.grandTotals || {};
  const plazas = dueSummary?.plazas || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Rent Due & Billing</Text>
          <Text style={styles.headerSubtitle}>Plaza Unit Outstanding Balances</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadRentDue}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Calculating rent due statement...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          {/* Macro KPI Cards */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLbl}>Total Agreed Rent</Text>
              <Text style={styles.kpiVal}>
                Rs. {Number(totals.totalAgreedRent || 0).toLocaleString()}
              </Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Text style={[styles.kpiLbl, { color: '#991B1B' }]}>Outstanding Due</Text>
              <Text style={[styles.kpiVal, { color: '#DC2626' }]}>
                Rs. {Number(totals.totalOutstandingReceivable || 0).toLocaleString()}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Plaza Billing Breakdown</Text>

          {plazas.map((plaza: any) => (
            <View key={plaza.plazaId} style={styles.plazaCard}>
              <View style={styles.plazaHeader}>
                <Feather name="home" size={18} color="#2563EB" />
                <Text style={styles.plazaName}>{plaza.plazaName}</Text>
              </View>

              <View style={styles.plazaStats}>
                <View style={styles.pStat}>
                  <Text style={styles.pLbl}>Agreed Roll</Text>
                  <Text style={styles.pVal}>Rs. {Number(plaza.subtotalAgreedRent || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.pStat}>
                  <Text style={styles.pLbl}>Outstanding</Text>
                  <Text style={[styles.pVal, { color: '#DC2626' }]}>
                    Rs. {Number(plaza.subtotalReceivable || 0).toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="rent-due"
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
  kpiGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiLbl: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  kpiVal: { fontSize: 15, fontWeight: '900', color: '#0F172A', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  plazaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  plazaHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  plazaName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  plazaStats: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  pStat: { flex: 1 },
  pLbl: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  pVal: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 2 },
});
