import React from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fonts, useTheme } from '@/lib/theme';
import { useInbox } from '@/lib/inbox';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color} />;
}

export default function TabLayout() {
  const { c } = useTheme();
  const { unread } = useInbox();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.onTile,
        tabBarInactiveTintColor: c.muted,
        tabBarActiveBackgroundColor: c.lime,
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
        tabBarItemStyle: { borderRadius: 14, marginHorizontal: 6, marginVertical: 5 },
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.edge, borderTopWidth: 2.5 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Explore', tabBarIcon: icon('compass') }} />
      <Tabs.Screen
        name="dms"
        options={{ title: 'DMs', tabBarIcon: icon('chatbubbles'), tabBarBadge: unread > 0 ? unread : undefined }}
      />
      <Tabs.Screen name="list" options={{ title: 'List', tabBarIcon: icon('add-circle') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
