import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { verificationAPI, reportsAPI, PendingEntryItem } from '@/services/api';
import { StatusBadge } from '@/components/StatusBadge';

const formatPKR = (val?: number): string => {
  if (val === undefined || val === null || isNaN(val)) return 'Rs. 0.00';
  return 'Rs. ' + Math.abs(val).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export default function VerificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [entry, setEntry] = useState<PendingEntryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editVoucherNo, setEditVoucherNo] = useState('');
  const [editRentMonth, setEditRentMonth] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Reject Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [savingReject, setSavingReject] = useState(false);

  const loadEntry = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await verificationAPI.getPendingEntryById(id);
      if (res?.entry) {
        setEntry(res.entry);
        setEditAmount(String(res.entry.amount || ''));
        setEditDetail(res.entry.detail || '');
        setEditVoucherNo(res.entry.voucherNo || '');
        setEditRentMonth(res.entry.rentMonth || '');
      }
    } catch (err: any) {
      console.error('[VerificationDetail] Failed to load entry:', err);
      Alert.alert(
        'Error',
        err.response?.data?.message || 'Could not load entry details.',
        [{ text: 'Go Back', onPress: () => router.back() }]
      );
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadEntry();
  }, [loadEntry]);

  // Handle Verify (Official double-entry posting)
  const handleVerify = () => {
    if (!entry) return;

    Alert.alert(
      'Confirm Verification',
      `Are you sure you want to verify and post this ${entry.entryType} of ${formatPKR(entry.amount)} to the official Central Ledger?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify & Post',
          style: 'default',
          onPress: async () => {
            try {
              setActionLoading(true);
              const res = await verificationAPI.verifyEntry(entry._id);
              Alert.alert(
                'Entry Verified',
                res.message || 'The voucher has been officially posted to the central ledger.',
                [
                  {
                    text: 'OK',
                    onPress: () => router.back(),
                  },
                ]
              );
            } catch (err: any) {
              console.error('[VerificationDetail] Verify failed:', err);
              Alert.alert(
                'Verification Failed',
                err.response?.data?.message || err.message || 'Could not verify entry.'
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Handle Edit Submission
  const handleSaveEdit = async () => {
    if (!entry) return;
    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid numeric amount.');
      return;
    }

    try {
      setSavingEdit(true);
      const res = await verificationAPI.updatePendingEntry(entry._id, {
        amount: numAmount,
        detail: editDetail.trim(),
        voucherNo: editVoucherNo.trim(),
        rentMonth: editRentMonth.trim() || undefined,
        editNotes: editNotes.trim() || 'Audited by Khurshid Anwar prior to approval',
      });

      setShowEditModal(false);
      Alert.alert('Saved', res.message || 'Entry updated successfully.');
      loadEntry();
    } catch (err: any) {
      console.error('[VerificationDetail] Update failed:', err);
      Alert.alert(
        'Update Failed',
        err.response?.data?.message || err.message || 'Failed to update entry.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Reject Submission
  const handleSaveReject = async () => {
    if (!entry) return;
    if (!rejectionReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a clear reason for rejecting this entry.');
      return;
    }

    try {
      setSavingReject(true);
      const res = await verificationAPI.rejectEntry(entry._id, rejectionReason.trim());
      setShowRejectModal(false);
      Alert.alert(
        'Entry Rejected',
        res.message || 'Entry marked as REJECTED. No financial transaction was created.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err: any) {
      console.error('[VerificationDetail] Reject failed:', err);
      Alert.alert(
        'Reject Failed',
        err.response?.data?.message || err.message || 'Failed to reject entry.'
      );
    } finally {
      setSavingReject(false);
    }
  };

  // Handle Delete
  const handleDelete = () => {
    if (!entry) return;

    Alert.alert(
      'Confirm Deletion',
      `Permanently delete this pending ${entry.entryType} record? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              await verificationAPI.deletePendingEntry(entry._id);
              Alert.alert(
                'Deleted',
                'Pending record removed successfully.',
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (err: any) {
              console.error('[VerificationDetail] Delete failed:', err);
              Alert.alert(
                'Delete Failed',
                err.response?.data?.message || err.message || 'Failed to delete entry.'
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading voucher details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>Voucher Not Found</Text>
          <TouchableOpacity style={styles.goBackBtn} onPress={() => router.back()}>
            <Text style={styles.goBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isRent = entry.entryType === 'RENT';
  const isPending = entry.status === 'PENDING_VERIFICATION' || entry.status === 'EDITED';

  const propertyName =
    typeof entry.propertyId === 'object' && entry.propertyId?.plazaName
      ? entry.propertyId.plazaName
      : 'General / No Property';

  const accountName =
    (isRent ? entry.receivingAccountId?.name : entry.crAccountId?.name) || 'Not specified';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Review Entry</Text>
          <Text style={styles.headerSubtitle}>
            {entry.voucherNo ? `Voucher #${entry.voucherNo}` : 'Pending Submission'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.pdfHeaderBtn}
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
          <Feather name="file-text" size={14} color="#2563EB" />
          <Text style={styles.pdfHeaderBtnText}>Voucher PDF</Text>
        </TouchableOpacity>
        <View style={{ marginLeft: 8 }}>
          <StatusBadge status={entry.status} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Main Amount Banner */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>
            {isRent ? 'RENT AMOUNT COLLECTED' : 'EXPENSE VOUCHER AMOUNT'}
          </Text>
          <Text
            style={[
              styles.amountValue,
              { color: isRent ? '#16A34A' : '#DC2626' },
            ]}
          >
            {formatPKR(entry.amount)}
          </Text>
          <View style={styles.dateBadge}>
            <Feather name="calendar" size={13} color="#64748B" />
            <Text style={styles.dateBadgeText}>{formatDate(entry.date)}</Text>
            {entry.rentMonth && (
              <Text style={styles.monthBadgeText}>• Month: {entry.rentMonth}</Text>
            )}
          </View>
        </View>

        {/* Section: Financial & Accounting Classification */}
        <Text style={styles.sectionTitle}>ACCOUNTING & CLASSIFICATION</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Entry Type</Text>
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{entry.entryType}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account Head</Text>
            <Text style={[styles.infoValue, { fontWeight: '700' }]}>
              {entry.categoryId?.name || (isRent ? 'Rental Income' : 'General')}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Classification</Text>
            <Text style={styles.infoValue}>
              {entry.expenseClassification || (isRent ? 'RENTAL_INCOME' : 'GENERAL_EXPENSE')}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              {isRent ? 'Receiving Account' : 'Disbursing Account (Cr)'}
            </Text>
            <Text style={[styles.infoValue, { color: '#2563EB', fontWeight: '600' }]}>
              {accountName}
            </Text>
          </View>

          {!isRent && entry.drAccountId && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Debit Account (Dr)</Text>
                <Text style={styles.infoValue}>{entry.drAccountId?.name || 'Clearing Account'}</Text>
              </View>
            </>
          )}
        </View>

        {/* Section: Operational & Property Details */}
        <Text style={styles.sectionTitle}>OPERATIONAL DETAILS</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Property / Plaza</Text>
            <Text style={styles.infoValue}>{propertyName}</Text>
          </View>

          {entry.unitId && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Unit</Text>
                <Text style={styles.infoValue}>{String(entry.unitId)}</Text>
              </View>
            </>
          )}

          {entry.tenantId && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Tenant</Text>
                <Text style={styles.infoValue}>{entry.tenantId.fullName || '—'}</Text>
              </View>
            </>
          )}

          <View style={styles.divider} />
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Detail / Narration</Text>
            <Text style={styles.narrationText}>
              {entry.detail || 'No additional details provided.'}
            </Text>
          </View>
        </View>

        {/* Section: Audit & Submission Trail */}
        <Text style={styles.sectionTitle}>AUDIT & OPERATOR TRAIL</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Prepared By</Text>
            <Text style={styles.infoValue}>
              {entry.submittedByName || entry.submittedBy?.name || 'Sarfraz'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Submitted At</Text>
            <Text style={styles.infoValue}>{formatDate(entry.submittedAt)}</Text>
          </View>

          {entry.rejectionReason && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoCol}>
                <Text style={[styles.infoLabel, { color: '#DC2626' }]}>Rejection Reason</Text>
                <Text style={[styles.narrationText, { color: '#DC2626' }]}>
                  {entry.rejectionReason}
                </Text>
              </View>
            </>
          )}
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
              <Text style={styles.voucherDocMetaValue}>{formatDate(entry.date)}</Text>
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
                  {typeof entry.unitId === 'object' ? (entry.unitId as any).unitName : String(entry.unitId)}
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
                {formatPKR(entry.amount)}
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
      </ScrollView>

      {/* Bottom Actions Toolbar for Administrator */}
      {isPending && (
        <View style={styles.bottomBar}>
          {/* Reject Button */}
          <TouchableOpacity
            style={styles.rejectBtn}
            activeOpacity={0.7}
            disabled={actionLoading}
            onPress={() => setShowRejectModal(true)}
          >
            <Feather name="x-circle" size={16} color="#DC2626" />
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>

          {/* Edit Button */}
          <TouchableOpacity
            style={styles.editBtn}
            activeOpacity={0.7}
            disabled={actionLoading}
            onPress={() => setShowEditModal(true)}
          >
            <Feather name="edit-3" size={16} color="#475569" />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>

          {/* Delete Button */}
          <TouchableOpacity
            style={styles.deleteBtn}
            activeOpacity={0.7}
            disabled={actionLoading}
            onPress={handleDelete}
          >
            <Feather name="trash-2" size={16} color="#DC2626" />
          </TouchableOpacity>

          {/* Primary Action: Verify & Post */}
          <TouchableOpacity
            style={styles.verifyBtn}
            activeOpacity={0.8}
            disabled={actionLoading}
            onPress={handleVerify}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="check" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.verifyBtnText}>Verify & Post</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ================= EDIT MODAL ================= */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Voucher Details</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Amount (PKR)</Text>
              <TextInput
                style={styles.modalInput}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholder="Enter amount"
              />

              <Text style={styles.inputLabel}>Voucher Number</Text>
              <TextInput
                style={styles.modalInput}
                value={editVoucherNo}
                onChangeText={setEditVoucherNo}
                placeholder="Voucher No"
              />

              {isRent && (
                <>
                  <Text style={styles.inputLabel}>Rent Month (YYYY-MM)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editRentMonth}
                    onChangeText={setEditRentMonth}
                    placeholder="2026-08"
                  />
                </>
              )}

              <Text style={styles.inputLabel}>Detail / Narration</Text>
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                value={editDetail}
                onChangeText={setEditDetail}
                multiline={true}
                placeholder="Description of transaction"
              />

              <Text style={styles.inputLabel}>Audit Notes</Text>
              <TextInput
                style={styles.modalInput}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Reason for change"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowEditModal(false)}
                disabled={savingEdit}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= REJECT MODAL ================= */}
      <Modal
        visible={showRejectModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowRejectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#DC2626' }]}>Reject Pending Entry</Text>
              <TouchableOpacity onPress={() => setShowRejectModal(false)}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.rejectNotice}>
              Rejecting this entry prevents it from creating any financial transaction. Please specify the reason below.
            </Text>

            <Text style={styles.inputLabel}>Rejection Reason</Text>
            <TextInput
              style={[styles.modalInput, { height: 90, textAlignVertical: 'top' }]}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline={true}
              placeholder="e.g. Incorrect bank account selected or duplicate entry..."
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowRejectModal(false)}
                disabled={savingReject}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: '#DC2626' }]}
                onPress={handleSaveReject}
                disabled={savingReject}
              >
                {savingReject ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Confirm Rejection</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  pdfHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pdfHeaderBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  amountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 10,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  dateBadgeText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  monthBadgeText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoCol: {
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  narrationText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 19,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  typePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
    gap: 8,
  },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    gap: 4,
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  deleteBtn: {
    paddingVertical: 11,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 10,
  },
  verifyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  goBackBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2563EB',
    borderRadius: 8,
  },
  goBackBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  rejectNotice: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  voucherDocCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
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
