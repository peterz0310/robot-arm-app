import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        tabBarStyle: {
          backgroundColor: '#0f1b24',
          borderTopColor: '#1a2e3b',
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Control',
          tabBarIcon: ({ color, size }) => <Ionicons size={size} name="speedometer-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons size={size} name="settings-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: 'Programs',
          tabBarIcon: ({ color, size }) => <Ionicons size={size} name="list-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
