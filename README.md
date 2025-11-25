# Robot Arm Control (Expo)

An Expo/React Native mobile app for controlling a 6-axis 3D printed robotic arm over WebSocket. Drive joints with sliders, capture waypoint programs, or use your phone's gyroscope for intuitive control.

## Credits

This project is based on the excellent mechanical design by **Emre Kalem**:

🔗 **Original Design:** [Robotic Arm with Servo Arduino on MakerWorld](https://makerworld.com/en/models/1134925-robotic-arm-with-servo-arduino)

The original design used an Arduino with a serial-based controller. This app is part of a complete rewrite using an ESP32 for wireless WebSocket control from a mobile device.

## Related Repository

🤖 **Firmware:** [robot-arm](https://github.com/peterz0310/robot-arm) — ESP32 firmware that receives commands from this app and drives the servos.

## Features

- **Joint sliders:** Base, Arm A, Arm B, Wrist A, Wrist B, Gripper with re-orderable tiles
- **Safety limits:** Per-joint min/max/home values; commands are clamped before sending
- **One-tap homing:** Return all joints to configured home positions
- **Program recording:** Create named programs, snapshot poses, edit segment timings, play back on the arm
- **Gyro control:** Use phone pitch/roll to control two joints; calibrate to current orientation
- **Auto-reconnect:** Exponential backoff reconnection with status indicator
- **Emergency stop:** Immediately halt all motion
- **Debug view:** Live JSON payload display

## Quick Start

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
- **Programs:** Create named programs, set one as "editing", snapshot poses from Control, edit segment timings, and view the full JSON.
- **Gyro control (opt-in):** Use pitch/roll as two virtual sliders; calibrate to the current pose; tunable sensitivity.
- **Debug:** Always-visible JSON payload of what's being sent.

## Example Payload

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

```bash
npm run lint
```

## Important: Home Position

**Always power on the arm with joints at their home positions.** Hobby servos don't provide position feedback, so the system assumes the arm starts at home. The app will remember your last commanded positions, but these are only valid if the arm hasn't been moved manually.

## License

MIT
