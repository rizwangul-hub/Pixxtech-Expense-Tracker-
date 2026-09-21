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
import { accountsAPI, CategoryItem } from '@/services/api';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function ChartOfAccountsScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  const loadChart = async () => {
    try {
      setLoading(true);
      const res = await accountsAPI.getCategories();
      setCategories(res.categories || []);
    } catch (err: any) {
      console.warn('Failed to load chart of accounts:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChart();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Chart of Accounts</Text>
          <Text style={styles.headerSubtitle}>Financial Accounting Heads</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadChart}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading chart of accounts...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Accounting Structure</Text>
            <Text style={styles.summaryDesc}>
              Canonical general ledger heads classified for expenses and revenue heads.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Account Categories ({categories.length})</Text>

          {categories.map((cat) => (
            <View key={cat._id} style={styles.catCard}>
              <View style={styles.catLeft}>
                <View style={[
                  styles.typeBadge,
                  cat.type === 'EXPENSE' ? styles.expenseBadge : styles.incomeBadge
                ]}>
                  <Text style={[
                    styles.typeTxt,
                    cat.type === 'EXPENSE' ? styles.expenseTxt : styles.incomeTxt
                  ]}>
                    {cat.type}
                  </Text>
                </View>
                <Text style={styles.catName}>{cat.name}</Text>
              </View>

              {cat.expenseClassification && (
                <View style={styles.classPill}>
                  <Text style={styles.classTxt}>
                    {cat.expenseClassification.replace(/_/g, ' ')}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="chart-of-accounts"
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
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  summaryDesc: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  catCard: {
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
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  expenseBadge: { backgroundColor: '#FFE4E6' },
  incomeBadge: { backgroundColor: '#D1FAE5' },
  typeTxt: { fontSize: 10, fontWeight: '900' },
  expenseTxt: { color: '#9F1239' },
  incomeTxt: { color: '#065F46' },
  catName: { fontSize: 13, fontWeight: '800', color: '#0F172A', flex: 1 },
  classPill: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  classTxt: { fontSize: 10, fontWeight: '700', color: '#475569' },
});
