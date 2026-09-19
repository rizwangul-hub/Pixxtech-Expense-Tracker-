import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Image, Text, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function IndexScreen() {
  const { isLoading, isAuthenticated, isDataEntry, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    } else if (isAdmin) {
      router.replace('/(admin)/dashboard');
    } else if (isDataEntry) {
      router.replace('/(data-entry)/dashboard');
    } else {
      router.replace('/(auth)/login');
    }
  }, [isLoading, isAuthenticated, isDataEntry, isAdmin, router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <Image
        source={require('@/assets/images/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color="#2563EB" style={styles.spinner} />
      <Text style={styles.text}>Initializing Pixx Technologies Workspace...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logo: {
    width: 240,
    height: 80,
    marginBottom: 24,
  },
  spinner: {
    marginVertical: 12,
  },
  text: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 8,
  },
});
