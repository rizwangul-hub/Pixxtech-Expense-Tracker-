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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { accountsAPI, CategoryItem } from '../services/api';

interface CategoryPickerModalProps {
  visible: boolean;
  categories: CategoryItem[];
  selectedCategoryId?: string | null;
  loading?: boolean;
  propertyId?: string | null;
  unitId?: string | null;
  expenseClassification?: string;
  onSelect: (category: CategoryItem) => void;
  onClose: () => void;
  onHeadCreated?: (category: CategoryItem) => void;
}

export const CategoryPickerModal: React.FC<CategoryPickerModalProps> = ({
  visible,
  categories,
  selectedCategoryId,
  loading = false,
  propertyId,
  unitId,
  expenseClassification = 'GENERAL_EXPENSE',
  onSelect,
  onClose,
  onHeadCreated,
}) => {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newHeadName, setNewHeadName] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);

  const filteredCategories = useMemo(() => {
    // Only expense categories
    let list = categories.filter((c) => c.type === 'EXPENSE');

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [categories, search]);

  const handleCreateNewHead = async () => {
    const trimmed = newHeadName.trim();
    if (!trimmed) {
      Alert.alert('Validation Error', 'Please enter a name for the expense head (e.g., Office Tea or Repair).');
      return;
    }

    try {
      setCreating(true);
      const res = await accountsAPI.createCategory({
        name: trimmed,
        propertyId: propertyId || null,
        unitId: unitId || null,
        expenseClassification,
      });

      const resolved = res.category || res.data?.category;
      if (resolved && resolved._id) {
        onSelect(resolved);
        onHeadCreated?.(resolved);
        setNewHeadName('');
        setIsAddingNew(false);
        onClose();
      } else {
        Alert.alert('Error', res.message || 'Could not resolve expense head.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to create expense head.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Select Account Head</Text>
              <Text style={styles.subtitle}>Choose an expense classification category</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Search bar & Add Button */}
          <View style={styles.searchWrapper}>
            <Feather name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search category (e.g. Electricity, Fuel)..."
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

          {/* Inline New Category Creator */}
          {isAddingNew ? (
            <View style={styles.newHeadBox}>
              <Text style={styles.newHeadLabel}>Create / Select New Head:</Text>
              <View style={styles.newHeadInputRow}>
                <TextInput
                  style={styles.newHeadInput}
                  placeholder="e.g. Generator Fuel or Maintenance"
                  placeholderTextColor="#94A3B8"
                  value={newHeadName}
                  onChangeText={setNewHeadName}
                  autoCapitalize="words"
                />
                <TouchableOpacity
                  style={[styles.saveHeadButton, creating && styles.saveHeadButtonDisabled]}
                  onPress={handleCreateNewHead}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveHeadButtonText}>Use Head</Text>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setIsAddingNew(false);
                  setNewHeadName('');
                }}
                style={styles.cancelNewHeadButton}
              >
                <Text style={styles.cancelNewHeadText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addNewTrigger}
              onPress={() => setIsAddingNew(true)}
              activeOpacity={0.7}
            >
              <Feather name="plus-circle" size={16} color="#2563EB" />
              <Text style={styles.addNewTriggerText}>Need another category? Type custom head</Text>
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingText}>Loading expense heads from backend...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredCategories}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Feather name="tag" size={36} color="#94A3B8" />
                  <Text style={styles.emptyText}>No matching categories found.</Text>
                  <TouchableOpacity
                    style={styles.emptyAddButton}
                    onPress={() => {
                      setNewHeadName(search);
                      setIsAddingNew(true);
                    }}
                  >
                    <Text style={styles.emptyAddButtonText}>Create head "{search}"</Text>
                  </TouchableOpacity>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = selectedCategoryId === item._id;
                return (
                  <TouchableOpacity
                    style={[styles.itemRow, isSelected && styles.itemRowSelected]}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                      <Feather name="tag" size={16} color={isSelected ? '#2563EB' : '#64748B'} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>
                        {item.name}
                      </Text>
                      {item.expenseClassification && (
                        <Text style={styles.itemClassification}>
                          {item.expenseClassification.replace(/_/g, ' ')}
                        </Text>
                      )}
                    </View>
                    {isSelected && <Feather name="check" size={18} color="#2563EB" />}
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
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 20,
    marginTop: 12,
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
  addNewTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
  },
  addNewTriggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  newHeadBox: {
    backgroundColor: '#EFF6FF',
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 8,
  },
  newHeadLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 6,
  },
  newHeadInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  newHeadInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    color: '#0F172A',
  },
  saveHeadButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
  },
  saveHeadButtonDisabled: {
    opacity: 0.6,
  },
  saveHeadButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelNewHeadButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  cancelNewHeadText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  itemRowSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
  itemClassification: {
    fontSize: 11,
    color: '#64748B',
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
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 13,
    color: '#94A3B8',
  },
  emptyAddButton: {
    marginTop: 10,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default CategoryPickerModal;
