import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ProgramsProvider } from '@/hooks/use-programs';
import { RobotControllerProvider } from '@/hooks/use-robot-controller';
import { useColorScheme } from '@/hooks/use-color-scheme';

const headerPalette = {
  background: '#0f1b24',
  text: '#e9f1f7',
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <RobotControllerProvider>
      <ProgramsProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: headerPalette.background },
              headerTintColor: headerPalette.text,
              headerTitleStyle: { color: headerPalette.text },
              contentStyle: { backgroundColor: '#050b10' },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </ProgramsProvider>
    </RobotControllerProvider>
  );
}
