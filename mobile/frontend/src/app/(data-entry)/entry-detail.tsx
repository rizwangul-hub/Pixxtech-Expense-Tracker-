import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { transactionsAPI, reportsAPI } from '@/services/api';
import StatusBadge from '@/components/StatusBadge';

export default function EntryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; isPending: string; data: string }>();

  const [deleting, setDeleting] = useState(false);

  // Parse raw entry data
  let entry: any = null;
  try {
    if (params.data) {
      entry = JSON.parse(params.data);
    }
  } catch (err) {
    console.warn('Failed to parse entry detail data:', err);
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Entry Details</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Entry record not found or could not be loaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPending = params.isPending === 'true' || entry.status === 'PENDING_VERIFICATION';
  const isRent = entry.entryType === 'RENT' || entry.transactionType === 'RENT';
  const status = entry.status || (isPending ? 'PENDING_VERIFICATION' : 'VERIFIED');
  const amount = Number(entry.amount || 0);

  const propertyName =
    typeof entry.propertyId === 'object' && entry.propertyId?.plazaName
      ? entry.propertyId.plazaName
      : 'General / No Property';

  const accountName =
    entry.receivingAccountId?.name ||
    entry.crAccountId?.name ||
    entry.drAccountId?.name ||
    'Operational Account';

  const handleDelete = () => {
    Alert.alert(
      'Delete Pending Entry',
      `Are you sure you want to delete this pending ${isRent ? 'rent record' : 'expense voucher'}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Entry',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              const res = await transactionsAPI.deleteTransaction(entry._id || params.id);
              if (res.success) {
                Alert.alert('Deleted', res.message || 'Pending entry was removed.', [
                  {
                    text: 'OK',
                    onPress: () => router.back(),
                  },
                ]);
              } else {
                Alert.alert('Error', res.message || 'Failed to delete entry.');
              }
            } catch (err: any) {
              Alert.alert(
                'Delete Failed',
                err.response?.data?.message || 'Server rejected deletion request.'
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>
          {isRent ? 'Rent Collection Details' : `Voucher Details`}
        </Text>
        {entry._id ? (
          <TouchableOpacity
            style={styles.pdfTopBarBtn}
            activeOpacity={0.7}
            onPress={async () => {
              try {
                const voucherPdfUrl = await reportsAPI.getVoucherPDFUrl(entry._id);
                if (await Linking.canOpenURL(voucherPdfUrl)) {
                  await WebBrowser.openBrowserAsync(voucherPdfUrl);
                } else {
                  await Linking.openURL(voucherPdfUrl);
                }
              } catch (e) {
                Alert.alert('PDF Viewer', 'Could not open voucher PDF.');
              }
            }}
          >
            <Feather name="file-text" size={13} color="#2563EB" />
            <Text style={styles.pdfTopBarBtnText}>PDF</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Main Header Card */}
        <View style={styles.mainCard}>
          <View style={styles.headerRow}>
            <View style={styles.badgeWrap}>
              <StatusBadge status={status} size="medium" />
            </View>
            <Text style={styles.dateText}>
              {entry.date ? new Date(entry.date).toISOString().split('T')[0] : '—'}
            </Text>
          </View>

          <Text style={styles.amountText}>PKR {amount.toLocaleString()}</Text>
          <Text style={styles.voucherSubtitle}>
            {entry.voucherNo ? `Voucher #${entry.voucherNo}` : 'Pending Voucher Number'}
          </Text>

          {isPending && (
            <View style={styles.pendingNotice}>
              <Feather name="clock" size={14} color="#B45309" style={{ marginRight: 6 }} />
              <Text style={styles.pendingNoticeText}>
                Awaiting review and verification by Khurshid Anwar
              </Text>
            </View>
          )}
        </View>

        {/* Detailed Fields Section */}
        <Text style={styles.sectionTitle}>TRANSACTION DETAILS</Text>
        <View style={styles.detailCard}>
          {/* Property */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Property Plaza</Text>
            <Text style={styles.fieldValue}>
              {entry.propertyId?.plazaName || 'No Property (General)'}
            </Text>
          </View>
          <View style={styles.divider} />

          {/* Unit */}
          {entry.unitId ? (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Leasable Unit</Text>
                <Text style={styles.fieldValue}>
                  {typeof entry.unitId === 'object' ? entry.unitId.unitName : entry.unitId}
                </Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          {/* Classification */}
          {entry.expenseClassification ? (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Classification</Text>
                <Text style={styles.fieldValue}>
                  {entry.expenseClassification.replace(/_/g, ' ')}
                </Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          {/* Category / Head */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Account Head</Text>
            <Text style={styles.fieldValue}>
              {entry.categoryId?.name || (isRent ? 'Rental Income' : 'Expense Head')}
            </Text>
          </View>
          <View style={styles.divider} />

          {/* Account */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>
              {isRent ? 'Receiving Account' : 'Paid From Account'}
            </Text>
            <Text style={styles.fieldValue}>
              {entry.receivingAccountId?.name ||
                entry.crAccountId?.name ||
                entry.drAccountId?.name ||
                'Operational Account'}
            </Text>
          </View>
          <View style={styles.divider} />

          {/* Tenant (if rent) */}
          {entry.tenantId ? (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Tenant Name</Text>
                <Text style={styles.fieldValue}>{entry.tenantId.fullName || 'Tenant'}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          {/* Rent Month (if rent) */}
          {entry.rentMonth ? (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Rent Month</Text>
                <Text style={styles.fieldValue}>{entry.rentMonth}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          {/* Narration / Detail */}
          <View style={[styles.fieldRow, { alignItems: 'flex-start' }]}>
            <Text style={styles.fieldLabel}>Narration / Detail</Text>
            <Text style={[styles.fieldValue, { flex: 1, textAlign: 'right' }]}>
              {entry.detail || '—'}
            </Text>
          </View>
        </View>

        {/* Audit & Submission Info */}
        <Text style={styles.sectionTitle}>SUBMISSION & AUDIT LOG</Text>
        <View style={styles.detailCard}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Submitted By</Text>
            <Text style={styles.fieldValue}>
              {entry.submittedByName || entry.submittedBy?.name || entry.createdBy?.name || 'Sarfraz'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Submitted At</Text>
            <Text style={styles.fieldValue}>
              {entry.submittedAt || entry.createdAt
                ? new Date(entry.submittedAt || entry.createdAt).toLocaleString('en-PK')
                : '—'}
            </Text>
          </View>
        </View>

        {/* Section: Official Company Voucher Document & Signatures */}
        <Text style={styles.sectionTitle}>OFFICIAL COMPANY VOUCHER DOCUMENT</Text>
        <View style={styles.voucherDocCard}>
          {/* Company Header */}
          <View style={styles.voucherDocHeader}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.voucherDocLogo}
              resizeMode="contain"
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.voucherDocOrgName}>PIXX TECHNOLOGIES</Text>
              <Text style={styles.voucherDocAddress}>
                Basement Office 4C, Chanbeli Block, Bahria Town Lahore
              </Text>
              <Text style={styles.voucherDocPhone}>Phone: 0345 9028996</Text>
            </View>
          </View>

          <View style={styles.voucherDocDivider} />

          {/* Voucher Reference & Metadata */}
          <View style={styles.voucherDocMetaRow}>
            <View>
              <Text style={styles.voucherDocMetaLabel}>VOUCHER NO</Text>
              <Text style={styles.voucherDocMetaValue}>{entry.voucherNo || 'PENDING'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.voucherDocMetaLabel}>DATE</Text>
              <Text style={styles.voucherDocMetaValue}>
                {entry.date ? new Date(entry.date).toLocaleDateString('en-PK') : '—'}
              </Text>
            </View>
          </View>

          {/* Details Table */}
          <View style={styles.voucherDocTable}>
            <View style={styles.voucherDocTableRow}>
              <Text style={styles.voucherDocTableCellLabel}>Property</Text>
              <Text style={styles.voucherDocTableCellVal}>{propertyName}</Text>
            </View>
            {entry.unitId ? (
              <View style={styles.voucherDocTableRow}>
                <Text style={styles.voucherDocTableCellLabel}>Unit</Text>
                <Text style={styles.voucherDocTableCellVal}>
                  {typeof entry.unitId === 'object' ? entry.unitId.unitName : String(entry.unitId)}
                </Text>
              </View>
            ) : null}
            <View style={styles.voucherDocTableRow}>
              <Text style={styles.voucherDocTableCellLabel}>{isRent ? 'Receiving Bank/Cash' : 'Account (Cr)'}</Text>
              <Text style={styles.voucherDocTableCellVal}>{accountName}</Text>
            </View>
            {!isRent && entry.drAccountId && (
              <View style={styles.voucherDocTableRow}>
                <Text style={styles.voucherDocTableCellLabel}>Account (Dr)</Text>
                <Text style={styles.voucherDocTableCellVal}>{entry.drAccountId?.name || 'Clearing Account'}</Text>
              </View>
            )}
            <View style={styles.voucherDocTableRow}>
              <Text style={styles.voucherDocTableCellLabel}>Amount</Text>
              <Text style={[styles.voucherDocTableCellVal, { fontWeight: '700', color: isRent ? '#16A34A' : '#DC2626' }]}>
                PKR {amount.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.voucherDocTableRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.voucherDocTableCellLabel}>Detail</Text>
              <Text style={[styles.voucherDocTableCellVal, { flex: 1, textAlign: 'right' }]}>
                {entry.detail || '—'}
              </Text>
            </View>
          </View>

          {/* Signatures Section */}
          <View style={styles.voucherDocSignatures}>
            <View style={styles.signatureBox}>
              <Text style={styles.signatureBoxLabel}>PREPARED BY</Text>
              <Image
                source={require('@/assets/images/sarfrazsign.png')}
                style={styles.signatureImage}
                resizeMode="contain"
              />
              <Text style={styles.signaturePersonName}>Sarfraz</Text>
              <Text style={styles.signaturePersonRole}>Data Entry & Operations</Text>
            </View>

            <View style={styles.signatureBox}>
              <Text style={styles.signatureBoxLabel}>CHECKED & APPROVED BY</Text>
              <Image
                source={require('@/assets/images/khurshidsign.png')}
                style={styles.signatureImage}
                resizeMode="contain"
              />
              <Text style={styles.signaturePersonName}>Khurshid Anwar</Text>
              <Text style={styles.signaturePersonRole}>Financial Auditor & Manager</Text>
            </View>
          </View>
        </View>

        {/* Action Controls */}
        {isPending ? (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={deleting}
              activeOpacity={0.8}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <View style={styles.deleteRow}>
                  <Feather name="trash-2" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                  <Text style={styles.deleteButtonText}>Delete Pending Submission</Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.deleteHint}>
              You can delete this entry as long as it has not been reviewed by Admin.
            </Text>
          </View>
        ) : (
          <View style={styles.lockedNotice}>
            <Feather name="lock" size={16} color="#64748B" style={{ marginRight: 8 }} />
            <Text style={styles.lockedNoticeText}>
              This transaction has been officially verified and locked by Administration. Modifications can only be performed by authorized management.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  amountText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  voucherSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 14,
  },
  pendingNoticeText: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    maxWidth: '65%',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  actionContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  deleteButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  deleteHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  lockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
  pdfTopBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 4,
  },
  pdfTopBarBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  voucherDocCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  voucherDocHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
  },
  voucherDocLogo: {
    width: 44,
    height: 44,
  },
  voucherDocOrgName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  voucherDocAddress: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
    marginTop: 1,
  },
  voucherDocPhone: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 1,
  },
  voucherDocDivider: {
    height: 1.5,
    backgroundColor: '#0F172A',
    marginVertical: 10,
  },
  voucherDocMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  voucherDocMetaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  voucherDocMetaValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  voucherDocTable: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  voucherDocTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  voucherDocTableCellLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  voucherDocTableCellVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    maxWidth: '65%',
    textAlign: 'right',
  },
  voucherDocSignatures: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 12,
  },
  signatureBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  signatureBoxLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  signatureImage: {
    height: 38,
    width: 90,
    marginVertical: 4,
  },
  signaturePersonName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  signaturePersonRole: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
});
