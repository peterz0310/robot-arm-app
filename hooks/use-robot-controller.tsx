import * as FileSystem from "expo-file-system";
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

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type RobotSettings = {
  wsAddress: string;
  debug: boolean;
  gyroEnabled: boolean;
  gyroScale: number;
  gyroPitchJoint?: JointId;
  gyroRollJoint?: JointId;
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
  armA: { label: "Arm A1/A2", min: 10, max: 170, home: 90 },
  armB: { label: "Arm B", min: 0, max: 180, home: 90 },
  wristA: { label: "Wrist A", min: 0, max: 180, home: 90 },
  wristB: { label: "Wrist B", min: 0, max: 180, home: 90 },
  gripper: { label: "Gripper", min: 20, max: 160, home: 90 },
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
  });
  const [lastPayload, setLastPayload] = useState<string>("");
  const [gyroCalibration, setGyroCalibration] = useState<GyroCalibration>({
    pitch: 0,
    roll: 0,
  });
  const [isEmergencyStopped, setIsEmergencyStopped] = useState<boolean>(false);
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

  const homeAll = useCallback(() => {
    setJointAngles((prev) => {
      const next: JointAngles = { ...prev };
      JOINTS.forEach((joint) => {
        next[joint] = jointConfigs[joint].home;
      });
      return next;
    });
  }, [jointConfigs]);

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
      setJointAngles((current) => {
        const config = jointConfigs[joint];
        const limited = clamp(angle, config.min, config.max);
        return { ...current, [joint]: Number(limited.toFixed(1)) };
      });
    },
    [jointConfigs]
  );

  const goToPose = useCallback(
    (pose: JointAngles) => {
      setJointAngles((current) => {
        const next: JointAngles = { ...current };
        JOINTS.forEach((joint) => {
          const target = pose[joint];
          const numeric = Number(target);
          const config = jointConfigs[joint];
          const clamped = clamp(
            Number.isFinite(numeric) ? numeric : current[joint],
            config.min,
            config.max
          );
          next[joint] = Number(clamped.toFixed(1));
        });
        return next;
      });
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
      if (isEmergencyStopped) {
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
  }, [connectionStatus, updateSettings]);

  const resumeAfterStop = useCallback(() => {
    setIsEmergencyStopped(false);
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

  useEffect(() => {
    sendPayload(jointAngles);
  }, [jointAngles, sendPayload]);

  useEffect(() => {
    if (!STORAGE_FILE) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (!info.exists) return;
        const raw = await FileSystem.readAsStringAsync(STORAGE_FILE);
        const parsed = JSON.parse(raw);
        if (parsed.jointConfigs)
          setJointConfigs((prev) => ({ ...prev, ...parsed.jointConfigs }));
        if (parsed.controlTiles) setControlTiles(parsed.controlTiles);
        if (parsed.settings)
          setSettings((prev) => ({ ...prev, ...parsed.settings }));
      } catch {
        // ignore hydration errors
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
        } catch {
          // swallow persist errors (e.g., if storage unavailable)
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

  useEffect(() => {
    if (!settings.wsAddress) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnectionStatus("disconnected");
      return;
    }

    // Basic WebSocket URL validation
    if (
      !settings.wsAddress.startsWith("ws://") &&
      !settings.wsAddress.startsWith("wss://")
    ) {
      setConnectionStatus("error");
      return;
    }

    setConnectionStatus("connecting");
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(settings.wsAddress);
      socketRef.current = ws;

      ws.onopen = () => setConnectionStatus("connected");
      ws.onerror = () => setConnectionStatus("error");
      ws.onclose = () => {
        setConnectionStatus("disconnected");
        if (socketRef.current === ws) {
          socketRef.current = null;
        }
      };
    } catch (error) {
      setConnectionStatus("error");
      return;
    }

    return () => {
      if (ws) {
        ws.close();
      }
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    };
  }, [settings.wsAddress]);

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
