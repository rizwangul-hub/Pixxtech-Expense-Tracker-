import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { reportsAPI } from '@/services/api';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function MonthlyReportsScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);

  const loadReport = async () => {
    try {
      setLoading(true);
      const res = await reportsAPI.getMonthlyFinancialSummary();
      setReport(res);
    } catch (err: any) {
      console.warn('Failed to load monthly summary report:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const handleDownloadPDF = async () => {
    try {
      const url = await reportsAPI.getFundsPDFUrl('2026-08');
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert('Download Error', 'Failed to generate PDF document link.');
    }
  };

  const matrix = report?.accountMatrix || {};
  const grand = matrix.grandTotal || {};

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Monthly Financial Reports</Text>
          <Text style={styles.headerSubtitle}>Publish Statement & Account Matrix</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadReport}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Generating monthly financial matrix...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.periodTxt}>Period: {report?.period || 'Current Month'}</Text>
                <Text style={styles.summaryVal}>
                  Rs. {Number(matrix.grandClosingBalance || 0).toLocaleString()}
                </Text>
              </View>

              <TouchableOpacity style={styles.pdfBtn} onPress={handleDownloadPDF}>
                <Feather name="download" size={16} color="#FFFFFF" />
                <Text style={styles.pdfTxt}>PDF Report</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.splitRow}>
              <View style={styles.splitBox}>
                <Text style={styles.splitLbl}>Total Bank Balance</Text>
                <Text style={styles.splitVal}>
                  Rs. {Number(matrix.totalBankBalance || 0).toLocaleString()}
                </Text>
              </View>
              <View style={styles.splitBox}>
                <Text style={styles.splitLbl}>Total Cash Balance</Text>
                <Text style={styles.splitVal}>
                  Rs. {Number(matrix.totalCashBalance || 0).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Bank & Cash Statement Matrix</Text>

          {(matrix.accounts || []).map((acc: any) => (
            <View key={acc.accountId} style={styles.accCard}>
              <View style={styles.accHeader}>
                <Feather
                  name={acc.accountType === 'BANK' ? 'credit-card' : 'dollar-sign'}
                  size={16}
                  color="#2563EB"
                />
                <Text style={styles.accName}>{acc.accountName}</Text>
              </View>

              <View style={styles.accDetails}>
                <View style={styles.detailItem}>
                  <Text style={styles.dLbl}>Opening</Text>
                  <Text style={styles.dVal}>Rs. {Number(acc.openingBalance || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.dLbl}>Money In</Text>
                  <Text style={[styles.dVal, { color: '#16A34A' }]}>
                    Rs. {Number(acc.totalInput || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.dLbl}>Money Out</Text>
                  <Text style={[styles.dVal, { color: '#DC2626' }]}>
                    Rs. {Number(acc.totalOutput || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.dLbl}>Closing</Text>
                  <Text style={[styles.dVal, { fontWeight: '900' }]}>
                    Rs. {Number(acc.closingBalance || 0).toLocaleString()}
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
        currentRoute="monthly-reports"
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
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  periodTxt: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  summaryVal: { fontSize: 20, fontWeight: '900', color: '#60A5FA', marginTop: 2 },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pdfTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  splitRow: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1E293B' },
  splitBox: { flex: 1 },
  splitLbl: { fontSize: 10, color: '#94A3B8', fontWeight: '700' },
  splitVal: { fontSize: 13, fontWeight: '900', color: '#FFFFFF', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  accCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  accHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  accName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  accDetails: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  detailItem: { alignItems: 'flex-start' },
  dLbl: { fontSize: 9, color: '#64748B', fontWeight: '700' },
  dVal: { fontSize: 11, fontWeight: '700', color: '#1E293B', marginTop: 2 },
});
