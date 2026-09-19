import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  accountsAPI,
  rentAPI,
  PropertyItem,
  AccountItem,
  PlazaUnitItem,
} from '@/services/api';
import PropertyPickerModal from '@/components/PropertyPickerModal';
import AccountPickerModal from '@/components/AccountPickerModal';

export default function AdminAddRentScreen() {
  const router = useRouter();

  // Data sources
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [units, setUnits] = useState<PlazaUnitItem[]>([]);

  // Form State
  const [selectedProperty, setSelectedProperty] = useState<PropertyItem | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<PlazaUnitItem | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null);

  const [rentMonth, setRentMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');

  // Modals & Loaders
  const [propertyModalVisible, setPropertyModalVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load master properties and accounts on mount
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setLoadingInitial(true);
        const [propRes, accRes] = await Promise.all([
          accountsAPI.getProperties(),
          accountsAPI.getActiveSummary(),
        ]);
        if (isMounted) {
          setProperties(propRes.properties || []);
          setAccounts(accRes.accounts || []);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage('Failed to load properties or accounts from backend.');
        }
      } finally {
        if (isMounted) {
          setLoadingInitial(false);
        }
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // When property or rentMonth changes, fetch units for this property
  useEffect(() => {
    if (!selectedProperty) {
      setUnits([]);
      setSelectedUnit(null);
      return;
    }

    let isMounted = true;
    const fetchUnits = async () => {
      try {
        setLoadingUnits(true);
        const res = await rentAPI.getPlazaUnits(selectedProperty._id, rentMonth);
        if (isMounted) {
          const fetchedUnits = res.units || [];
          setUnits(fetchedUnits);
          if (fetchedUnits.length > 0) {
            const first = fetchedUnits[0];
            setSelectedUnit(first);
            setAmountPaid(String(first.balanceDue || first.agreedRent || ''));
            if (first.defaultReceivingAccount?._id) {
              const matchedAcc = accounts.find((a) => a._id === first.defaultReceivingAccount?._id);
              if (matchedAcc) setSelectedAccount(matchedAcc);
            }
          } else {
            setSelectedUnit(null);
            setAmountPaid('');
          }
        }
      } catch (err: any) {
        console.warn('Failed to load units for property:', err.message);
      } finally {
        if (isMounted) {
          setLoadingUnits(false);
        }
      }
    };

    fetchUnits();
    return () => {
      isMounted = false;
    };
  }, [selectedProperty, rentMonth, accounts]);

  const handleUnitSelect = (unit: PlazaUnitItem) => {
    setSelectedUnit(unit);
    setAmountPaid(String(unit.balanceDue || unit.agreedRent || ''));
    if (unit.defaultReceivingAccount?._id) {
      const matchedAcc = accounts.find((a) => a._id === unit.defaultReceivingAccount?._id);
      if (matchedAcc) setSelectedAccount(matchedAcc);
    }
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!selectedProperty) {
      setErrorMessage('Please select a property plaza.');
      return;
    }
    if (!selectedUnit) {
      setErrorMessage('Please select a unit.');
      return;
    }
    if (!selectedAccount) {
      setErrorMessage('Please select a receiving bank or cash account.');
      return;
    }

    const numAmount = Number(amountPaid);
    if (!amountPaid || isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid received rent amount greater than zero.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await rentAPI.collectRent({
        propertyId: selectedProperty._id,
        unitId: selectedUnit._id,
        rentMonth,
        receivingAccountId: selectedAccount._id,
        amountPaid: numAmount,
        paymentDate,
        notes: notes.trim(),
      });

      if (res.success) {
        Alert.alert(
          'Rent Recorded Successfully',
          res.message ||
            `Rent receipt of PKR ${numAmount.toLocaleString()} recorded.`,
          [
            {
              text: 'View Pending Queue',
              onPress: () => router.replace('/(admin)/pending-queue'),
            },
            {
              text: 'Record Another',
              onPress: () => {
                setAmountPaid('');
                setNotes('');
              },
            },
          ]
        );
      } else {
        setErrorMessage(res.message || 'Failed to record rent payment.');
      }
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message || 'Server error occurred while recording rent.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Add Rent Collection</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Banner */}
          <View style={styles.infoBanner}>
            <Feather name="info" size={16} color="#1D4ED8" style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.infoBannerText}>
              Rent collected will be recorded in the system and queued for verification.
            </Text>
          </View>

          {errorMessage && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 8, marginTop: 2 }} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          {/* Form Card */}
          <View style={styles.card}>
            {/* Field: Property */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>1. PROPERTY PLAZA *</Text>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setPropertyModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <Feather name="home" size={18} color="#2563EB" style={{ marginRight: 10 }} />
                  <Text style={[styles.pickerValue, !selectedProperty && styles.placeholder]}>
                    {selectedProperty ? selectedProperty.plazaName : 'Select property...'}
                  </Text>
                </View>
                <Feather name="chevron-down" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Field: Unit Selection */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>2. LEASABLE UNIT *</Text>
              {loadingUnits ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.loadingInlineText}>Loading plaza units...</Text>
                </View>
              ) : !selectedProperty ? (
                <View style={[styles.pickerTrigger, styles.pickerTriggerDisabled]}>
                  <Text style={styles.placeholder}>Select a property first</Text>
                </View>
              ) : units.length === 0 ? (
                <View style={[styles.pickerTrigger, styles.pickerTriggerDisabled]}>
                  <Text style={styles.placeholder}>No units registered for this property</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitsScroll}>
                  {units.map((unit) => {
                    const isSelected = selectedUnit?._id === unit._id;
                    return (
                      <TouchableOpacity
                        key={unit._id}
                        style={[styles.unitChip, isSelected && styles.unitChipSelected]}
                        onPress={() => handleUnitSelect(unit)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.unitChipTitle, isSelected && styles.unitChipTitleSelected]}>
                          {unit.unitName}
                        </Text>
                        <Text style={[styles.unitChipSub, isSelected && styles.unitChipSubSelected]}>
                          {unit.tenantName || 'No tenant'}
                        </Text>
                        <Text style={[styles.unitChipRent, isSelected && styles.unitChipRentSelected]}>
                          Rs. {unit.agreedRent?.toLocaleString()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Unit Financial Overview Card */}
            {selectedUnit && (
              <View style={styles.unitBreakdownCard}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Tenant Name:</Text>
                  <Text style={styles.breakdownVal}>{selectedUnit.tenantName || 'Vacant'}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Agreed Monthly Rent:</Text>
                  <Text style={styles.breakdownVal}>PKR {selectedUnit.agreedRent?.toLocaleString()}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Balance Due for Month:</Text>
                  <Text style={[styles.breakdownVal, { color: '#DC2626', fontWeight: '700' }]}>
                    PKR {selectedUnit.balanceDue?.toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            {/* Field: Rent Month & Payment Date in 2 columns */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>RENT MONTH (YYYY-MM)</Text>
                <View style={styles.inputWrapper}>
                  <Feather name="calendar" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    value={rentMonth}
                    onChangeText={setRentMonth}
                    placeholder="YYYY-MM"
                    maxLength={7}
                  />
                </View>
              </View>

              <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>PAYMENT DATE</Text>
                <View style={styles.inputWrapper}>
                  <Feather name="calendar" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    value={paymentDate}
                    onChangeText={setPaymentDate}
                    placeholder="YYYY-MM-DD"
                    maxLength={10}
                  />
                </View>
              </View>
            </View>

            {/* Field: Receiving Account */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>3. RECEIVING ACCOUNT (BANK / CASH) *</Text>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setAccountModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <MaterialCommunityIcons
                    name={selectedAccount?.type === 'BANK' ? 'bank-outline' : 'cash-multiple'}
                    size={18}
                    color="#16A34A"
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.pickerValue, !selectedAccount && styles.placeholder]}>
                    {selectedAccount ? selectedAccount.name : 'Select receiving account...'}
                  </Text>
                </View>
                <Feather name="chevron-down" size={18} color="#64748B" />
              </TouchableOpacity>
              {selectedAccount && (
                <Text style={styles.accountBalanceHint}>
                  Live Balance: PKR {selectedAccount.currentBalance?.toLocaleString('en-PK')}
                </Text>
              )}
            </View>

            {/* Field: Amount Paid */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>4. AMOUNT RECEIVED (PKR) *</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.currencyPrefix}>PKR</Text>
                <TextInput
                  style={[styles.input, { fontWeight: '700', fontSize: 16 }]}
                  placeholder="e.g. 85000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={amountPaid}
                  onChangeText={(val) => {
                    setAmountPaid(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />
              </View>
            </View>

            {/* Field: Remarks / Notes */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>NOTES / REMARKS (OPTIONAL)</Text>
              <TextInput
                style={[styles.inputWrapper, styles.textArea]}
                placeholder="e.g. Cheque clearance / Online transfer ref..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>Submitting Rent Record...</Text>
                </View>
              ) : (
                <View style={styles.buttonLoadingRow}>
                  <Feather name="check" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.submitButtonText}>Submit Rent Collection</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Property Picker Modal */}
      <PropertyPickerModal
        visible={propertyModalVisible}
        properties={properties}
        selectedPropertyId={selectedProperty?._id}
        loading={loadingInitial}
        onSelect={(p) => {
          setSelectedProperty(p);
        }}
        onClose={() => setPropertyModalVisible(false)}
      />

      {/* Account Picker Modal */}
      <AccountPickerModal
        visible={accountModalVisible}
        accounts={accounts}
        selectedAccountId={selectedAccount?._id}
        title="Select Receiving Account"
        subtitle="Account where tenant rent was deposited"
        onSelect={(a) => {
          setSelectedAccount(a);
        }}
        onClose={() => setAccountModalVisible(false)}
      />
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
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 17,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#B91C1C',
    flex: 1,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerTriggerDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  pickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pickerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  placeholder: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  loadingInlineText: {
    fontSize: 13,
    color: '#64748B',
  },
  unitsScroll: {
    flexDirection: 'row',
  },
  unitChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    marginRight: 10,
    minWidth: 110,
  },
  unitChipSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  unitChipTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  unitChipTitleSelected: {
    color: '#1D4ED8',
  },
  unitChipSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  unitChipSubSelected: {
    color: '#2563EB',
  },
  unitChipRent: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 4,
  },
  unitChipRentSelected: {
    color: '#15803D',
  },
  unitBreakdownCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  breakdownVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  rowTwoCols: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  currencyPrefix: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 8,
  },
  accountBalanceHint: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 4,
    marginLeft: 4,
  },
  textArea: {
    height: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
