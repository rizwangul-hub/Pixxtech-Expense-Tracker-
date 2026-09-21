import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { usersAPI } from '@/services/api';
import MobileDrawerModal from '@/components/MobileDrawerModal';

export default function UsersScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await usersAPI.getUsers();
      const rawList = res?.users || res?.data?.users || res?.data || [];
      setUsers(Array.isArray(rawList) ? rawList : []);
    } catch (err: any) {
      console.warn('Failed to load system users:', err.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleStatus = async (id: string, name: string, currentStatus: boolean) => {
    Alert.alert(
      'Change User Status',
      `Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} user "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: currentStatus ? 'Deactivate' : 'Activate',
          style: currentStatus ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await usersAPI.toggleUserStatus(id);
              Alert.alert('Success', 'User status updated successfully.');
              loadUsers();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.message || 'Failed to update user status.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>User Roster</Text>
          <Text style={styles.headerSubtitle}>System Authorization & Account Control</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadUsers}>
          <Feather name="refresh-cw" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading system users...</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={styles.sectionTitle}>Authorized Users ({users.length})</Text>

          {users.map((usr) => (
            <View key={usr._id || usr.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarTxt}>{(usr.name || 'U').charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{usr.name}</Text>
                  <Text style={styles.email}>{usr.email}</Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.statusBtn,
                    usr.isActive !== false ? styles.activeBtn : styles.inactiveBtn,
                  ]}
                  onPress={() => handleToggleStatus(usr._id || usr.id, usr.name, usr.isActive !== false)}
                >
                  <Text
                    style={[
                      styles.statusTxt,
                      usr.isActive !== false ? styles.activeTxt : styles.inactiveTxt,
                    ]}
                  >
                    {usr.isActive !== false ? 'ACTIVE' : 'DISABLED'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.roleBox}>
                <Text style={styles.roleLbl}>Role Permissions:</Text>
                <View style={styles.rolePill}>
                  <Text style={styles.roleTxt}>{usr.role || 'USER'}</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <MobileDrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="users"
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
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3730A3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  name: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  email: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  statusBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  activeBtn: { backgroundColor: '#D1FAE5' },
  inactiveBtn: { backgroundColor: '#FEF2F2' },
  statusTxt: { fontSize: 10, fontWeight: '900' },
  activeTxt: { color: '#065F46' },
  inactiveTxt: { color: '#991B1B' },
  roleBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  roleLbl: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  rolePill: { backgroundColor: '#E0E7FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleTxt: { fontSize: 10, fontWeight: '900', color: '#3730A3' },
});
