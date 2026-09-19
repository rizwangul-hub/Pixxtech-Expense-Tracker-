import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { reportsAPI } from '@/services/api';

const formatPKR = (val?: number): string => {
  if (val === undefined || val === null || isNaN(val)) return 'Rs. 0.00';
  const isNeg = val < 0;
  const formatted = 'Rs. ' + Math.abs(val).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNeg ? `(${formatted})` : formatted;
};

// Calculate last day of month string e.g. "31-08-2026"
const formatAsOnDate = (monthStr: string): string => {
  try {
    const [y, m] = monthStr.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(lastDay)}-${pad(m)}-${y}`;
  } catch {
    return monthStr;
  }
};

export default function ReportsScreen() {
  const router = useRouter();

  // Active Month Filter
  const [selectedMonth, setSelectedMonth] = useState('2026-08');

  // Active Report Tab: MONTHLY | RENTAL | HEAD_WISE | LEDGERS
  const [activeTab, setActiveTab] = useState<'MONTHLY' | 'RENTAL' | 'HEAD_WISE' | 'LEDGERS'>('MONTHLY');

  // Tab 1: Monthly Financial Summary Data
  const [monthlyData, setMonthlyData] = useState<any>(null);

  // Tab 2: Rental Income Summary Data
  const [rentalData, setRentalData] = useState<any>(null);
  const [expandedPlazaId, setExpandedPlazaId] = useState<string | null>(null);

  // Tab 3: Head-Wise Expense Summary Data
  const [headWiseData, setHeadWiseData] = useState<any>(null);
  const [headSearch, setHeadSearch] = useState('');

  // General States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadReportData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      if (activeTab === 'MONTHLY') {
        const res = await reportsAPI.getMonthlyFinancialSummary(selectedMonth);
        setMonthlyData(res);
      } else if (activeTab === 'RENTAL') {
        const res = await reportsAPI.getRentalIncomeSummary(selectedMonth);
        setRentalData(res);
      } else if (activeTab === 'HEAD_WISE') {
        const res = await reportsAPI.getHeadWiseSummary(selectedMonth);
        setHeadWiseData(res);
      }
    } catch (err) {
      console.error('[ReportsScreen] Failed to load report:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, selectedMonth]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Handle PDF Download & View
  const handleOpenPDF = async () => {
    try {
      setPdfLoading(true);
      const pdfUrl = await reportsAPI.getFundsPDFUrl(selectedMonth);
      if (await Linking.canOpenURL(pdfUrl)) {
        await WebBrowser.openBrowserAsync(pdfUrl);
      } else {
        await Linking.openURL(pdfUrl);
      }
    } catch (err: any) {
      console.error('[ReportsScreen] PDF opening error:', err);
      Alert.alert('PDF Error', 'Failed to launch PDF viewer. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  const togglePlazaExpand = (id: string) => {
    setExpandedPlazaId((prev) => (prev === id ? null : id));
  };

  const asOnDate = formatAsOnDate(selectedMonth);
  const matrix = monthlyData?.accountMatrix;
  const grandTotal = matrix?.grandTotal;

  // Filtered heads for Head-Wise tab
  const filteredHeads = (headWiseData?.heads || []).filter((h: any) => {
    if (!headSearch.trim()) return true;
    return h.headName.toLowerCase().includes(headSearch.trim().toLowerCase());
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Report Center</Text>
          <Text style={styles.headerSubtitle}>
            Official Central Ledger Reports & Balance Sheets
          </Text>
        </View>
        <TouchableOpacity
          style={styles.pdfActionBtn}
          onPress={handleOpenPDF}
          disabled={pdfLoading}
        >
          {pdfLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="download" size={14} color="#FFFFFF" />
              <Text style={styles.pdfActionBtnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Period Selection Strip */}
      <View style={styles.monthStrip}>
        <Text style={styles.periodLabel}>REPORTING PERIOD:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthScroll}>
          {['2026-08', '2026-09', '2026-07'].map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.monthChip, selectedMonth === m && styles.monthChipActive]}
              onPress={() => setSelectedMonth(m)}
            >
              <Text
                style={[
                  styles.monthChipText,
                  selectedMonth === m && styles.monthChipTextActive,
                ]}
              >
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Report Type Tabs */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'MONTHLY' && styles.tabButtonActive]}
            onPress={() => setActiveTab('MONTHLY')}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'MONTHLY' && styles.tabButtonTextActive,
              ]}
            >
              Monthly Statement
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'RENTAL' && styles.tabButtonActive]}
            onPress={() => setActiveTab('RENTAL')}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'RENTAL' && styles.tabButtonTextActive,
              ]}
            >
              Rental Income
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'HEAD_WISE' && styles.tabButtonActive]}
            onPress={() => setActiveTab('HEAD_WISE')}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'HEAD_WISE' && styles.tabButtonTextActive,
              ]}
            >
              Head-Wise Expenses
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'LEDGERS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('LEDGERS')}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'LEDGERS' && styles.tabButtonTextActive,
              ]}
            >
              Ledgers & Launchers
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Body */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Compiling report from central ledger...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadReportData(true)}
              colors={['#2563EB']}
            />
          }
        >
          {/* ================= TAB 1: MONTHLY FINANCIAL REPORT ================= */}
          {activeTab === 'MONTHLY' && (
            <View>
              {/* Header Box: As On Date */}
              <View style={styles.reportTitleBox}>
                <Text style={styles.mainReportHeading}>OPENING & CLOSING BALANCE DETAIL</Text>
                <Text style={styles.reportAsOnSub}>Cash & Bank A/C • As On {asOnDate}</Text>
              </View>

              {/* Formula Card */}
              <View style={styles.formulaCard}>
                {/* 1. Opening Balance */}
                <View style={styles.formulaRow}>
                  <View style={styles.formulaRowLeft}>
                    <View style={[styles.formulaDot, { backgroundColor: '#64748B' }]} />
                    <Text style={styles.formulaRowTitle}>Opening Balance</Text>
                  </View>
                  <Text style={styles.formulaRowValue}>{formatPKR(grandTotal?.openingBalance)}</Text>
                </View>

                {/* 2. INPUT Section */}
                <View style={styles.formulaSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionHeadingTitle, { color: '#15803D' }]}>INPUT (+)</Text>
                  </View>

                  <View style={styles.subFormulaRow}>
                    <Text style={styles.subFormulaLabel}>Rental Income</Text>
                    <Text style={styles.subFormulaVal}>{formatPKR(grandTotal?.rentalIncome)}</Text>
                  </View>
                  <View style={styles.subFormulaRow}>
                    <Text style={styles.subFormulaLabel}>Other Input</Text>
                    <Text style={styles.subFormulaVal}>{formatPKR(grandTotal?.otherInput)}</Text>
                  </View>
                  <View style={styles.sectionTotalRow}>
                    <Text style={styles.sectionTotalLabel}>Total Input</Text>
                    <Text style={[styles.sectionTotalVal, { color: '#16A34A' }]}>
                      + {formatPKR(grandTotal?.totalInput)}
                    </Text>
                  </View>
                </View>

                {/* 3. OUTPUT Section */}
                <View style={styles.formulaSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionHeadingTitle, { color: '#B91C1C' }]}>OUTPUT (-)</Text>
                  </View>

                  <View style={styles.subFormulaRow}>
                    <Text style={styles.subFormulaLabel}>Rental Expenses</Text>
                    <Text style={styles.subFormulaVal}>{formatPKR(grandTotal?.rentalExpenses)}</Text>
                  </View>
                  <View style={styles.subFormulaRow}>
                    <Text style={styles.subFormulaLabel}>Other Expenses</Text>
                    <Text style={styles.subFormulaVal}>{formatPKR(grandTotal?.otherExpenses)}</Text>
                  </View>
                  <View style={styles.sectionTotalRow}>
                    <Text style={styles.sectionTotalLabel}>Total Output</Text>
                    <Text style={[styles.sectionTotalVal, { color: '#DC2626' }]}>
                      - {formatPKR(grandTotal?.totalOutput)}
                    </Text>
                  </View>
                </View>

                {/* 4. Closing Balance */}
                <View style={[styles.formulaRow, styles.closingRow]}>
                  <View style={styles.formulaRowLeft}>
                    <Feather name="shield" size={16} color="#16A34A" style={{ marginRight: 6 }} />
                    <Text style={styles.closingRowTitle}>Closing Balance</Text>
                  </View>
                  <Text style={styles.closingRowValue}>{formatPKR(grandTotal?.closingBalance)}</Text>
                </View>
              </View>

              {/* Sub-Matrix: Bank Accounts Breakdown */}
              <Text style={styles.breakdownSectionHeading}>BANK ACCOUNTS BREAKDOWN</Text>
              <View style={styles.matrixCard}>
                {(matrix?.bankRows || []).map((row: any) => (
                  <View key={row.accountId} style={styles.matrixRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matrixRowName}>{row.accountName}</Text>
                      <Text style={styles.matrixRowSub}>
                        {row.accountNumber ? `A/C: ${row.accountNumber}` : 'Bank Account'}
                      </Text>
                      <View style={styles.matrixFlowRow}>
                        <Text style={styles.matrixFlowText}>
                          In: {formatPKR(row.totalInput)} • Out: {formatPKR(row.totalOutput)}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.matrixClosingBal}>{formatPKR(row.closingBalance)}</Text>
                      <Text style={styles.matrixOpeningBal}>Open: {formatPKR(row.openingBalance)}</Text>
                    </View>
                  </View>
                ))}
                <View style={styles.matrixTotalFooter}>
                  <Text style={styles.matrixTotalFooterText}>Total Bank Balance</Text>
                  <Text style={styles.matrixTotalFooterVal}>{formatPKR(matrix?.totalBankBalance)}</Text>
                </View>
              </View>

              {/* Sub-Matrix: Cash Custodians Breakdown */}
              <Text style={styles.breakdownSectionHeading}>CASH CUSTODIANS (CASH IN HAND)</Text>
              <View style={styles.matrixCard}>
                {(matrix?.cashRows || []).map((row: any) => (
                  <View key={row.accountId} style={styles.matrixRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matrixRowName}>{row.accountName}</Text>
                      <Text style={styles.matrixRowSub}>Cash in Hand</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.matrixClosingBal}>{formatPKR(row.closingBalance)}</Text>
                      <Text style={styles.matrixOpeningBal}>Open: {formatPKR(row.openingBalance)}</Text>
                    </View>
                  </View>
                ))}
                <View style={styles.matrixTotalFooter}>
                  <Text style={styles.matrixTotalFooterText}>Total Cash in Hand</Text>
                  <Text style={styles.matrixTotalFooterVal}>{formatPKR(matrix?.totalCashBalance)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* ================= TAB 2: RENTAL INCOME SUMMARY ================= */}
          {activeTab === 'RENTAL' && (
            <View>
              {/* Header Box */}
              <View style={styles.reportTitleBox}>
                <Text style={styles.mainReportHeading}>RENTAL INCOME SUMMARY</Text>
                <Text style={styles.reportAsOnSub}>
                  {rentalData?.period ? `${rentalData.period} Rent Period` : selectedMonth}
                </Text>
              </View>

              {/* Grand Totals Bar */}
              {rentalData?.grandTotals && (
                <View style={styles.rentalTotalsCard}>
                  <Text style={styles.rentalTotalsHeading}>GRAND TOTALS SUMMARY</Text>
                  <View style={styles.rentalTotalsGrid}>
                    <View style={styles.rentalTotalCol}>
                      <Text style={styles.rentalTotalLabel}>Agreed Rent</Text>
                      <Text style={styles.rentalTotalVal}>
                        {formatPKR(rentalData.grandTotals.totalAgreedRent)}
                      </Text>
                    </View>
                    <View style={styles.rentalTotalCol}>
                      <Text style={styles.rentalTotalLabel}>Received</Text>
                      <Text style={[styles.rentalTotalVal, { color: '#16A34A' }]}>
                        {formatPKR(rentalData.grandTotals.totalReceivedAmount)}
                      </Text>
                    </View>
                    <View style={styles.rentalTotalCol}>
                      <Text style={styles.rentalTotalLabel}>Receivable</Text>
                      <Text style={[styles.rentalTotalVal, { color: '#DC2626' }]}>
                        {formatPKR(rentalData.grandTotals.totalOutstandingReceivable)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Property / Plaza Grouping */}
              <Text style={styles.breakdownSectionHeading}>PROPERTY & PLAZA BREAKDOWN</Text>
              {(rentalData?.plazas || []).map((plaza: any) => {
                const isExpanded = expandedPlazaId === plaza.plazaId;
                const units = plaza.units || [];

                return (
                  <View key={plaza.plazaId} style={styles.plazaCard}>
                    <TouchableOpacity
                      style={styles.plazaHeader}
                      activeOpacity={0.7}
                      onPress={() => togglePlazaExpand(plaza.plazaId)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.plazaTitle}>{plaza.plazaName}</Text>
                        <Text style={styles.plazaSub}>
                          {units.length} Units • {plaza.plazaLocation || 'Lahore'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                        <Text style={styles.plazaRentSubtotal}>
                          {formatPKR(plaza.subtotalAgreedRent)}
                        </Text>
                        <Text style={styles.plazaRecSubtotal}>
                          Rec: {formatPKR(plaza.subtotalReceivable)}
                        </Text>
                      </View>
                      <Feather
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#64748B"
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.plazaUnitsList}>
                        {units.map((unit: any) => (
                          <View key={unit.unitId} style={styles.unitRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.unitRowName}>{unit.unitName}</Text>
                              <Text style={styles.unitRowTenant}>
                                {unit.tenantName || 'Vacant Unit'}
                              </Text>
                              <Text style={styles.unitRowAccount}>
                                A/C: {unit.receivingAccountName || 'Pending'}
                              </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={styles.unitRowAgreed}>
                                Rent: {formatPKR(unit.agreedRent)}
                              </Text>
                              <Text style={styles.unitRowReceived}>
                                Paid: {formatPKR(unit.receivedAmount)}
                              </Text>
                              <Text
                                style={[
                                  styles.unitRowDue,
                                  { color: (unit.outstandingReceivable || 0) > 0 ? '#DC2626' : '#16A34A' },
                                ]}
                              >
                                Due: {formatPKR(unit.outstandingReceivable)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* ================= TAB 3: HEAD-WISE EXPENSE SUMMARY ================= */}
          {activeTab === 'HEAD_WISE' && (
            <View>
              {/* Header Box */}
              <View style={styles.reportTitleBox}>
                <Text style={styles.mainReportHeading}>EXPENSES REPORT HEAD-WISE</Text>
                <Text style={styles.reportAsOnSub}>
                  Total Overall: {formatPKR(headWiseData?.totalExpensesOverall)}
                </Text>
              </View>

              {/* Classification Totals Cards */}
              <View style={styles.classTotalsCard}>
                <View style={styles.classTotalCol}>
                  <Text style={styles.classTotalLabel}>General</Text>
                  <Text style={styles.classTotalVal}>
                    {formatPKR(headWiseData?.classificationTotals?.generalExpenses)}
                  </Text>
                </View>
                <View style={styles.classTotalDivider} />
                <View style={styles.classTotalCol}>
                  <Text style={styles.classTotalLabel}>Property Own</Text>
                  <Text style={styles.classTotalVal}>
                    {formatPKR(headWiseData?.classificationTotals?.propertyOwnExpenses)}
                  </Text>
                </View>
                <View style={styles.classTotalDivider} />
                <View style={styles.classTotalCol}>
                  <Text style={styles.classTotalLabel}>Unit Expenses</Text>
                  <Text style={styles.classTotalVal}>
                    {formatPKR(headWiseData?.classificationTotals?.unitExpenses)}
                  </Text>
                </View>
              </View>

              {/* Search Heads */}
              <View style={styles.searchBar}>
                <Feather name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Filter expense heads..."
                  placeholderTextColor="#94A3B8"
                  value={headSearch}
                  onChangeText={setHeadSearch}
                />
                {headSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setHeadSearch('')}>
                    <Feather name="x" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Heads List */}
              <View style={styles.headsContainer}>
                {filteredHeads.length === 0 ? (
                  <Text style={styles.emptyHeadsText}>No expense heads match your query.</Text>
                ) : (
                  filteredHeads.map((head: any) => (
                    <View key={head.categoryId} style={styles.headCard}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.headCardName}>{head.headName}</Text>
                        <Text style={styles.headCardTxCount}>
                          {head.transactionCount || 0} Transactions Recorded
                        </Text>
                      </View>
                      <Text style={styles.headCardAmount}>{formatPKR(head.totalSpent)}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* ================= TAB 4: LEDGERS & LAUNCHERS ================= */}
          {activeTab === 'LEDGERS' && (
            <View>
              <Text style={styles.breakdownSectionHeading}>EXECUTIVE FINANCIAL LAUNCHERS</Text>

              {/* Launcher 1: Bank Ledgers */}
              <TouchableOpacity
                style={styles.launcherCard}
                activeOpacity={0.7}
                onPress={() => router.push('/(admin)/ledgers')}
              >
                <View style={[styles.launcherIconBox, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="bank-outline" size={24} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.launcherTitle}>Bank Account Ledgers</Text>
                  <Text style={styles.launcherSubtitle}>
                    Running statements for ABL, Bank Al Falah, and UBL accounts
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color="#94A3B8" />
              </TouchableOpacity>

              {/* Launcher 2: Cash Custodian Ledgers */}
              <TouchableOpacity
                style={styles.launcherCard}
                activeOpacity={0.7}
                onPress={() => router.push('/(admin)/ledgers')}
              >
                <View style={[styles.launcherIconBox, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="cash-multiple" size={24} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.launcherTitle}>Cash in Hand Ledgers</Text>
                  <Text style={styles.launcherSubtitle}>
                    Running balances for Majid Javed, Sabir Nawaz, Sarfraz, and Naveed
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color="#94A3B8" />
              </TouchableOpacity>

              {/* Launcher 3: Master Transactions */}
              <TouchableOpacity
                style={styles.launcherCard}
                activeOpacity={0.7}
                onPress={() => router.push('/(admin)/transactions')}
              >
                <View style={[styles.launcherIconBox, { backgroundColor: '#F3E8FF' }]}>
                  <MaterialCommunityIcons name="receipt" size={24} color="#9333EA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.launcherTitle}>All Transactions Master Report</Text>
                  <Text style={styles.launcherSubtitle}>
                    Comprehensive search, debit/credit audit trail, and voucher records
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color="#94A3B8" />
              </TouchableOpacity>

              {/* Launcher 4: Properties Roll */}
              <TouchableOpacity
                style={styles.launcherCard}
                activeOpacity={0.7}
                onPress={() => router.push('/(admin)/properties')}
              >
                <View style={[styles.launcherIconBox, { backgroundColor: '#FEF3C7' }]}>
                  <Feather name="grid" size={24} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.launcherTitle}>Properties & Unit Rolls</Text>
                  <Text style={styles.launcherSubtitle}>
                    Plaza occupancy status, agreed rents, and lease agreements
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  pdfActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6,
  },
  pdfActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  monthStrip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  periodLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 8,
    letterSpacing: 0.5,
  },
  monthScroll: {
    gap: 8,
  },
  monthChip: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 6,
  },
  tabScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  tabButtonActive: {
    backgroundColor: '#0F172A',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  reportTitleBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  mainReportHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  reportAsOnSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  formulaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  formulaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  formulaRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formulaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  formulaRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  formulaRowValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  formulaSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  sectionHeaderRow: {
    marginBottom: 6,
  },
  sectionHeadingTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  subFormulaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  subFormulaLabel: {
    fontSize: 12,
    color: '#475569',
  },
  subFormulaVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  sectionTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  sectionTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionTotalVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  closingRow: {
    paddingTop: 14,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  closingRowTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16A34A',
  },
  closingRowValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16A34A',
  },
  breakdownSectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 6,
  },
  matrixCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    overflow: 'hidden',
  },
  matrixRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  matrixRowName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  matrixRowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  matrixFlowRow: {
    marginTop: 4,
  },
  matrixFlowText: {
    fontSize: 11,
    color: '#475569',
  },
  matrixClosingBal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  matrixOpeningBal: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  matrixTotalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
  },
  matrixTotalFooterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  matrixTotalFooterVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
  },
  rentalTotalsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  rentalTotalsHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  rentalTotalsGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    justifyContent: 'space-between',
  },
  rentalTotalCol: {
    alignItems: 'center',
    flex: 1,
  },
  rentalTotalLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  rentalTotalVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  plazaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  plazaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  plazaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  plazaSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  plazaRentSubtotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  plazaRecSubtotal: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 1,
  },
  plazaUnitsList: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 10,
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  unitRowName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  unitRowTenant: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  unitRowAccount: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  unitRowAgreed: {
    fontSize: 12,
    color: '#475569',
  },
  unitRowReceived: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
    marginTop: 1,
  },
  unitRowDue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  classTotalsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  classTotalCol: {
    flex: 1,
    alignItems: 'center',
  },
  classTotalLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  classTotalVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  classTotalDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    height: '80%',
    alignSelf: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  headsContainer: {
    gap: 8,
  },
  headCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  headCardTxCount: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  headCardAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  emptyHeadsText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 24,
  },
  launcherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  launcherIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  launcherTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  launcherSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 12,
  },
});
