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
import { Feather } from '@expo/vector-icons';
import { PropertyItem } from '../services/api';

interface PropertyPickerModalProps {
  visible: boolean;
  properties: PropertyItem[];
  selectedPropertyId?: string | null;
  loading?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  onSelect: (property: PropertyItem | null) => void;
  onClose: () => void;
}

export const PropertyPickerModal: React.FC<PropertyPickerModalProps> = ({
  visible,
  properties,
  selectedPropertyId,
  loading = false,
  allowClear = false,
  clearLabel = 'No Property (General Expense)',
  onSelect,
  onClose,
}) => {
  const [search, setSearch] = useState('');

  const filteredProperties = useMemo(() => {
    if (!search.trim()) return properties;
    const q = search.trim().toLowerCase();
    return properties.filter(
      (p) =>
        p.plazaName?.toLowerCase().includes(q) ||
        p.location?.toLowerCase().includes(q)
    );
  }, [properties, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Select Property</Text>
              <Text style={styles.subtitle}>Choose an authorized plaza from the system</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchWrapper}>
            <Feather name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by plaza name or location..."
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
              <Text style={styles.loadingText}>Loading properties from backend...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredProperties}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                allowClear ? (
                  <TouchableOpacity
                    style={[
                      styles.itemRow,
                      !selectedPropertyId && styles.itemRowSelected,
                    ]}
                    onPress={() => {
                      onSelect(null);
                      onClose();
                    }}
                  >
                    <View style={[styles.iconBox, { backgroundColor: '#F1F5F9' }]}>
                      <Feather name="globe" size={18} color="#475569" />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{clearLabel}</Text>
                      <Text style={styles.itemLocation}>Common office & general operations</Text>
                    </View>
                    {!selectedPropertyId && (
                      <Feather name="check" size={18} color="#2563EB" />
                    )}
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Feather name="inbox" size={36} color="#94A3B8" />
                  <Text style={styles.emptyText}>No matching properties found.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = selectedPropertyId === item._id;
                return (
                  <TouchableOpacity
                    style={[styles.itemRow, isSelected && styles.itemRowSelected]}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                      <Feather name="home" size={18} color={isSelected ? '#2563EB' : '#475569'} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>
                        {item.plazaName}
                      </Text>
                      {item.location && (
                        <Text style={styles.itemLocation}>{item.location}</Text>
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
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconBoxSelected: {
    backgroundColor: '#DBEAFE',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemNameSelected: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  itemLocation: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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

export default PropertyPickerModal;
