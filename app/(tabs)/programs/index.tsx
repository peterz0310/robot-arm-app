import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { usePrograms } from '@/hooks/use-programs';

const palette = {
  background: '#050b10',
  card: '#0f1b24',
  elevated: '#112331',
  accent: '#0dd3a5',
  accent2: '#ff9f1c',
  border: '#1a2e3b',
  text: '#e9f1f7',
  muted: '#7ea0b8',
};

export default function ProgramsScreen() {
  const { programs, createProgram, activeProgramId, selectProgram, isReady } = usePrograms();
  const insets = useSafeAreaInsets();

  const handleCreate = async () => {
    const created = await createProgram();
    if (created) {
      router.push(`/programs/${created.id}`);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}>
      <View style={styles.hero}>
        <View style={{ gap: 6, flex: 1 }}>
          <Text style={styles.title}>Programs</Text>
          <Text style={styles.subtitle}>
            Build timelines of waypoints, set one as “editing”, and snapshot poses from Control.
          </Text>
        </View>
        <Pressable onPress={handleCreate} style={[styles.createButton, { backgroundColor: palette.accent }]}>
          <Text style={[styles.createText, { color: '#041015' }]}>New program</Text>
        </Pressable>
      </View>

      {!isReady ? (
        <View style={styles.card}>
          <Text style={styles.label}>Loading programs…</Text>
        </View>
      ) : programs.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.value}>No programs yet</Text>
          <Text style={styles.hint}>
            Tap “New program” to start a fresh sequence, then snapshot poses from the Control tab.
          </Text>
        </View>
      ) : (
        programs.map((program) => {
          const isActive = program.id === activeProgramId;
          return (
            <Pressable
              key={program.id}
              onPress={() => router.push(`/programs/${program.id}`)}
              style={[styles.card, { borderColor: isActive ? palette.accent : palette.border }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{program.name}</Text>
                {isActive && (
                  <View style={[styles.badge, { borderColor: palette.accent, backgroundColor: `${palette.accent}22` }]}>
                    <Text style={[styles.badgeText, { color: palette.accent }]}>Editing</Text>
                  </View>
                )}
              </View>
              <Text style={styles.hint}>{program.waypoints.length} waypoint(s)</Text>
              <View style={styles.row}>
                <Pressable
                  onPress={() => selectProgram(isActive ? null : program.id)}
                  style={[
                    styles.secondaryButton,
                    { backgroundColor: palette.elevated, borderColor: palette.border, borderWidth: 1 },
                  ]}>
                  <Text style={styles.buttonText}>{isActive ? 'Clear active' : 'Set active'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/programs/${program.id}`)}
                  style={[styles.secondaryButton, { backgroundColor: palette.accent }]}>
                  <Text style={[styles.buttonText, { color: '#041015' }]}>Open</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  hero: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.muted,
  },
  createButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  createText: {
    fontWeight: '700',
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  buttonText: {
    color: palette.text,
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
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: '800',
    letterSpacing: 0.8,
    color: palette.text,
  },
});
