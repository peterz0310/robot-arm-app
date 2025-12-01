import * as FileSystem from "expo-file-system/legacy";
import { DeviceMotion } from "expo-sensors";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

export type JointId =
  | "base"
  | "armA"
  | "armB"
  | "wristA"
  | "wristB"
  | "gripper";

export type JointConfig = {
  label: string;
  min: number;
  max: number;
  home: number;
};

export type JointAngles = Record<JointId, number>;

export type ProgramRunPayload = {
  id: string;
  name: string;
  waypoints: { t: number; joints: JointAngles }[];
};

type ControlTile = {
  id: string;
  label: string;
  type: "slider" | "gyro";
  joint: JointId;
};

type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "reconnecting";

type RobotSettings = {
  wsAddress: string;
  debug: boolean;
  gyroEnabled: boolean;
  gyroScale: number;
  gyroPitchJoint?: JointId;
  gyroRollJoint?: JointId;
  smoothingEnabled: boolean;
  smoothingFactor: number; // 0.03 (very smooth) to 1.0 (instant)
};

type GyroCalibration = {
  pitch: number;
  roll: number;
};

type RobotControllerContextValue = {
  jointConfigs: Record<JointId, JointConfig>;
  jointAngles: JointAngles;
  updateJoint: (joint: JointId, angle: number) => void;
  homeAll: () => void;
  setJointConfig: (joint: JointId, config: Partial<JointConfig>) => void;
  controlTiles: ControlTile[];
  reorderTile: (tileId: string, direction: "up" | "down") => void;
  remapTile: (tileId: string, joint: JointId) => void;
  connectionStatus: ConnectionStatus;
  reconnectAttempts: number;
  settings: RobotSettings;
  updateSettings: (next: Partial<RobotSettings>) => void;
  lastPayload: string;
  gyroCalibration: GyroCalibration;
  calibrateGyro: () => void;
  sendProgramRun: (program: ProgramRunPayload) => boolean;
  goToPose: (pose: JointAngles) => void;
  emergencyStop: () => void;
  resumeAfterStop: () => void;
  isEmergencyStopped: boolean;
  clearSavedSettings: () => Promise<void>;
};

