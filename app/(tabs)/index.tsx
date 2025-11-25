import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ControlSlider } from "@/components/control-slider";
import { usePrograms } from "@/hooks/use-programs";
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

function ConnectionBadge({
  status,
  reconnectAttempts,
}: {
  status: string;
  reconnectAttempts?: number;
}) {
  const colors: Record<string, string> = {
    connected: palette.accent,
    connecting: palette.accent2,
    reconnecting: palette.accent2,
    disconnected: palette.muted,
    error: palette.danger,
  };
  const color = colors[status] ?? palette.muted;

  const displayText =
    status === "reconnecting" && reconnectAttempts
      ? `RECONNECTING (${reconnectAttempts})`
      : status.toUpperCase();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: `${color}22`, borderColor: color },
      ]}
    >
      <Text style={[styles.badgeText, { color }]}>{displayText}</Text>
    </View>
  );
}

export default function ControlScreen() {
  const { activeProgram, appendWaypointFromAngles } = usePrograms();
  const {
    controlTiles,
    reorderTile,
    jointAngles,
    jointConfigs,
    updateJoint,
    homeAll,
    connectionStatus,
    reconnectAttempts,
    settings,
    updateSettings,
    lastPayload,
    emergencyStop,
    resumeAfterStop,
    isEmergencyStopped,
  } = useRobotController();
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);

  const insets = useSafeAreaInsets();

  const handleSnapshot = async () => {
    if (!activeProgram) {
      setSnapshotMessage(
        "Select a program on the Programs tab to start capturing waypoints."
      );
      return;
    }
    const updated = await appendWaypointFromAngles(jointAngles);
    if (updated) {
      setSnapshotMessage(
        `Saved waypoint #${updated.waypoints.length} to ${updated.name}`
      );
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Robot Arm Console</Text>
            <Text style={styles.subtitle}>
              Drive each joint with sliders or phone gyro.
            </Text>
          </View>
          <ConnectionBadge
            status={connectionStatus}
            reconnectAttempts={reconnectAttempts}
          />
        </View>
        {isEmergencyStopped && (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: `${palette.danger}22`,
                borderColor: palette.danger,
                width: "100%",
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: palette.danger }]}>
              ⚠️ EMERGENCY STOP ACTIVE - Press Resume to continue
            </Text>
          </View>
        )}
        <View style={styles.headerRow}>
          <Text style={styles.label}>WebSocket</Text>
          <Text style={styles.value}>
            {settings.wsAddress || "Set an IP in Settings"}
          </Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.actionButton, { backgroundColor: palette.accent }]}
            onPress={homeAll}
          >
            <Text style={[styles.actionText, { color: "#041015" }]}>
              Home all joints
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.actionButton,
              {
                borderColor: palette.border,
                borderWidth: 1,
                backgroundColor: palette.elevated,
              },
            ]}
            onPress={() => {
              updateSettings({ gyroEnabled: !settings.gyroEnabled });
            }}
          >
            <Text style={styles.actionText}>
              {settings.gyroEnabled ? "Disable gyro" : "Enable gyro"}
            </Text>
          </Pressable>
          {isEmergencyStopped ? (
            <Pressable
              style={[
                styles.actionButton,
                {
                  backgroundColor: palette.accent,
                },
              ]}
              onPress={resumeAfterStop}
            >
              <Text style={[styles.actionText, { color: "#041015" }]}>
                Resume Operation
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.actionButton,
                {
                  backgroundColor: palette.danger,
                },
              ]}
              onPress={emergencyStop}
            >
              <Text style={[styles.actionText, { color: "#fff" }]}>
                Emergency Stop
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { borderColor: activeProgram ? palette.accent : palette.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Program editing</Text>
          {activeProgram ? (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: `${palette.accent}22`,
                  borderColor: palette.accent,
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: palette.accent }]}>
                ACTIVE
              </Text>
            </View>
          ) : (
            <Text style={styles.cardHint}>No program selected</Text>
          )}
        </View>
        {activeProgram ? (
          <>
            <Text style={styles.hint}>
              {activeProgram.name} · {activeProgram.waypoints.length} waypoint
              {activeProgram.waypoints.length === 1 ? "" : "s"}
            </Text>
            <View style={styles.actionsRow}>
              <Pressable
                style={[
                  styles.actionButton,
                  { backgroundColor: palette.accent },
                ]}
                onPress={handleSnapshot}
              >
                <Text style={[styles.actionText, { color: "#041015" }]}>
                  Snapshot pose
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.actionButton,
                  {
                    borderColor: palette.border,
                    borderWidth: 1,
                    backgroundColor: palette.elevated,
                  },
                ]}
                onPress={() => router.push(`/programs/${activeProgram.id}`)}
              >
                <Text style={styles.actionText}>Open program</Text>
              </Pressable>
            </View>
            {snapshotMessage ? (
              <Text style={styles.hint}>{snapshotMessage}</Text>
            ) : null}
          </>
        ) : (
          <Pressable
            style={[
              styles.actionButton,
              {
                borderColor: palette.border,
                borderWidth: 1,
                backgroundColor: palette.elevated,
              },
            ]}
            onPress={() => router.push("/programs")}
          >
            <Text style={styles.actionText}>Go to Programs</Text>
          </Pressable>
        )}
      </View>

      {controlTiles.map((tile, index) => {
        if (tile.type === "gyro") return null;

        const config = jointConfigs[tile.joint];
        const angle = jointAngles[tile.joint];

        return (
          <View key={tile.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{config.label}</Text>
              <View style={styles.reorder}>
                <Pressable
                  onPress={() => reorderTile(tile.id, "up")}
                  style={[
                    styles.reorderButton,
                    index === 0 && styles.reorderDisabled,
                  ]}
                >
                  <Text style={styles.reorderText}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => reorderTile(tile.id, "down")}
                  style={[
                    styles.reorderButton,
                    index === controlTiles.length - 1 && styles.reorderDisabled,
                  ]}
                >
                  <Text style={styles.reorderText}>↓</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.sliderRow}>
              <ControlSlider
                value={angle}
                min={config.min}
                max={config.max}
                accent={palette.accent}
                onChange={(next) => updateJoint(tile.joint, next)}
              />
              <Text style={styles.angleBadge}>{angle.toFixed(1)}°</Text>
            </View>
          </View>
        );
      })}

      <View style={[styles.card, { borderColor: palette.accent }]}>
        <Text style={styles.cardTitle}>Debug payload</Text>
        <Text style={[styles.debug, { color: palette.muted }]}>
          {lastPayload || "Waiting…"}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  headerCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 10,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: palette.muted,
    marginTop: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionText: {
    color: palette.text,
    fontWeight: "600",
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
  },
  cardHint: {
    color: palette.muted,
  },
  reorder: {
    flexDirection: "row",
    gap: 6,
  },
  reorderButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.elevated,
  },
  reorderDisabled: {
    opacity: 0.4,
  },
  reorderText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  mappingRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  label: {
    color: palette.muted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  value: {
    color: palette.text,
    fontWeight: "700",
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  angleBadge: {
    color: palette.text,
    backgroundColor: palette.elevated,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "center",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
    flexShrink: 1,
  },
  badgeText: {
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  debug: {
    backgroundColor: "#0a141c",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    fontFamily: "monospace",
    fontSize: 12,
  },
  hint: {
    color: palette.muted,
  },
});
