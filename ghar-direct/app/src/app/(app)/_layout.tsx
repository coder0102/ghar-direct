import React from 'react';
import { Stack } from 'expo-router';
import { fonts, useTheme } from '@/lib/theme';

export default function AppLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.ink,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
      <Stack.Screen name="listing/[id]" options={{ title: 'List your place' }} />
    </Stack>
  );
}
