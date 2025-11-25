import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';

import { JointAngles } from './use-robot-controller';

export type ProgramWaypoint = {
  id: string;
  t: number;
  joints: JointAngles;
};

export type Program = {
  id: string;
  name: string;
  waypoints: ProgramWaypoint[];
  createdAt: number;
  updatedAt: number;
};

type ProgramsContextValue = {
  programs: Program[];
  activeProgramId: string | null;
  activeProgram: Program | null;
  isReady: boolean;
  createProgram: (name?: string) => Promise<Program | null>;
  selectProgram: (programId: string | null) => Promise<void>;
  renameProgram: (programId: string, name: string) => Promise<void>;
  appendWaypointFromAngles: (angles: JointAngles, gapMs?: number, programIdOverride?: string | null) => Promise<Program | null>;
  updateDurations: (programId: string, durations: number[]) => Promise<void>;
  moveWaypoint: (programId: string, waypointId: string, direction: 'up' | 'down') => Promise<void>;
  duplicateWaypoint: (programId: string, waypointId: string) => Promise<void>;
  deleteWaypoint: (programId: string, waypointId: string) => Promise<void>;
  refreshPrograms: () => Promise<void>;
};

const DEFAULT_SEGMENT_MS = 1000;

const PROGRAMS_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}programs/` : null;
const STATE_FILE = PROGRAMS_DIR ? `${PROGRAMS_DIR}state.json` : null;

const ProgramsContext = createContext<ProgramsContextValue | null>(null);

function sortPrograms(programs: Program[]) {
  return [...programs].sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
}

function normalizeWaypoints(waypoints: any[]): ProgramWaypoint[] {
  const sanitized: ProgramWaypoint[] = [];
  waypoints?.forEach((raw: any, index: number) => {
    if (!raw || typeof raw !== 'object') return;
    if (!raw.joints || typeof raw.joints !== 'object') return;
    const id = typeof raw.id === 'string' ? raw.id : `wp-${Date.now().toString(36)}-${index}`;
    const tValue = Number(raw.t);
    const t = Number.isFinite(tValue) ? Math.max(0, tValue) : 0;
    const joints = raw.joints as JointAngles;
    sanitized.push({ id, t, joints });
  });
  sanitized.sort((a, b) => a.t - b.t);
  if (sanitized[0]) {
    sanitized[0] = { ...sanitized[0], t: 0 };
  }
  return sanitized;
}

function normalizeProgram(raw: any): Program | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    return null;
  }

  const createdAt = Number(raw.createdAt) || Date.now();
  const updatedAt = Number(raw.updatedAt) || createdAt;
  const waypoints = normalizeWaypoints(Array.isArray(raw.waypoints) ? raw.waypoints : []);

  return {
    id: raw.id,
    name: raw.name,
    waypoints,
    createdAt,
    updatedAt,
  };
}

function reanchorTimeline(waypoints: ProgramWaypoint[]) {
  if (waypoints.length === 0) return [];
  const sorted = [...waypoints].sort((a, b) => a.t - b.t);
  const offset = sorted[0].t || 0;
  return sorted.map((wp, index) => ({
    ...wp,
    t: index === 0 ? 0 : Math.max(0, wp.t - offset),
  }));
}

function extractDurations(waypoints: ProgramWaypoint[]) {
  const sorted = [...waypoints].sort((a, b) => a.t - b.t);
  const durations: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const diff = sorted[i].t - sorted[i - 1].t;
    durations.push(Number.isFinite(diff) && diff >= 0 ? diff : DEFAULT_SEGMENT_MS);
  }
  return durations;
}

function applyDurationsToOrder(order: ProgramWaypoint[], durations: number[]) {
  if (order.length === 0) return [];
  const sanitizedDurations = durations.map((ms) =>
    Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_SEGMENT_MS
  );
  let running = 0;
  return order.map((wp, index) => {
    const next = { ...wp, t: running };
    if (index < order.length - 1) {
      running += sanitizedDurations[index] ?? DEFAULT_SEGMENT_MS;
    }
    return next;
  });
}

export function ProgramsProvider({ children }: { children: React.ReactNode }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [activeProgramId, setActiveProgramId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const loadingRef = useRef(false);

  const ensureDirectory = useCallback(async () => {
    if (!PROGRAMS_DIR) return false;
    try {
      await FileSystem.makeDirectoryAsync(PROGRAMS_DIR, { intermediates: true });
    } catch {
      // Already exists or unavailable; ignore.
    }
    return true;
  }, []);

  const persistActiveProgram = useCallback(
    async (programId: string | null) => {
      if (!STATE_FILE) return;
      const ready = await ensureDirectory();
      if (!ready) return;
      try {
        await FileSystem.writeAsStringAsync(
          STATE_FILE,
          JSON.stringify(
            {
              activeProgramId: programId,
            },
            null,
            2
          )
        );
      } catch {
        // Ignore persistence failures.
      }
    },
    [ensureDirectory]
  );

  const persistProgram = useCallback(
    async (program: Program) => {
      if (!PROGRAMS_DIR) return;
      const ready = await ensureDirectory();
      if (!ready) return;
      try {
        await FileSystem.writeAsStringAsync(
          `${PROGRAMS_DIR}${program.id}.json`,
          JSON.stringify(program, null, 2)
        );
      } catch {
        // Ignore persistence failures.
      }
    },
    [ensureDirectory]
  );

  const refreshPrograms = useCallback(async () => {
    if (!PROGRAMS_DIR || loadingRef.current) {
      setIsReady(true);
      return;
    }
    loadingRef.current = true;
    const loaded: Program[] = [];
    try {
      await ensureDirectory();
      const files = await FileSystem.readDirectoryAsync(PROGRAMS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        if (STATE_FILE && file === STATE_FILE.replace(PROGRAMS_DIR, '')) continue;
        try {
          const raw = await FileSystem.readAsStringAsync(`${PROGRAMS_DIR}${file}`);
          const parsed = normalizeProgram(JSON.parse(raw));
          if (parsed) {
            loaded.push(parsed);
          }
        } catch {
          // Skip malformed files.
        }
      }
      loaded.sort((a, b) => b.updatedAt - a.updatedAt);
      setPrograms(loaded);

      if (STATE_FILE) {
        try {
          const stateRaw = await FileSystem.readAsStringAsync(STATE_FILE);
          const parsed = JSON.parse(stateRaw);
          if (parsed?.activeProgramId && typeof parsed.activeProgramId === 'string') {
            setActiveProgramId(parsed.activeProgramId);
          }
        } catch {
          // Ignore state read errors.
        }
      }
    } finally {
      loadingRef.current = false;
      setIsReady(true);
    }
  }, [ensureDirectory]);

  useEffect(() => {
    refreshPrograms();
  }, [refreshPrograms]);

  const createProgram = useCallback(
    async (name?: string) => {
      const timestamp = Date.now();
      const id = `program-${timestamp.toString(36)}`;
      let createdProgram: Program | null = null;
      setPrograms((current) => {
        const programName = name?.trim() || `Program ${current.length + 1}`;
        createdProgram = {
          id,
          name: programName,
          waypoints: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        return sortPrograms([...current, createdProgram]);
      });

      if (!createdProgram) return null;
      setActiveProgramId(createdProgram.id);
      await persistActiveProgram(createdProgram.id);
      await persistProgram(createdProgram);
      return createdProgram;
    },
    [persistActiveProgram, persistProgram]
  );

  const selectProgram = useCallback(
    async (programId: string | null) => {
      setActiveProgramId(programId);
      await persistActiveProgram(programId);
    },
    [persistActiveProgram]
  );

  const renameProgram = useCallback(
    async (programId: string, name: string) => {
      let updated: Program | null = null;
      setPrograms((current) => {
        const next = current.map((program) => {
          if (program.id !== programId) return program;
          updated = {
            ...program,
            name: name.trim() || program.name,
            updatedAt: Date.now(),
          };
          return updated;
        });
        return sortPrograms(next);
      });
      if (updated) {
        await persistProgram(updated);
      }
    },
    [persistProgram]
  );

  const appendWaypointFromAngles = useCallback(
    async (angles: JointAngles, gapMs: number = DEFAULT_SEGMENT_MS, programIdOverride?: string | null) => {
      const targetProgramId = programIdOverride ?? activeProgramId;
      if (!targetProgramId) return null;
      let updated: Program | null = null;
      setPrograms((current) => {
        const next = current.map((program) => {
          if (program.id !== targetProgramId) return program;
          const last = program.waypoints[program.waypoints.length - 1];
          const nextT = last ? last.t + Math.max(0, gapMs) : 0;
          const waypoint: ProgramWaypoint = {
            id: `wp-${Date.now().toString(36)}`,
            t: nextT,
            joints: { ...angles },
          };
          updated = {
            ...program,
            waypoints: [...program.waypoints, waypoint],
            updatedAt: Date.now(),
          };
          return updated;
        });
        return sortPrograms(next);
      });
      if (updated) {
        await persistProgram(updated);
      }
      return updated;
    },
    [activeProgramId, persistProgram]
  );

  const deleteWaypoint = useCallback(
    async (programId: string, waypointId: string) => {
      let updated: Program | null = null;
      setPrograms((current) => {
        const next = current.map((program) => {
          if (program.id !== programId) return program;
          const kept = program.waypoints.filter((wp) => wp.id !== waypointId);
          updated = {
            ...program,
            waypoints: reanchorTimeline(kept),
            updatedAt: Date.now(),
          };
          return updated;
        });
        return sortPrograms(next);
      });
      if (updated) {
        await persistProgram(updated);
      }
    },
    [persistProgram]
  );

  const updateDurations = useCallback(
    async (programId: string, durations: number[]) => {
      let updated: Program | null = null;
      setPrograms((current) => {
        const next = current.map((program) => {
          if (program.id !== programId) return program;
          const timeline = program.waypoints.map((wp, index) => {
            if (index === 0) return { ...wp, t: 0 };
            const sum = durations.slice(0, index).reduce((acc, ms) => {
              const numeric = Number(ms);
              const span = Number.isFinite(numeric) && numeric >= 0 ? numeric : DEFAULT_SEGMENT_MS;
              return acc + span;
            }, 0);
            return { ...wp, t: sum };
          });
          updated = {
            ...program,
            waypoints: timeline,
            updatedAt: Date.now(),
          };
          return updated;
        });
        return sortPrograms(next);
      });
      if (updated) {
        await persistProgram(updated);
      }
    },
    [persistProgram]
  );

  const moveWaypoint = useCallback(
    async (programId: string, waypointId: string, direction: 'up' | 'down') => {
      let updated: Program | null = null;
      setPrograms((current) => {
        const next = current.map((program) => {
          if (program.id !== programId) return program;
          const ordered = [...program.waypoints].sort((a, b) => a.t - b.t);
          const index = ordered.findIndex((wp) => wp.id === waypointId);
          if (index === -1) return program;
          const targetIndex = direction === 'up' ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= ordered.length) return program;

          const durations = extractDurations(ordered);
          const [moved] = ordered.splice(index, 1);
          ordered.splice(targetIndex, 0, moved);
          const timeline = applyDurationsToOrder(ordered, durations);

          updated = { ...program, waypoints: timeline, updatedAt: Date.now() };
          return updated;
        });
        return sortPrograms(next);
      });
      if (updated) {
        await persistProgram(updated);
      }
    },
    [persistProgram]
  );

  const duplicateWaypoint = useCallback(
    async (programId: string, waypointId: string) => {
      let updated: Program | null = null;
      setPrograms((current) => {
        const next = current.map((program) => {
          if (program.id !== programId) return program;
          const ordered = [...program.waypoints].sort((a, b) => a.t - b.t);
          const index = ordered.findIndex((wp) => wp.id === waypointId);
          if (index === -1) return program;

          const durations = extractDurations(ordered);
          const source = ordered[index];
          const clone: ProgramWaypoint = {
            ...source,
            id: `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            t: source.t,
          };
          ordered.splice(index + 1, 0, clone);
          durations.splice(index, 0, DEFAULT_SEGMENT_MS);
          const timeline = applyDurationsToOrder(ordered, durations);

          updated = { ...program, waypoints: timeline, updatedAt: Date.now() };
          return updated;
        });
        return sortPrograms(next);
      });
      if (updated) {
        await persistProgram(updated);
      }
    },
    [persistProgram]
  );

  const activeProgram = useMemo(
    () => programs.find((p) => p.id === activeProgramId) ?? null,
    [activeProgramId, programs]
  );

  const value = useMemo<ProgramsContextValue>(
    () => ({
      programs,
      activeProgramId,
      activeProgram,
      isReady,
      createProgram,
      selectProgram,
      renameProgram,
      appendWaypointFromAngles,
      updateDurations,
      moveWaypoint,
      duplicateWaypoint,
      deleteWaypoint,
      refreshPrograms,
    }),
    [
      programs,
      activeProgramId,
      activeProgram,
      isReady,
      createProgram,
      selectProgram,
      renameProgram,
      appendWaypointFromAngles,
      updateDurations,
      moveWaypoint,
      duplicateWaypoint,
      deleteWaypoint,
      refreshPrograms,
    ]
  );

  return <ProgramsContext.Provider value={value}>{children}</ProgramsContext.Provider>;
}

export function usePrograms() {
  const ctx = useContext(ProgramsContext);
  if (!ctx) throw new Error('usePrograms must be used within a ProgramsProvider');
  return ctx;
}

export const DEFAULT_WAYPOINT_GAP_MS = DEFAULT_SEGMENT_MS;
