import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { propertiesAPI, PropertyItem } from '@/services/api';

const formatPKR = (val?: number): string => {
  if (val === undefined || val === null || isNaN(val)) return 'Rs. 0.00';
  return 'Rs. ' + Math.abs(val).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export default function PropertiesScreen() {
  const router = useRouter();

  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadProperties = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await propertiesAPI.getProperties();
      setProperties(res.data || []);
    } catch (err) {
      console.error('[PropertiesScreen] Failed to load properties:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const totalMonthlyRoll = properties.reduce(
    (acc, p) => acc + (p.totalMonthlyRentRoll || 0),
    0
  );

  const totalUnits = properties.reduce(
    (acc, p) => acc + (p.units?.length || 0),
    0
  );

  const renderProperty = ({ item }: { item: PropertyItem }) => {
    const isExpanded = expandedId === item._id;
    const unitsList = item.units || [];

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardHeader}
          activeOpacity={0.7}
          onPress={() => toggleExpand(item._id)}
        >
          <View style={styles.propertyIconBox}>
            <MaterialCommunityIcons name="office-building" size={24} color="#2563EB" />
          </View>

          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.plazaName}>{item.plazaName}</Text>
            <View style={styles.locationRow}>
              <Feather name="map-pin" size={12} color="#64748B" />
              <Text style={styles.locationText} numberOfLines={1}>
                {item.location || 'Lahore'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.rentRollText}>{formatPKR(item.totalMonthlyRentRoll)}</Text>
            <Text style={styles.rentRollLabel}>Monthly Roll</Text>
          </View>

          <Feather
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#94A3B8"
            style={{ marginLeft: 8 }}
          />
        </TouchableOpacity>

        {/* Units Count Strip */}
        <View style={styles.unitStrip}>
          <View style={styles.unitBadge}>
            <Feather name="grid" size={12} color="#475569" style={{ marginRight: 4 }} />
            <Text style={styles.unitBadgeText}>{unitsList.length} Units</Text>
          </View>
          <TouchableOpacity
            style={styles.toggleUnitsBtn}
            onPress={() => toggleExpand(item._id)}
          >
            <Text style={styles.toggleUnitsBtnText}>
              {isExpanded ? 'Hide Units' : 'Show Units'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Collapsible Units Sublist */}
        {isExpanded && (
          <View style={styles.unitsSection}>
            <Text style={styles.unitsSectionHeading}>PLAZA UNITS</Text>
            {unitsList.length === 0 ? (
              <Text style={styles.noUnitsText}>No units registered under this plaza.</Text>
            ) : (
              unitsList.map((unit, idx) => (
                <View key={unit._id || idx} style={styles.unitRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unitName}>{unit.unitName}</Text>
                    <Text style={styles.tenantName}>
                      {unit.tenantName ? `Tenant: ${unit.tenantName}` : 'Vacant'}
                    </Text>
                  </View>
                  <Text style={styles.unitRent}>{formatPKR(unit.agreedRent)}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    );
  };

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
          <Text style={styles.headerTitle}>Properties & Plazas</Text>
          <Text style={styles.headerSubtitle}>
            {properties.length} Plazas • {totalUnits} Total Units
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshIconBtn}
          onPress={() => loadProperties(true)}
          disabled={loading || refreshing}
        >
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Monthly Total Roll Card */}
      <View style={styles.overviewCard}>
        <View>
          <Text style={styles.overviewLabel}>TOTAL MONTHLY RENT ROLL</Text>
          <Text style={styles.overviewAmount}>{formatPKR(totalMonthlyRoll)}</Text>
        </View>
        <View style={styles.overviewBadge}>
          <Text style={styles.overviewBadgeText}>{properties.length} PLAZAS</Text>
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading properties & units...</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item._id}
          renderItem={renderProperty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadProperties(true)}
              colors={['#2563EB']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Properties Found</Text>
              <Text style={styles.emptySubtitle}>
                No properties registered in the central system.
              </Text>
            </View>
          }
        />
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
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  overviewAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#16A34A',
    marginTop: 4,
  },
  overviewBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  overviewBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  propertyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  plazaName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#64748B',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  rentRollText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  rentRollLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  unitStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  unitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  toggleUnitsBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  toggleUnitsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  unitsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  unitsSectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  noUnitsText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  unitName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  tenantName: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  unitRent: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16A34A',
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
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
});
