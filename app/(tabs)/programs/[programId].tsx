import { Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DEFAULT_WAYPOINT_GAP_MS, usePrograms } from "@/hooks/use-programs";
import { useRobotController } from "@/hooks/use-robot-controller";

const palette = {
  background: "#050b10",
  card: "#0f1b24",
  elevated: "#112331",
  accent: "#0dd3a5",
  accent2: "#ff9f1c",
  border: "#1a2e3b",
  text: "#e9f1f7",
  muted: "#7ea0b8",
  danger: "#ff5c8a",
};

export default function ProgramDetailScreen() {
  const params = useLocalSearchParams<{ programId?: string }>();
  const programId = useMemo(
    () =>
      Array.isArray(params.programId) ? params.programId[0] : params.programId,
    [params.programId]
  );
  const {
    programs,
    activeProgramId,
    selectProgram,
    renameProgram,
    deleteWaypoint,
    updateDurations,
    moveWaypoint,
    duplicateWaypoint,
    isReady,
  } = usePrograms();
  const { connectionStatus, sendProgramRun, goToPose } = useRobotController();
  const insets = useSafeAreaInsets();

  const program = useMemo(
    () => programs.find((p) => p.id === programId),
    [programId, programs]
  );
  const [name, setName] = useState(program?.name ?? "");
  const [durationInputs, setDurationInputs] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const programJson = useMemo(
    () => (program ? JSON.stringify(program, null, 2) : ""),
    [program]
  );

  useEffect(() => {
    if (program) {
      setName(program.name);
      const gaps = program.waypoints.slice(1).map((wp, idx) => {
        const prev = program.waypoints[idx];
        const diff = wp.t - prev.t;
        return String(diff >= 0 ? diff : 0);
      });
      setDurationInputs(gaps);
    }
  }, [program]);

  const handleCopyJson = useCallback(async () => {
    if (Platform.OS === "web" && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(programJson);
        setCopyStatus("Copied to clipboard");
        return;
      } catch {
        // fall through to manual instruction
      }
    }
    setCopyStatus("Select the JSON below and use the system copy action.");
  }, [programJson]);

  if (!programId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.value}>Missing program id.</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.value}>Loading program…</Text>
      </View>
    );
  }

  if (!program) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.value}>Program not found.</Text>
      </View>
    );
  }

  const isActive = activeProgramId === program.id;

  const handleSaveName = () => renameProgram(program.id, name);

  const handleSaveDurations = async () => {
    const numeric = durationInputs.map((raw) => {
      const asNumber = Number(raw);
      if (!Number.isFinite(asNumber) || asNumber < 0)
        return DEFAULT_WAYPOINT_GAP_MS;
      return asNumber;
    });
    await updateDurations(program.id, numeric);
    Alert.alert("Durations saved", "Segment times updated for this program.");
  };

  const handlePlay = () => {
    if (program.waypoints.length === 0) {
      Alert.alert(
        "Add waypoints first",
        "Snapshot poses from the Control tab to build this program."
      );
      return;
    }
    const ok = sendProgramRun({
      id: program.id,
      name: program.name,
      waypoints: program.waypoints,
    });
    if (!ok) {
      Alert.alert(
        "Not connected",
        "Connect to the WebSocket before sending a program."
      );
    } else {
      const duration = program.waypoints[program.waypoints.length - 1].t;
      Alert.alert(
        "Program sent",
        `Executing "${program.name}" with ${
          program.waypoints.length
        } waypoints over ${(duration / 1000).toFixed(
          1
        )}s. Use any slider or Emergency Stop to interrupt.`
      );
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: program.name,
          headerBackTitle: "Programs",
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.background }}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Program</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Pick a clear label"
            placeholderTextColor={palette.muted}
            style={styles.input}
          />
          <View style={styles.row}>
            <Pressable
              style={[styles.button, { backgroundColor: palette.accent }]}
              onPress={handleSaveName}
            >
              <Text style={[styles.buttonText, { color: "#041015" }]}>
                Save name
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                {
                  backgroundColor: isActive
                    ? palette.elevated
                    : palette.accent2,
                  borderColor: palette.border,
                  borderWidth: 1,
                },
              ]}
              onPress={() => selectProgram(isActive ? null : program.id)}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: isActive ? palette.text : "#041015" },
                ]}
              >
                {isActive ? "Clear editing" : "Set as editing"}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>Waypoints: {program.waypoints.length}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Playback</Text>
          <View style={styles.row}>
            <Pressable
              style={[
                styles.button,
                {
                  backgroundColor:
                    connectionStatus === "connected"
                      ? palette.accent
                      : palette.elevated,
                  borderColor: palette.border,
                  borderWidth: 1,
                  opacity: connectionStatus === "connected" ? 1 : 0.65,
                },
              ]}
              onPress={handlePlay}
            >
              <Text
                style={[
                  styles.buttonText,
                  {
                    color:
                      connectionStatus === "connected"
                        ? "#041015"
                        : palette.text,
                  },
                ]}
              >
                Play over WebSocket
              </Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Sends a `{`type: "program"`}` payload with all waypoints. The ESP32
            handler comes next on your side.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Waypoints</Text>
          {program.waypoints.length === 0 ? (
            <Text style={styles.hint}>
              No waypoints yet. Choose “Set as editing” then snapshot poses from
              the Control tab to populate this program.
            </Text>
          ) : (
            program.waypoints.map((waypoint, index) => (
              <View key={waypoint.id} style={styles.waypointGroup}>
                <View style={styles.waypointHeader}>
                  <Text style={styles.value}>
                    Waypoint {index + 1} • {waypoint.t} ms
                  </Text>
                  <View style={styles.waypointActions}>
                    <Pressable
                      onPress={() => goToPose(waypoint.joints)}
                      style={[styles.chipButton, styles.chipGo]}
                    >
                      <Text style={[styles.chipText, styles.chipGoText]}>
                        Go to pose
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        moveWaypoint(program.id, waypoint.id, "up")
                      }
                      disabled={index === 0}
                      style={[
                        styles.chipButton,
                        styles.chipButtonNeutral,
                        index === 0 && styles.chipDisabled,
                      ]}
                    >
                      <Text style={styles.chipText}>Move up</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        moveWaypoint(program.id, waypoint.id, "down")
                      }
                      disabled={index === program.waypoints.length - 1}
                      style={[
                        styles.chipButton,
                        styles.chipButtonNeutral,
                        index === program.waypoints.length - 1 &&
                          styles.chipDisabled,
                      ]}
                    >
                      <Text style={styles.chipText}>Move down</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => duplicateWaypoint(program.id, waypoint.id)}
                      style={[styles.chipButton, styles.chipButtonNeutral]}
                    >
                      <Text style={styles.chipText}>Duplicate</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteWaypoint(program.id, waypoint.id)}
                      style={[
                        styles.chipButton,
                        { borderColor: palette.danger },
                      ]}
                    >
                      <Text
                        style={[styles.chipText, { color: palette.danger }]}
                      >
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.jointGrid}>
                  {Object.entries(waypoint.joints).map(([joint, angle]) => (
                    <View key={joint} style={styles.jointPill}>
                      <Text style={styles.jointLabel}>{joint}</Text>
                      <Text style={styles.jointValue}>
                        {Number(angle).toFixed(1)}°
                      </Text>
                    </View>
                  ))}
                </View>

                {index < program.waypoints.length - 1 && (
                  <View style={styles.durationRow}>
                    <Text style={styles.label}>Time to next (ms)</Text>
                    <TextInput
                      value={
                        durationInputs[index] ?? String(DEFAULT_WAYPOINT_GAP_MS)
                      }
                      onChangeText={(txt) =>
                        setDurationInputs((current) => {
                          const next = [...current];
                          next[index] = txt.replace(/[^0-9.]/g, "");
                          return next;
                        })
                      }
                      keyboardType="numeric"
                      style={styles.input}
                    />
                  </View>
                )}
              </View>
            ))
          )}
          {program.waypoints.length > 1 && (
            <Pressable
              style={[styles.button, { backgroundColor: palette.accent }]}
              onPress={handleSaveDurations}
            >
              <Text style={[styles.buttonText, { color: "#041015" }]}>
                Save durations
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Program JSON</Text>
          <View style={styles.row}>
            <Pressable
              style={[
                styles.button,
                {
                  backgroundColor: palette.elevated,
                  borderColor: palette.border,
                  borderWidth: 1,
                },
              ]}
              onPress={handleCopyJson}
            >
              <Text style={styles.buttonText}>Copy JSON</Text>
            </Pressable>
            {copyStatus ? <Text style={styles.hint}>{copyStatus}</Text> : null}
          </View>
          <Text selectable selectionColor={palette.accent} style={styles.code}>
            {programJson}
          </Text>
          <Text style={styles.hint}>
            Long-press to select and copy if the button cannot access your
            clipboard.
          </Text>
        </View>
      </ScrollView>
    </>
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
    gap: 10,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
  },
  label: {
    color: palette.muted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  value: {
    color: palette.text,
    fontWeight: "700",
  },
  hint: {
    color: palette.muted,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  buttonText: {
    color: palette.text,
    fontWeight: "700",
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
  waypointGroup: {
    backgroundColor: palette.elevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  waypointHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  jointGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  jointPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#0a141c",
    borderWidth: 1,
    borderColor: palette.border,
  },
  jointLabel: {
    color: palette.muted,
    fontWeight: "600",
  },
  jointValue: {
    color: palette.text,
    fontWeight: "700",
  },
  durationRow: {
    gap: 6,
  },
  chipButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipButtonNeutral: {
    borderColor: palette.border,
    backgroundColor: palette.elevated,
  },
  chipGo: {
    borderColor: palette.accent,
    backgroundColor: `${palette.accent}22`,
  },
  chipGoText: {
    color: palette.accent,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  waypointActions: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  chipText: {
    fontWeight: "700",
    color: palette.text,
  },
  code: {
    backgroundColor: "#0a141c",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    fontFamily: "monospace",
    color: palette.muted,
    fontSize: 12,
  },
});