const JOINTS: JointId[] = [
  "base",
  "armA",
  "armB",
  "wristA",
  "wristB",
  "gripper",
];
const STORAGE_FILE = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}robot-controller.json`
  : null;

const defaultConfigs: Record<JointId, JointConfig> = {
  base: { label: "Base", min: 0, max: 180, home: 90 },
  armA: { label: "Arm A", min: 20, max: 180, home: 180 },
  armB: { label: "Arm B", min: 0, max: 180, home: 180 },
  wristA: { label: "Wrist A", min: 0, max: 180, home: 90 },
  wristB: { label: "Wrist B", min: 0, max: 180, home: 90 },
  gripper: { label: "Gripper", min: 100, max: 180, home: 180 },
};

const defaultAngles: JointAngles = {
  base: defaultConfigs.base.home,
  armA: defaultConfigs.armA.home,
  armB: defaultConfigs.armB.home,
  wristA: defaultConfigs.wristA.home,
  wristB: defaultConfigs.wristB.home,
  gripper: defaultConfigs.gripper.home,
};

const defaultTiles: ControlTile[] = [
  { id: "tile-base", label: "Base sweep", type: "slider", joint: "base" },
  { id: "tile-arm-a", label: "Arm A lift", type: "slider", joint: "armA" },
  { id: "tile-arm-b", label: "Arm B reach", type: "slider", joint: "armB" },
  {
    id: "tile-wrist-a",
    label: "Wrist A pitch",
    type: "slider",
    joint: "wristA",
  },
  {
    id: "tile-wrist-b",
    label: "Wrist B roll",
    type: "slider",
    joint: "wristB",
  },
  { id: "tile-gripper", label: "Gripper", type: "slider", joint: "gripper" },
  { id: "tile-gyro", label: "Gyro control", type: "gyro", joint: "base" },
];

const RobotControllerContext =
  createContext<RobotControllerContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function RobotControllerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [jointConfigs, setJointConfigs] =
    useState<Record<JointId, JointConfig>>(defaultConfigs);
  const [jointAngles, setJointAngles] = useState<JointAngles>(defaultAngles);
  const [controlTiles, setControlTiles] = useState<ControlTile[]>(defaultTiles);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [settings, setSettings] = useState<RobotSettings>({
    wsAddress: "",
    debug: false,
    gyroEnabled: false,
    gyroScale: 70,
    gyroPitchJoint: "armA",
    gyroRollJoint: "base",
    smoothingEnabled: true,
    smoothingFactor: 0.15, // Balanced default
  });
  const [lastPayload, setLastPayload] = useState<string>("");
  const [gyroCalibration, setGyroCalibration] = useState<GyroCalibration>({
    pitch: 0,
    roll: 0,
  });
  const [isEmergencyStopped, setIsEmergencyStopped] = useState<boolean>(false);
  const isEmergencyStoppedRef = useRef<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const shouldReconnectRef = useRef<boolean>(true);
  const lastMotion = useRef<{ pitch: number; roll: number }>({
    pitch: 0,
    roll: 0,
  });
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSnapshot = useRef<{
    jointConfigs: typeof jointConfigs;
    controlTiles: typeof controlTiles;
    settings: typeof settings;
  } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const lastSendRef = useRef<number>(0);
  const homeAnimationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Smoothing state: desiredAngles are targets from user input, smoothedAngles are interpolated values sent to ESP32
  const desiredAnglesRef = useRef<JointAngles>({ ...defaultAngles });
  const smoothedAnglesRef = useRef<JointAngles>({ ...defaultAngles });
  const smoothingLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef(settings); // Keep a ref to settings for use in smoothing loop
  settingsRef.current = settings;

  const homeAll = useCallback(() => {
    // Clear any existing animation
    if (homeAnimationRef.current) {
      clearInterval(homeAnimationRef.current);
      homeAnimationRef.current = null;
    }

    // Capture starting positions
    const startAngles: JointAngles = { ...jointAngles };
    const targetAngles: JointAngles = {} as JointAngles;
    JOINTS.forEach((joint) => {
      targetAngles[joint] = jointConfigs[joint].home;
    });

    // Set desired angles immediately so smoothing loop knows the target
    desiredAnglesRef.current = targetAngles;

    const duration = 1000; // 1 second
    const startTime = Date.now();
    const fps = 30;
    const intervalMs = 1000 / fps;

    homeAnimationRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      const next: JointAngles = {} as JointAngles;
      JOINTS.forEach((joint) => {
        const start = startAngles[joint];
        const end = targetAngles[joint];
        next[joint] = Number((start + (end - start) * eased).toFixed(1));
      });

      // Update both state and smoothed ref (bypass smoothing loop during home animation)
      setJointAngles(next);
      smoothedAnglesRef.current = next;

      if (progress >= 1) {
        if (homeAnimationRef.current) {
          clearInterval(homeAnimationRef.current);
          homeAnimationRef.current = null;
        }
      }
    }, intervalMs);
  }, [jointConfigs, jointAngles]);

  // Cleanup home animation on unmount
  useEffect(() => {
    return () => {
      if (homeAnimationRef.current) {
        clearInterval(homeAnimationRef.current);
        homeAnimationRef.current = null;
      }
    };
  }, []);

  const setJointConfig = useCallback(
    (joint: JointId, config: Partial<JointConfig>) => {
      setJointConfigs((current) => {
        const existing = current[joint];
        const rawMin = config.min ?? existing.min;
        const rawMax = config.max ?? existing.max;
        const min = Math.min(rawMin, rawMax);
        const max = Math.max(rawMin, rawMax);
        const home = clamp(config.home ?? existing.home, min, max);

        return {
          ...current,
          [joint]: {
            ...existing,
            ...config,
            min,
            max,
            home,
          },
        };
      });
    },
    []
  );

  const updateJoint = useCallback(
    (joint: JointId, angle: number) => {
      const config = jointConfigs[joint];
      const limited = clamp(angle, config.min, config.max);
      const rounded = Number(limited.toFixed(1));

      // Update desired angles ref for smoothing
      desiredAnglesRef.current = {
        ...desiredAnglesRef.current,
        [joint]: rounded,
      };

      // Update state for UI display
      setJointAngles((current) => {
        return { ...current, [joint]: rounded };
      });
    },
    [jointConfigs]
  );

  const goToPose = useCallback(
    (pose: JointAngles) => {
      const next: JointAngles = {} as JointAngles;
      JOINTS.forEach((joint) => {
        const target = pose[joint];
        const numeric = Number(target);
        const config = jointConfigs[joint];
        const clamped = clamp(
          Number.isFinite(numeric) ? numeric : desiredAnglesRef.current[joint],
          config.min,
          config.max
        );
        next[joint] = Number(clamped.toFixed(1));
      });

      // Update desired angles ref for smoothing
      desiredAnglesRef.current = next;

      // Update state for UI display
      setJointAngles(next);
    },
    [jointConfigs]
  );

  const reorderTile = useCallback(
    (tileId: string, direction: "up" | "down") => {
      setControlTiles((tiles) => {
        const index = tiles.findIndex((t) => t.id === tileId);
        if (index === -1) return tiles;
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= tiles.length) return tiles;
        const swapped = [...tiles];
        const temp = swapped[index];
        swapped[index] = swapped[targetIndex];
        swapped[targetIndex] = temp;
        return swapped;
      });
    },
    []
  );

  const remapTile = useCallback((tileId: string, joint: JointId) => {
    setControlTiles((tiles) =>
      tiles.map((tile) =>
        tile.id === tileId
          ? {
              ...tile,
              joint,
            }
          : tile
      )
    );
  }, []);

  const updateSettings = useCallback((next: Partial<RobotSettings>) => {
    setSettings((prev) => ({ ...prev, ...next }));
  }, []);

  const calibrateGyro = useCallback(() => {
    setGyroCalibration(lastMotion.current);
  }, []);

  const sendPayload = useCallback(
    (angles: JointAngles) => {
      if (isEmergencyStoppedRef.current) {
        return; // Block all motion commands when emergency stopped
      }
      const now = Date.now();
      if (now - lastSendRef.current < 100) {
        return;
      }
      lastSendRef.current = now;
      const payload = JSON.stringify({
        base: angles.base,
        armA: angles.armA,
        armB: angles.armB,
        wristA: angles.wristA,
        wristB: angles.wristB,
        gripper: angles.gripper,
        timestamp: now,
      });
      setLastPayload(payload);

      if (socketRef.current && connectionStatus === "connected") {
        try {
          socketRef.current.send(payload);
        } catch (error) {
          setConnectionStatus("error");
        }
      }
    },
    [connectionStatus]
  );

  const sendProgramRun = useCallback(
    (program: ProgramRunPayload) => {
      if (!socketRef.current || connectionStatus !== "connected") return false;
      try {
        socketRef.current.send(
          JSON.stringify({
            type: "program",
            program,
            requestedAt: Date.now(),
          })
        );
        return true;
      } catch {
        setConnectionStatus("error");
        return false;
      }
    },
    [connectionStatus]
  );

  const emergencyStop = useCallback(() => {
    if (socketRef.current && connectionStatus === "connected") {
      try {
        socketRef.current.send(JSON.stringify({ emergencyStop: true }));
      } catch {
        // If send fails, connection is already broken
      }
    }
    // Disable gyro to prevent further motion commands
    updateSettings({ gyroEnabled: false });
    setIsEmergencyStopped(true);
    isEmergencyStoppedRef.current = true;
    // Sync refs to current position to prevent movement on resume
    desiredAnglesRef.current = { ...jointAngles };
    smoothedAnglesRef.current = { ...jointAngles };
  }, [connectionStatus, updateSettings, jointAngles]);

  const resumeAfterStop = useCallback(() => {
    setIsEmergencyStopped(false);
    isEmergencyStoppedRef.current = false;
    // Sync refs to current UI state
    desiredAnglesRef.current = { ...jointAngles };
    smoothedAnglesRef.current = { ...jointAngles };
    // Send current angles to resume from current position
    if (socketRef.current && connectionStatus === "connected") {
      try {
        const payload = JSON.stringify({
          base: jointAngles.base,
          armA: jointAngles.armA,
          armB: jointAngles.armB,
          wristA: jointAngles.wristA,
          wristB: jointAngles.wristB,
          gripper: jointAngles.gripper,
          timestamp: Date.now(),
        });
        socketRef.current.send(payload);
      } catch {
        setConnectionStatus("error");
      }
    }
  }, [connectionStatus, jointAngles]);

  const clearSavedSettings = useCallback(async () => {
    if (!STORAGE_FILE) return;
    try {
      const info = await FileSystem.getInfoAsync(STORAGE_FILE);
      if (info.exists) {
        await FileSystem.deleteAsync(STORAGE_FILE);
        console.log("[RobotController] Saved settings cleared");
      }
      // Reset to defaults
      setJointConfigs(defaultConfigs);
      setControlTiles(defaultTiles);
      setSettings({
        wsAddress: "",
        debug: false,
        gyroEnabled: false,
        gyroScale: 70,
        gyroPitchJoint: "armA",
        gyroRollJoint: "base",
        smoothingEnabled: true,
        smoothingFactor: 0.15,
      });
      setJointAngles(defaultAngles);
      // Reset smoothing refs
      desiredAnglesRef.current = { ...defaultAngles };
      smoothedAnglesRef.current = { ...defaultAngles };
    } catch (error) {
      console.log("[RobotController] Clear settings error:", error);
    }
  }, []);

  // Smoothing loop: interpolates smoothedAngles toward desiredAngles and sends to ESP32
  useEffect(() => {
    const SMOOTHING_INTERVAL_MS = 33; // ~30 FPS
    const DEADZONE = 0.3; // Only send if angle changed by more than this

    smoothingLoopRef.current = setInterval(() => {
      if (isEmergencyStoppedRef.current) return;

      const { smoothingEnabled, smoothingFactor } = settingsRef.current;
      const desired = desiredAnglesRef.current;
      const smoothed = smoothedAnglesRef.current;

      let hasChanges = false;
      const next: JointAngles = { ...smoothed };

      JOINTS.forEach((joint) => {
        const target = desired[joint];
        const current = smoothed[joint];
        const diff = target - current;

        if (Math.abs(diff) < 0.01) {
          // Close enough, snap to target
          next[joint] = target;
        } else if (smoothingEnabled && smoothingFactor < 1) {
          // Exponential smoothing (EMA)
          next[joint] = Number((current + diff * smoothingFactor).toFixed(1));
          hasChanges = true;
        } else {
          // No smoothing, go directly to target
          next[joint] = target;
          hasChanges = true;
        }
      });

      // Check if any angle changed enough to send
      const shouldSend =
        JOINTS.some(
          (joint) => Math.abs(next[joint] - smoothed[joint]) > DEADZONE
        ) ||
        JOINTS.some(
          (joint) =>
            Math.abs(next[joint] - desired[joint]) > 0.01 && !hasChanges
        );

      smoothedAnglesRef.current = next;

      // Always send if we have meaningful changes
      if (
        JOINTS.some((joint) => Math.abs(next[joint] - smoothed[joint]) > 0.01)
      ) {
        sendPayload(next);
      }
    }, SMOOTHING_INTERVAL_MS);

    return () => {
      if (smoothingLoopRef.current) {
        clearInterval(smoothingLoopRef.current);
        smoothingLoopRef.current = null;
      }
    };
  }, [sendPayload]);

  useEffect(() => {
    if (!STORAGE_FILE) return;
    let cancelled = false;
    (async () => {
      try {
        console.log("[RobotController] Loading from:", STORAGE_FILE);
        const info = await FileSystem.getInfoAsync(STORAGE_FILE);
        console.log("[RobotController] File exists:", info.exists);
        if (!info.exists) return;
        const raw = await FileSystem.readAsStringAsync(STORAGE_FILE);
        const parsed = JSON.parse(raw);
        console.log("[RobotController] Loaded data:", Object.keys(parsed));
        if (parsed.jointConfigs)
          setJointConfigs((prev) => ({ ...prev, ...parsed.jointConfigs }));
        if (parsed.controlTiles) setControlTiles(parsed.controlTiles);
        if (parsed.settings)
          setSettings((prev) => ({ ...prev, ...parsed.settings }));
      } catch (error) {
        console.log("[RobotController] Load error:", error);
      }
      if (!cancelled) {
        // keep current state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistState = useCallback(
    (data: {
      jointConfigs: typeof jointConfigs;
      controlTiles: typeof controlTiles;
      settings: typeof settings;
    }) => {
      if (!STORAGE_FILE) return;
      latestSnapshot.current = data;
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(async () => {
        persistTimer.current = null;
        const snapshot = latestSnapshot.current;
        if (!snapshot) return;
        try {
          console.log("[RobotController] Saving to:", STORAGE_FILE);
          await FileSystem.writeAsStringAsync(
            STORAGE_FILE,
            JSON.stringify(
              {
                jointConfigs: snapshot.jointConfigs,
                controlTiles: snapshot.controlTiles,
                settings: snapshot.settings,
              },
              null,
              2
            )
          );
          console.log("[RobotController] Save successful");
        } catch (error) {
          console.log("[RobotController] Save error:", error);
        }
      }, 150);
    },
    []
  );

  useEffect(() => {
    setJointAngles((current) => {
      let changed = false;
      const next: JointAngles = { ...current };
      JOINTS.forEach((joint) => {
        const cfg = jointConfigs[joint];
        const bounded = clamp(current[joint], cfg.min, cfg.max);
        if (bounded !== current[joint]) {
          changed = true;
          next[joint] = bounded;
        }
      });
      return changed ? next : current;
    });
  }, [jointConfigs]);

  // Calculate reconnect delay with exponential backoff (1s, 2s, 4s, 8s, max 10s)
  const getReconnectDelay = useCallback((attempt: number) => {
    const baseDelay = 1000;
    const maxDelay = 10000;
    return Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!settings.wsAddress) {
      return null;
    }

    // Basic WebSocket URL validation
    if (
      !settings.wsAddress.startsWith("ws://") &&
      !settings.wsAddress.startsWith("wss://")
    ) {
      setConnectionStatus("error");
      return null;
    }

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(settings.wsAddress);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        setReconnectAttempts(0); // Reset on successful connection
      };

      ws.onerror = () => {
        // Error will be followed by close, so we handle reconnect there
      };

      ws.onclose = () => {
        if (socketRef.current === ws) {
          socketRef.current = null;
        }

        // Only reconnect if we should (address still set, not manually disconnected)
        if (shouldReconnectRef.current && settings.wsAddress) {
          setConnectionStatus("reconnecting");
          setReconnectAttempts((prev) => {
            const nextAttempt = prev + 1;
            const delay = getReconnectDelay(prev);
            console.log(
              `[WebSocket] Reconnecting in ${delay}ms (attempt ${nextAttempt})`
            );

            // Clear any existing reconnect timeout
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }

            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              if (shouldReconnectRef.current && settings.wsAddress) {
                connectWebSocket();
              }
            }, delay);

            return nextAttempt;
          });
        } else {
          setConnectionStatus("disconnected");
        }
      };
    } catch (error) {
      setConnectionStatus("error");
      return null;
    }

    return ws;
  }, [settings.wsAddress, getReconnectDelay]);

  useEffect(() => {
    // Clear any pending reconnect when address changes
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!settings.wsAddress) {
      shouldReconnectRef.current = false;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnectionStatus("disconnected");
      setReconnectAttempts(0);
      return;
    }

    // Enable reconnection and reset attempts for new address
    shouldReconnectRef.current = true;
    setReconnectAttempts(0);
    setConnectionStatus("connecting");

    const ws = connectWebSocket();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (ws) {
        ws.close();
      }
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    };
  }, [settings.wsAddress, connectWebSocket]);

  useEffect(() => {
    if (!settings.gyroEnabled) {
      DeviceMotion.removeAllListeners();
      return;
    }

    DeviceMotion.setUpdateInterval(120);
    const subscription = DeviceMotion.addListener((motion) => {
      const pitch = motion.rotation?.beta ?? 0; // forward/back
      const roll = motion.rotation?.gamma ?? 0; // side/side
      lastMotion.current = { pitch, roll };

      const degreesPitch = (pitch - gyroCalibration.pitch) * (180 / Math.PI);
      const degreesRoll = (roll - gyroCalibration.roll) * (180 / Math.PI);

      const applyGyro = (
        raw: number,
        joint: JointId | undefined,
        fallback: JointId | undefined
      ) => {
        const target = joint ?? fallback;
        if (!target) return;
        const cfg = jointConfigs[target];
        const span = Math.min(cfg.max - cfg.home, cfg.home - cfg.min);
        const normalized = clamp(raw / 90, -1, 1);
        const nextAngle = clamp(
          cfg.home + normalized * span * (settings.gyroScale / 90),
          cfg.min,
          cfg.max
        );
        updateJoint(target, nextAngle);
      };

      applyGyro(degreesPitch, settings.gyroPitchJoint, "armA");
      applyGyro(degreesRoll, settings.gyroRollJoint, "base");
    });

    return () => {
      subscription.remove();
    };
  }, [
    gyroCalibration,
    jointConfigs,
    settings.gyroEnabled,
    settings.gyroPitchJoint,
    settings.gyroRollJoint,
    settings.gyroScale,
    updateJoint,
  ]);

  const value = useMemo<RobotControllerContextValue>(
    () => ({
      jointConfigs,
      jointAngles,
      updateJoint,
      homeAll,
      setJointConfig,
      controlTiles,
      reorderTile,
      remapTile,
      connectionStatus,
      reconnectAttempts,
      settings,
      updateSettings,
      lastPayload,
      gyroCalibration,
      calibrateGyro,
      sendProgramRun,
      goToPose,
      emergencyStop,
      resumeAfterStop,
      isEmergencyStopped,
      clearSavedSettings,
    }),
    [
      jointConfigs,
      jointAngles,
      updateJoint,
      homeAll,
      setJointConfig,
      controlTiles,
      reorderTile,
      remapTile,
      connectionStatus,
      reconnectAttempts,
      settings,
      updateSettings,
      lastPayload,
      gyroCalibration,
      calibrateGyro,
      sendProgramRun,
      goToPose,
      emergencyStop,
      resumeAfterStop,
      isEmergencyStopped,
      clearSavedSettings,
    ]
  );

  useEffect(() => {
    persistState({ jointConfigs, controlTiles, settings });
  }, [controlTiles, jointConfigs, persistState, settings]);

  useEffect(() => {
    if (!STORAGE_FILE) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && persistTimer.current) {
        // Flush pending writes when backgrounding.
        const snapshot = latestSnapshot.current;
        if (!snapshot) return;
        FileSystem.writeAsStringAsync(
          STORAGE_FILE,
          JSON.stringify(
            {
              jointConfigs: snapshot.jointConfigs,
              controlTiles: snapshot.controlTiles,
              settings: snapshot.settings,
            },
            null,
            2
          )
        ).catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <RobotControllerContext.Provider value={value}>
      {children}
    </RobotControllerContext.Provider>
  );
}

export function useRobotController() {
  const ctx = useContext(RobotControllerContext);
  if (!ctx)
    throw new Error(
      "useRobotController must be used inside RobotControllerProvider"
    );
  return ctx;
}

export const JOINT_OPTIONS: { id: JointId; label: string }[] = JOINTS.map(
  (id) => ({
    id,
    label: defaultConfigs[id].label,
  })
);
