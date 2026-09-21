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
import { agreementsAPI } from '@/services/api';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function AgreementsScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState<any[]>([]);

  const loadAgreements = async () => {
    try {
      setLoading(true);
      const res = await agreementsAPI.getAgreements();
      setAgreements(res.agreements || res.data || []);
    } catch (err: any) {
      console.warn('Failed to load agreements:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgreements();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Lease Agreements</Text>
          <Text style={styles.headerSubtitle}>Plaza Unit Contracts & Rent Rolls</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadAgreements}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading lease agreements...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={styles.sectionTitle}>Active Agreements ({agreements.length})</Text>

          {agreements.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="file-minus" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Active Lease Agreements</Text>
              <Text style={styles.emptySubtitle}>Lease agreements will be listed here.</Text>
            </View>
          ) : (
            agreements.map((agr) => (
              <View key={agr._id || agr.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Feather name="file-text" size={20} color="#4F46E5" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agrNo}>
                      {agr.agreementNumber || `AGR #${agr._id?.substring(0, 6)}`}
                    </Text>
                    <Text style={styles.subTxt}>
                      {agr.tenantId?.fullName || agr.tenantName || 'Tenant'}
                    </Text>
                  </View>
                  <View style={styles.activePill}>
                    <Text style={styles.activeTxt}>ACTIVE</Text>
                  </View>
                </View>

                <View style={styles.agrDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.lbl}>Agreed Monthly Rent:</Text>
                    <Text style={styles.val}>Rs. {Number(agr.agreedRent || 0).toLocaleString()}</Text>
                  </View>
                  {!!agr.plazaName && (
                    <View style={styles.detailRow}>
                      <Text style={styles.lbl}>Plaza Property:</Text>
                      <Text style={styles.valTxt}>{agr.plazaName}</Text>
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
        currentRoute="agreements"
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  agrNo: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  subTxt: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  activePill: { backgroundColor: '#E0E7FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeTxt: { fontSize: 10, fontWeight: '900', color: '#3730A3' },
  agrDetails: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lbl: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  val: { fontSize: 13, fontWeight: '800', color: '#16A34A' },
  valTxt: { fontSize: 12, fontWeight: '700', color: '#334155' },
});
