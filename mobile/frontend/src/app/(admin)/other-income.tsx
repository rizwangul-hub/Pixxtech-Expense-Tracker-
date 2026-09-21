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
import { otherIncomeAPI } from '@/services/api';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function OtherIncomeScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [incomeList, setIncomeList] = useState<any[]>([]);

  const loadOtherIncome = async () => {
    try {
      setLoading(true);
      const res = await otherIncomeAPI.getAllOtherIncome();
      const rawList = res?.otherIncomes || res?.data?.otherIncomes || res?.data || [];
      setIncomeList(Array.isArray(rawList) ? rawList : []);
    } catch (err: any) {
      console.warn('Failed to load other income:', err.message);
      setIncomeList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOtherIncome();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Other Income</Text>
          <Text style={styles.headerSubtitle}>Utility Reimbursements & Service Receipts</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadOtherIncome}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading other income records...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={styles.sectionTitle}>Income Receipts ({incomeList.length})</Text>

          {incomeList.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="dollar-sign" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Other Income Receipts</Text>
              <Text style={styles.emptySubtitle}>Reimbursements & miscellaneous receipts will appear here.</Text>
            </View>
          ) : (
            incomeList.map((inc) => (
              <View key={inc._id || inc.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.iconBadge}>
                    <Feather name="plus-circle" size={18} color="#0D9488" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{inc.title || inc.headName || 'Other Income'}</Text>
                    <Text style={styles.subTxt}>{inc.detail || inc.notes || 'Receipt Record'}</Text>
                  </View>
                  <Text style={styles.amount}>Rs. {Number(inc.amount || 0).toLocaleString()}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="other-income"
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
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  subTxt: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  amount: { fontSize: 14, fontWeight: '900', color: '#0D9488' },
});
