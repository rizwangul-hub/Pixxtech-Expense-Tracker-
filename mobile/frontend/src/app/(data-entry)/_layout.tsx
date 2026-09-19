import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

export default function DataEntryLayout() {
  const { isAuthenticated, isLoading, isDataEntry, isAdmin } = useAuth();

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

  // Role protection: If user is Admin and not Data Entry, route them to Admin workspace
  if (isAdmin && !isDataEntry) {
    return <Redirect href="/(admin)/dashboard" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F8FAFC' },
      }}
    >
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="add-rent" options={{ headerShown: false }} />
      <Stack.Screen name="add-expense" options={{ headerShown: false }} />
      <Stack.Screen name="my-entries" options={{ headerShown: false }} />
      <Stack.Screen name="entry-detail" options={{ headerShown: false }} />
    </Stack>
  );
}
