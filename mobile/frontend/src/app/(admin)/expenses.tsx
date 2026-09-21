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

export default function ExpensesScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const res = await reportsAPI.getHeadWiseSummary();
      setSummary(res);
    } catch (err: any) {
      console.warn('Failed to load head-wise expenses:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const totalSpent = summary?.totalExpensesOverall || 0;
  const classes = summary?.classificationTotals || {};
  const heads = summary?.heads || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Head-Wise Expenses</Text>
          <Text style={styles.headerSubtitle}>3-Tier Expense Head Classification</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadExpenses}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Calculating head-wise expenses...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={styles.macroCard}>
            <Text style={styles.macroLbl}>Overall Net Expenses</Text>
            <Text style={styles.macroVal}>Rs. {Number(totalSpent).toLocaleString()}</Text>

            <View style={styles.classGrid}>
              <View style={styles.classCard}>
                <Text style={styles.cLbl}>General</Text>
                <Text style={styles.cVal}>Rs. {Number(classes.generalExpenses || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.classCard}>
                <Text style={styles.cLbl}>Property Own</Text>
                <Text style={styles.cVal}>Rs. {Number(classes.propertyOwnExpenses || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.classCard}>
                <Text style={styles.cLbl}>Unit Scope</Text>
                <Text style={styles.cVal}>Rs. {Number(classes.unitExpenses || 0).toLocaleString()}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Expense Heads Breakdown ({heads.length})</Text>

          {heads.map((head: any) => (
            <View key={head.categoryId} style={styles.headCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headTitle}>{head.headName}</Text>
                <Text style={styles.headSub}>{head.transactionCount || 0} Transactions</Text>
              </View>
              <Text style={styles.headAmt}>Rs. {Number(head.totalSpent || 0).toLocaleString()}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="expenses"
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
  macroCard: {
    backgroundColor: '#9F1239',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  macroLbl: { fontSize: 11, fontWeight: '700', color: '#FECDD3' },
  macroVal: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', marginTop: 4 },
  classGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  classCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', padding: 8, borderRadius: 8 },
  cLbl: { fontSize: 10, color: '#FFE4E6', fontWeight: '700' },
  cVal: { fontSize: 11, fontWeight: '900', color: '#FFFFFF', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  headCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  headSub: { fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 2 },
  headAmt: { fontSize: 14, fontWeight: '900', color: '#BE123C' },
});
