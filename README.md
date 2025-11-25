# Robot Arm Control (Expo)

An Expo-managed app for driving a 6-axis robotic arm over WebSocket. It lets you send absolute angles per joint, set safe ranges and home positions, view live payloads, and optionally use phone gyros for two virtual axes—all without ejecting.

## Quick start

```bash
npm install
npx expo start
```

- Run in **Expo Go** on device, or in iOS/Android simulators.
- Enter your WebSocket URL in Settings (e.g., `ws://192.168.4.1:81`).

## Features

- **Joint sliders:** Base, Arm A, Arm B, Wrist A, Wrist B, Gripper; re-order tiles; inline angle badge.
- **Safety gates:** Per-joint min/max/home values; outgoing payloads are clamped before sending.
- **Homing:** One-tap home to your configured angles.
- **Programs:** Create named programs, set one as “editing”, snapshot poses from Control, edit segment timings, and view the full JSON.
- **Gyro control (opt-in):** Use pitch/roll as two virtual sliders; calibrate to the current pose; tunable sensitivity.
- **Debug:** Always-visible JSON payload of what’s being sent.

## Example payload & rate

```json
{
  "base": 90,
  "armA": 105.5,
  "armB": 40.0,
  "wristA": 92.5,
  "wristB": 88.0,
  "gripper": 120.0,
  "timestamp": 1736382000123
}
```

- Angles are absolute and clamped to your configured ranges before sending.
- Payloads are throttled to ~50 ms (about 20 Hz) to avoid spamming the ESP32.

## Persistence

- State (settings, joint limits, tile order) is saved to `FileSystem.documentDirectory/robot-controller.json` using `expo-file-system`.
- Programs live in `FileSystem.documentDirectory/programs/*.json` plus a `state.json` marker for the active editing program.
- In Expo Go, it survives reloads and swiping away the app, but will reset if Expo Go’s data is cleared or the Expo Go app is updated/reinstalled.

## Storage flush behavior

- Saves are debounced while you edit.
- Pending changes flush when the app backgrounds, to avoid losing edits if you immediately close Expo Go.

## Project layout

- `app/(tabs)/index.tsx` — Control screen UI.
- `app/(tabs)/settings.tsx` — Connection, ranges, homes, gyro.
- `hooks/use-robot-controller.tsx` — State, clamping, WebSocket, gyro, persistence.
- `components/control-slider.tsx` — Custom gesture-driven slider.

## Testing

- `npm run lint`
