import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { AccountItem } from '../services/api';

interface AccountPickerModalProps {
  visible: boolean;
  accounts: AccountItem[];
  selectedAccountId?: string | null;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  onSelect: (account: AccountItem) => void;
  onClose: () => void;
}

const formatPKR = (amount: number) => {
  return 'PKR ' + (amount || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
};

export const AccountPickerModal: React.FC<AccountPickerModalProps> = ({
  visible,
  accounts,
  selectedAccountId,
  loading = false,
  title = 'Select Disbursing Account',
  subtitle = 'Choose a Bank or Cash in Hand account',
  onSelect,
  onClose,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'BANK' | 'CASH'>('ALL');
  const [search, setSearch] = useState('');

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (filterType !== 'ALL' && acc.type !== filterType) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        acc.name?.toLowerCase().includes(q) ||
        acc.accountNumber?.toLowerCase().includes(q) ||
        acc.bankName?.toLowerCase().includes(q) ||
        acc.cashHolder?.toLowerCase().includes(q)
      );
    });
  }, [accounts, filterType, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Type Filter Tabs */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tab, filterType === 'ALL' && styles.tabActive]}
              onPress={() => setFilterType('ALL')}
            >
              <Text style={[styles.tabText, filterType === 'ALL' && styles.tabTextActive]}>
                All Accounts ({accounts.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, filterType === 'BANK' && styles.tabActive]}
              onPress={() => setFilterType('BANK')}
            >
              <Text style={[styles.tabText, filterType === 'BANK' && styles.tabTextActive]}>
                Banks ({accounts.filter((a) => a.type === 'BANK').length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, filterType === 'CASH' && styles.tabActive]}
              onPress={() => setFilterType('CASH')}
            >
              <Text style={[styles.tabText, filterType === 'CASH' && styles.tabTextActive]}>
                Cash Custodians ({accounts.filter((a) => a.type === 'CASH').length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchWrapper}>
            <Feather name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search account name or number..."
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Feather name="x-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingText}>Loading account balances from backend...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredAccounts}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Feather name="credit-card" size={36} color="#94A3B8" />
                  <Text style={styles.emptyText}>No accounts match your search.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = selectedAccountId === item._id;
                const isBank = item.type === 'BANK';
                return (
                  <TouchableOpacity
                    style={[styles.itemRow, isSelected && styles.itemRowSelected]}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <View
                      style={[
                        styles.iconBox,
                        isBank ? styles.iconBoxBank : styles.iconBoxCash,
                        isSelected && styles.iconBoxSelected,
                      ]}
                    >
                      {isBank ? (
                        <MaterialCommunityIcons
                          name="bank-outline"
                          size={20}
                          color={isSelected ? '#2563EB' : '#1E40AF'}
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name="cash-multiple"
                          size={20}
                          color={isSelected ? '#2563EB' : '#059669'}
                        />
                      )}
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemSub}>
                        {isBank
                          ? item.accountNumber
                            ? `A/C: ${item.accountNumber}`
                            : 'Bank Account'
                          : 'Cash Custodian'}
                      </Text>
                    </View>
                    <View style={styles.itemBalanceBox}>
                      <Text style={styles.itemBalance}>{formatPKR(item.currentBalance)}</Text>
                      <Text style={styles.balanceLabel}>Current Bal</Text>
                    </View>
                    {isSelected && (
                      <Feather name="check" size={18} color="#2563EB" style={{ marginLeft: 8 }} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  itemRowSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconBoxBank: {
    backgroundColor: '#EFF6FF',
  },
  iconBoxCash: {
    backgroundColor: '#ECFDF5',
  },
  iconBoxSelected: {
    backgroundColor: '#DBEAFE',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemNameSelected: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  itemSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  itemBalanceBox: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  itemBalance: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  balanceLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 13,
    color: '#94A3B8',
  },
});

export default AccountPickerModal;
