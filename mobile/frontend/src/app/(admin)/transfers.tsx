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
import { transfersAPI } from '@/services/api';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function TransfersScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<any[]>([]);

  const loadTransfers = async () => {
    try {
      setLoading(true);
      const res = await transfersAPI.getTransfers();
      const rawList = res?.transfers || res?.data?.transfers || res?.data || [];
      setTransfers(Array.isArray(rawList) ? rawList : []);
    } catch (err: any) {
      console.warn('Failed to load transfers:', err.message);
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Internal Transfers</Text>
          <Text style={styles.headerSubtitle}>Bank to Cash & Inter-Account Transfers</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadTransfers}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading internal transfers...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={styles.sectionTitle}>Transfer Vouchers ({transfers.length})</Text>

          {transfers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="repeat" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Internal Transfers Recorded</Text>
              <Text style={styles.emptySubtitle}>Cash-to-bank and account transfers will appear here.</Text>
            </View>
          ) : (
            transfers.map((tr) => (
              <View key={tr._id || tr.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.badge}>
                    <Feather name="repeat" size={16} color="#4338CA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vnTitle}>VN #{tr.voucherNo || '—'}</Text>
                    <Text style={styles.detailTxt}>{tr.detail || 'Internal Account Transfer'}</Text>
                  </View>
                  <Text style={styles.amount}>Rs. {Number(tr.amount || 0).toLocaleString()}</Text>
                </View>

                {/* Show Both Dr and Cr Accounts */}
                <View style={styles.accountBox}>
                  <View style={styles.accountRow}>
                    <Text style={styles.drLabel}>Receiving Account (Dr.):</Text>
                    <Text style={styles.accountVal}>
                      {tr.drAccountId?.name || tr.receivingAccountName || 'Dr Account'}
                    </Text>
                  </View>
                  <View style={styles.accountRow}>
                    <Text style={styles.crLabel}>Source / Paying Account (Cr.):</Text>
                    <Text style={styles.accountVal}>
                      {tr.crAccountId?.name || tr.sourceAccountName || 'Cr Account'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="transfers"
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
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vnTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  detailTxt: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  amount: { fontSize: 14, fontWeight: '900', color: '#4338CA' },
  accountBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 4,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
  },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drLabel: { fontSize: 11, fontWeight: '700', color: '#059669' },
  crLabel: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  accountVal: { fontSize: 11, fontWeight: '800', color: '#1E293B' },
});
