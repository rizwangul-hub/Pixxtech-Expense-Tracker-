import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

export default function AdminLayout() {
  const { isAuthenticated, isLoading, isAdmin, isDataEntry } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // Not logged in -> return to login
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Role Protection Guard: DATA_ENTRY users cannot access Admin screens
  if (isDataEntry && !isAdmin) {
    console.warn('[AdminLayout] Access denied for DATA_ENTRY user. Redirecting to operator portal...');
    return <Redirect href="/(data-entry)/dashboard" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F8FAFC' },
      }}
    >
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="pending-queue" options={{ headerShown: false }} />
      <Stack.Screen name="verification-detail" options={{ headerShown: false }} />
      <Stack.Screen name="properties" options={{ headerShown: false }} />
      <Stack.Screen name="accounts" options={{ headerShown: false }} />
      <Stack.Screen name="transactions" options={{ headerShown: false }} />
      <Stack.Screen name="ledgers" options={{ headerShown: false }} />
      <Stack.Screen name="reports" options={{ headerShown: false }} />
      <Stack.Screen name="add-rent" options={{ headerShown: false }} />
      <Stack.Screen name="add-expense" options={{ headerShown: false }} />
      <Stack.Screen name="staff" options={{ headerShown: false }} />
      <Stack.Screen name="chart-of-accounts" options={{ headerShown: false }} />
      <Stack.Screen name="tenants" options={{ headerShown: false }} />
      <Stack.Screen name="agreements" options={{ headerShown: false }} />
      <Stack.Screen name="rent-due" options={{ headerShown: false }} />
      <Stack.Screen name="rent-received" options={{ headerShown: false }} />
      <Stack.Screen name="other-income" options={{ headerShown: false }} />
      <Stack.Screen name="expenses" options={{ headerShown: false }} />
      <Stack.Screen name="transfers" options={{ headerShown: false }} />
      <Stack.Screen name="monthly-reports" options={{ headerShown: false }} />
      <Stack.Screen name="users" options={{ headerShown: false }} />
    </Stack>
  );
}
