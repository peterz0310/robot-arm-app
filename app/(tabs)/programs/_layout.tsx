import React from 'react';
import { Stack } from 'expo-router';

const headerPalette = {
  background: '#0f1b24',
  text: '#e9f1f7',
};

export default function ProgramsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: headerPalette.background },
        headerTintColor: headerPalette.text,
        headerTitleStyle: { color: headerPalette.text },
        contentStyle: { backgroundColor: '#050b10' },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
