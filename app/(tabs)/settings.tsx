import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JOINT_OPTIONS, JointId, useRobotController } from '@/hooks/use-robot-controller';

const palette = {
  background: '#050b10',
  card: '#0f1b24',
  elevated: '#112331',
  accent: '#0dd3a5',
  accent2: '#ff9f1c',
  border: '#1a2e3b',
  text: '#e9f1f7',
  muted: '#7ea0b8',
  danger: '#ff5c8a',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const {
    settings,
    updateSettings,
    connectionStatus,
    jointConfigs,
    setJointConfig,
    jointAngles,
    calibrateGyro,
    homeAll,
  } = useRobotController();
  const insets = useSafeAreaInsets();

  const handleNumberChange = (joint: JointId, key: 'min' | 'max' | 'home', text: string) => {
    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      setJointConfig(joint, { [key]: numeric });
    }
  };

  const handleAddressChange = (text: string) => {
    updateSettings({ wsAddress: text.trim() });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}>
      <Section title="Connection">
        <Text style={styles.label}>WebSocket URL</Text>
        <TextInput
          value={settings.wsAddress}
          placeholder="ws://192.168.4.1:81"
          placeholderTextColor={palette.muted}
          onChangeText={handleAddressChange}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{connectionStatus.toUpperCase()}</Text>
        </View>
        <View style={styles.row}>
          <Pressable
            style={[styles.button, { backgroundColor: palette.elevated, borderColor: palette.border, borderWidth: 1 }]}
            onPress={homeAll}>
            <Text style={styles.buttonText}>Send home now</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Joint limits & home">
        <Text style={styles.hint}>
          Clamp ranges per servo. These values gate every outgoing payload so the ESP32 only receives safe angles.
        </Text>
        {JOINT_OPTIONS.map((opt) => {
          const config = jointConfigs[opt.id];
          return (
            <View key={opt.id} style={styles.jointCard}>
              <View style={styles.row}>
                <Text style={styles.value}>{config.label}</Text>
                <Text style={styles.label}>Current {jointAngles[opt.id].toFixed(1)}°</Text>
              </View>
              <View style={styles.triple}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Min</Text>
                  <TextInput
                    value={String(config.min)}
                    keyboardType="numeric"
                    onChangeText={(txt) => handleNumberChange(opt.id, 'min', txt)}
                    style={styles.input}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Max</Text>
                  <TextInput
                    value={String(config.max)}
                    keyboardType="numeric"
                    onChangeText={(txt) => handleNumberChange(opt.id, 'max', txt)}
                    style={styles.input}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Home</Text>
                  <TextInput
                    value={String(config.home)}
                    keyboardType="numeric"
                    onChangeText={(txt) => handleNumberChange(opt.id, 'home', txt)}
                    style={styles.input}
                  />
                </View>
              </View>
              <Pressable
                style={[styles.button, { backgroundColor: palette.elevated, borderColor: palette.border, borderWidth: 1 }]}
                onPress={() => setJointConfig(opt.id, { home: jointAngles[opt.id] })}>
                <Text style={styles.buttonText}>Use current angle as home</Text>
              </Pressable>
            </View>
          );
        })}
      </Section>

      <Section title="Gyro control">
        <Text style={styles.hint}>
          Use phone pitch/roll as two virtual sliders. Calibrate while the arm is in its home pose.
        </Text>
        <View style={styles.row}>
          <Pressable
            style={[
              styles.button,
              { backgroundColor: settings.gyroEnabled ? palette.accent : palette.elevated, borderColor: palette.border, borderWidth: 1 },
            ]}
            onPress={() => updateSettings({ gyroEnabled: !settings.gyroEnabled })}>
            <Text style={[styles.buttonText, { color: settings.gyroEnabled ? '#041015' : palette.text }]}>
              {settings.gyroEnabled ? 'Disable gyro' : 'Enable gyro'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: palette.elevated, borderColor: palette.border, borderWidth: 1 }]}
            onPress={calibrateGyro}>
            <Text style={styles.buttonText}>Calibrate</Text>
          </Pressable>
        </View>
        <View style={styles.triple}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sensitivity</Text>
            <TextInput
              value={String(settings.gyroScale)}
              keyboardType="numeric"
              onChangeText={(txt) => {
                const value = Number(txt);
                if (Number.isFinite(value)) updateSettings({ gyroScale: value });
              }}
              style={styles.input}
            />
          </View>
        </View>
        <Text style={styles.hint}>
          Higher sensitivity moves faster away from home. Pitch→
          {jointConfigs[settings.gyroPitchJoint ?? 'armA']?.label ?? 'Arm A'} · Roll→
          {jointConfigs[settings.gyroRollJoint ?? 'base']?.label ?? 'Base'}
        </Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: palette.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    color: palette.text,
    fontWeight: '700',
  },
  hint: {
    color: palette.muted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  triple: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  inputGroup: {
    flex: 1,
    minWidth: 100,
    gap: 4,
  },
  input: {
    backgroundColor: palette.elevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.border,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  buttonText: {
    color: palette.text,
    fontWeight: '700',
  },
  jointCard: {
    backgroundColor: palette.elevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  mappingRow: {
    gap: 8,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontWeight: '600',
    fontSize: 12,
  },
});
