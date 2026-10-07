import React from 'react';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <>
            <Head>
              <title>Pak Expense Tracker</title>
            </Head>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0F172A' },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(data-entry)" options={{ headerShown: false }} />
              <Stack.Screen name="(admin)" options={{ headerShown: false }} />
            </Stack>
          </>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
