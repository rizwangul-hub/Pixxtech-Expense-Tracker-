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
  transactionsAPI,
  rentAPI,
  PropertyItem,
  AccountItem,
  CategoryItem,
  PlazaUnitItem,
} from '@/services/api';
import PropertyPickerModal from '@/components/PropertyPickerModal';
import AccountPickerModal from '@/components/AccountPickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';

const QUICK_NARRATION_TAGS = [
  'Paid for fuel expenses',
  'Office electricity & utility bill',
  'Staff tea, lunch & refreshments',
  'Monthly maintenance & plumbing repair',
  'Printing & office stationery',
  'Operational cash disbursed',
];

export default function AdminAddExpenseScreen() {
  const router = useRouter();

  // Data sources
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [units, setUnits] = useState<PlazaUnitItem[]>([]);

  // Form selections
  const [selectedProperty, setSelectedProperty] = useState<PropertyItem | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<PlazaUnitItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null);

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [voucherNo, setVoucherNo] = useState('');
  const [amount, setAmount] = useState('');
  const [detail, setDetail] = useState('');

  // Modals
  const [propertyModalVisible, setPropertyModalVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  // Loaders
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derived 3-tier classification
  const derivedClassification = selectedUnit
    ? 'UNIT_EXPENSE'
    : selectedProperty
    ? 'PROPERTY_OWN_EXPENSE'
    : 'GENERAL_EXPENSE';

  const expenseScope = selectedProperty ? 'PROPERTY' : 'GENERAL';
  const propertyExpenseType = selectedUnit ? 'UNIT' : selectedProperty ? 'OWN' : 'OWN';

  // Load master data and suggested voucher number on mount
  useEffect(() => {
    let isMounted = true;
    const loadMaster = async () => {
      try {
        setLoadingInitial(true);
        const [propRes, accRes, catRes, vnRes] = await Promise.all([
          accountsAPI.getProperties(),
          accountsAPI.getActiveSummary(),
          accountsAPI.getCategories(),
          transactionsAPI.suggestVoucherNo(),
        ]);
        if (isMounted) {
          setProperties(propRes.properties || []);
          setAccounts(accRes.accounts || []);
          setCategories(catRes.categories || []);
          if (vnRes?.suggestedVoucherNo) {
            setVoucherNo(vnRes.suggestedVoucherNo);
          }
          if (accRes.accounts && accRes.accounts.length > 0) {
            const defaultCash = accRes.accounts.find((a) => a.type === 'CASH') || accRes.accounts[0];
            setSelectedAccount(defaultCash);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage('Failed to load master metadata.');
        }
      } finally {
        if (isMounted) {
          setLoadingInitial(false);
        }
      }
    };

    loadMaster();
    return () => {
      isMounted = false;
    };
  }, []);

  // When property changes, load its units
  useEffect(() => {
    if (!selectedProperty) {
      setUnits([]);
      setSelectedUnit(null);
      return;
    }

    let isMounted = true;
    const loadUnits = async () => {
      try {
        setLoadingUnits(true);
        const res = await rentAPI.getPlazaUnits(selectedProperty._id);
        if (isMounted) {
          setUnits(res.units || []);
        }
      } catch (err: any) {
        console.warn('Could not load units for property:', err.message);
      } finally {
        if (isMounted) {
          setLoadingUnits(false);
        }
      }
    };

    loadUnits();
    return () => {
      isMounted = false;
    };
  }, [selectedProperty]);

  // Handle Form Submission
  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!voucherNo.trim()) {
      setErrorMessage('Voucher Number is required.');
      return;
    }
    if (!detail.trim()) {
      setErrorMessage('Transaction detail / narration is required.');
      return;
    }
    if (!selectedCategory) {
      setErrorMessage('Please select an Account Head / Category.');
      return;
    }
    if (!selectedAccount) {
      setErrorMessage('Please select a Disbursing / Paid From Account.');
      return;
    }

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter an amount strictly greater than 0.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await transactionsAPI.recordVoucher({
        date,
        voucherNo: voucherNo.trim(),
        detail: detail.trim(),
        categoryId: selectedCategory._id,
        crAccountId: selectedAccount._id,
        amount: numAmount,
        propertyId: selectedProperty?._id || null,
        unitId: selectedUnit?._id || null,
        expenseClassification: derivedClassification,
        expenseScope,
        propertyExpenseType,
      });

      if (res.success) {
        Alert.alert(
          'Voucher Recorded Successfully',
          res.message ||
            `Voucher #${voucherNo} recorded.`,
          [
            {
              text: 'View Pending Queue',
              onPress: () => router.replace('/(admin)/pending-queue'),
            },
            {
              text: 'Record Another',
              onPress: async () => {
                setAmount('');
                setDetail('');
                try {
                  const nextVnRes = await transactionsAPI.suggestVoucherNo();
                  if (nextVnRes.suggestedVoucherNo) setVoucherNo(nextVnRes.suggestedVoucherNo);
                } catch (e) {}
              },
            },
          ]
        );
      } else {
        setErrorMessage(res.message || 'Failed to submit voucher transaction.');
      }
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message || 'Server error occurred while submitting voucher.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Add Expense Voucher</Text>
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
          {/* Classification Banner */}
          <View style={styles.classificationBanner}>
            <View style={styles.classificationHeader}>
              <Feather name="layers" size={16} color="#4338CA" style={{ marginRight: 6 }} />
              <Text style={styles.classificationLabel}>EXPENSE CLASSIFICATION:</Text>
            </View>
            <View style={styles.classificationBadge}>
              <Text style={styles.classificationBadgeText}>
                {derivedClassification === 'GENERAL_EXPENSE'
                  ? '🌐 General Office Expense (No Plaza)'
                  : derivedClassification === 'PROPERTY_OWN_EXPENSE'
                  ? `🏢 Property Own Expense (${selectedProperty?.plazaName})`
                  : `🚪 Unit Expense (${selectedUnit?.unitName})`}
              </Text>
            </View>
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
              <View style={styles.labelRow}>
                <Text style={styles.label}>1. PROPERTY PLAZA</Text>
                <Text style={styles.subLabel}>(Optional for General Expense)</Text>
              </View>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setPropertyModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <Feather
                    name="home"
                    size={18}
                    color={selectedProperty ? '#2563EB' : '#64748B'}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.pickerValue, !selectedProperty && styles.placeholder]}>
                    {selectedProperty ? selectedProperty.plazaName : 'No Property (General Expense)'}
                  </Text>
                </View>
                {selectedProperty ? (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedProperty(null);
                      setSelectedUnit(null);
                    }}
                    style={{ padding: 4 }}
                  >
                    <Feather name="x" size={16} color="#DC2626" />
                  </TouchableOpacity>
                ) : (
                  <Feather name="chevron-down" size={18} color="#64748B" />
                )}
              </TouchableOpacity>
            </View>

            {/* Field: Unit Selection */}
            {selectedProperty && (
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>2. SPECIFIC LEASABLE UNIT</Text>
                  <Text style={styles.subLabel}>(Optional)</Text>
                </View>
                {loadingUnits ? (
                  <View style={styles.loadingInline}>
                    <ActivityIndicator size="small" color="#2563EB" />
                    <Text style={styles.loadingInlineText}>Loading units...</Text>
                  </View>
                ) : units.length === 0 ? (
                  <Text style={styles.hintText}>No sub-units registered for this plaza.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitsScroll}>
                    <TouchableOpacity
                      style={[styles.unitChip, !selectedUnit && styles.unitChipSelected]}
                      onPress={() => setSelectedUnit(null)}
                    >
                      <Text style={[styles.unitChipTitle, !selectedUnit && styles.unitChipTitleSelected]}>
                        All Plaza
                      </Text>
                      <Text style={[styles.unitChipSub, !selectedUnit && styles.unitChipSubSelected]}>
                        Plaza-own expense
                      </Text>
                    </TouchableOpacity>
                    {units.map((unit) => {
                      const isSelected = selectedUnit?._id === unit._id;
                      return (
                        <TouchableOpacity
                          key={unit._id}
                          style={[styles.unitChip, isSelected && styles.unitChipSelected]}
                          onPress={() => setSelectedUnit(unit)}
                        >
                          <Text style={[styles.unitChipTitle, isSelected && styles.unitChipTitleSelected]}>
                            {unit.unitName}
                          </Text>
                          <Text style={[styles.unitChipSub, isSelected && styles.unitChipSubSelected]}>
                            {unit.tenantName || 'Unit expense'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Field: Date & Voucher No */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>VOUCHER NO (V.N) *</Text>
                <View style={styles.inputWrapper}>
                  <Feather name="hash" size={16} color="#64748B" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.input, { fontWeight: '700' }]}
                    value={voucherNo}
                    onChangeText={setVoucherNo}
                    placeholder="e.g. 3010"
                  />
                </View>
              </View>

              <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>EXPENSE DATE *</Text>
                <View style={styles.inputWrapper}>
                  <Feather name="calendar" size={16} color="#64748B" style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.input}
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>
            </View>

            {/* Field: Category / Account Head */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>3. ACCOUNT HEAD / CATEGORY *</Text>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setCategoryModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <Feather name="tag" size={18} color="#2563EB" style={{ marginRight: 10 }} />
                  <Text style={[styles.pickerValue, !selectedCategory && styles.placeholder]}>
                    {selectedCategory ? selectedCategory.name : 'Select or create account head...'}
                  </Text>
                </View>
                <Feather name="chevron-down" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Field: Disbursing / Paid From Account */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>4. PAID FROM (CREDIT ACCOUNT) *</Text>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setAccountModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLeft}>
                  <MaterialCommunityIcons
                    name={selectedAccount?.type === 'BANK' ? 'bank-outline' : 'cash-multiple'}
                    size={18}
                    color="#DC2626"
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.pickerValue, !selectedAccount && styles.placeholder]}>
                    {selectedAccount ? selectedAccount.name : 'Select bank or cash account...'}
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

            {/* Field: Amount */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>5. EXPENSE AMOUNT (PKR) *</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.currencyPrefix}>PKR</Text>
                <TextInput
                  style={[styles.input, { fontWeight: '700', fontSize: 16 }]}
                  placeholder="e.g. 4500"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={(val) => {
                    setAmount(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />
              </View>
            </View>

            {/* Field: Narration / Detail */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>6. TRANSACTION DETAIL / NARRATION *</Text>
              <TextInput
                style={[styles.inputWrapper, styles.textArea]}
                placeholder="Describe expense details, payee name, reason..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={detail}
                onChangeText={(val) => {
                  setDetail(val);
                  if (errorMessage) setErrorMessage(null);
                }}
              />
              {/* Quick Tags */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickTagsScroll}>
                {QUICK_NARRATION_TAGS.map((tag, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.quickTagChip}
                    onPress={() => setDetail(tag)}
                  >
                    <Text style={styles.quickTagText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
                  <Text style={styles.submitButtonText}>Submitting Expense...</Text>
                </View>
              ) : (
                <View style={styles.buttonLoadingRow}>
                  <Feather name="send" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.submitButtonText}>Submit Expense Voucher</Text>
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
        allowClear
        clearLabel="No Property (General Expense)"
        loading={loadingInitial}
        onSelect={(p) => {
          setSelectedProperty(p);
          setSelectedUnit(null);
        }}
        onClose={() => setPropertyModalVisible(false)}
      />

      {/* Account Picker Modal */}
      <AccountPickerModal
        visible={accountModalVisible}
        accounts={accounts}
        selectedAccountId={selectedAccount?._id}
        title="Select Disbursing Account"
        subtitle="Account where funds are paid from"
        onSelect={(a) => {
          setSelectedAccount(a);
        }}
        onClose={() => setAccountModalVisible(false)}
      />

      {/* Category / Account Head Picker Modal */}
      <CategoryPickerModal
        visible={categoryModalVisible}
        categories={categories}
        selectedCategoryId={selectedCategory?._id}
        expenseClassification={derivedClassification}
        propertyId={selectedProperty?._id}
        unitId={selectedUnit?._id}
        loading={loadingInitial}
        onSelect={(c) => {
          setSelectedCategory(c);
        }}
        onHeadCreated={(newCat: CategoryItem) => {
          setCategories((prev) => [newCat, ...prev]);
          setSelectedCategory(newCat);
        }}
        onClose={() => setCategoryModalVisible(false)}
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
  classificationBanner: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  classificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  classificationLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4338CA',
    letterSpacing: 0.8,
  },
  classificationBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  classificationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3730A3',
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.8,
  },
  subLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 6,
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
  hintText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    fontStyle: 'italic',
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
    minWidth: 100,
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
  quickTagsScroll: {
    flexDirection: 'row',
    marginTop: 8,
  },
  quickTagChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  quickTagText: {
    fontSize: 12,
    color: '#475569',
  },
  submitButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#DC2626',
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
