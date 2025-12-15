# Robot Arm Control (Expo)

An Expo/React Native mobile app for driving a 6-axis 3D printed robotic arm over WebSocket. Control joints with sliders, record waypoint programs, and optionally steer two joints with your phone's gyroscope.

## Credits and Firmware

- Mechanical design by **Emre Kalem**: [Robotic Arm with Servo Arduino on MakerWorld](https://makerworld.com/en/models/1134925-robotic-arm-with-servo-arduino)
- ESP32 firmware that receives these commands: [robot-arm](https://github.com/peterz0310/robot-arm)

## What it does

- Six joint sliders (Base, Arm A/B, Wrist A/B, Gripper) with tile re-ordering and inline angle badge
- Per-joint min/max/home limits with clamping, plus one-tap homing
- Program recording/playback: name programs, snapshot poses, edit segment timings, play back on the arm
- Optional gyro control: map phone pitch/roll to two joints with calibration and sensitivity
- Auto-reconnect with status indicator, emergency stop button, and live JSON payload view

## Requirements

- Node.js 18+ and npm
- Expo Go on device or iOS/Android simulators
- ESP32 firmware running and reachable over WebSocket (e.g., `ws://192.168.4.1:81`)

## Quick start

```bash
npm install
npx expo start
```

- Open with Expo Go or a simulator and enter your WebSocket URL in Settings.
- Use `npm run ios` or `npm run android` to launch simulators directly.

## Using the app

- **Control:** Drag sliders to send absolute angles; outgoing payloads are clamped to your configured limits and throttled to ~20 Hz.
- **Programs:** Set an "editing" program, snapshot poses from Control, edit segment timings, and play back on the arm.
- **Gyro:** Enable gyro mode from Settings, calibrate to the current pose, and tune sensitivity.
- **Safety:** Hit Emergency Stop to halt motion; use Home to return to your configured angles.

## Data and persistence

- Settings, joint limits, and tile order: `FileSystem.documentDirectory/robot-controller.json`
- Programs: `FileSystem.documentDirectory/programs/*.json` with `state.json` marking the active editing program
- Saves are debounced while editing and flushed when the app backgrounds.
- Expo Go persistence survives reloads but resets if Expo Go data is cleared or the app is reinstalled/updated.

## Project layout

- `app/(tabs)/index.tsx` — Control screen UI
- `app/(tabs)/settings.tsx` — Connection, ranges, homes, gyro
- `hooks/use-robot-controller.tsx` — State, clamping, WebSocket, gyro, persistence
- `components/control-slider.tsx` — Custom gesture-driven slider

## Scripts

- `npm start` / `npm run ios` / `npm run android` / `npm run web` — Launch Expo
- `npm run lint` — Lint with Expo's config
- `npm run reset-project` — Clear Expo caches (helpful for simulator quirks)

## Important: home position

**Always power on the arm at its home angles.** Hobby servos provide no position feedback, so the system assumes the arm starts at home; remembered angles are only valid if the arm has not been moved manually.

## License

MIT
