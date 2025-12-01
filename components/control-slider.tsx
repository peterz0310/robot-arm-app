import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";

type Props = {
  value: number;
  min: number;
  max: number;
  accent?: string;
  onChange: (next: number) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function ControlSlider({
  value,
  min,
  max,
  onChange,
  accent = "#1c9c9c",
}: Props) {
  const trackRef = useRef<View | null>(null);
  const [trackMetrics, setTrackMetrics] = useState({ width: 1, left: 0 });

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width || 1;
    setTrackMetrics((current) => ({ ...current, width }));
    if (trackRef.current) {
      trackRef.current.measureInWindow((x) => {
        setTrackMetrics({ width, left: x });
      });
    }
  };

  const handleGesture = useCallback(
    (event: GestureResponderEvent) => {
      const x = clamp(
        event.nativeEvent.pageX - trackMetrics.left,
        0,
        trackMetrics.width
      );
      const ratio = trackMetrics.width === 0 ? 0 : x / trackMetrics.width;
      const next = min + ratio * (max - min);
      onChange(Number(next.toFixed(1)));
    },
    [max, min, onChange, trackMetrics.left, trackMetrics.width]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: handleGesture,
        onPanResponderMove: handleGesture,
        onPanResponderRelease: handleGesture,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [handleGesture]
  );

  const percent = clamp((value - min) / (max - min || 1), 0, 1);

  return (
    <View style={styles.container}>
      <View
        ref={(node) => (trackRef.current = node)}
        style={styles.trackWrapper}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View
          pointerEvents="none"
          style={[styles.track, { backgroundColor: "#1f2933" }]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.fill,
            { width: `${percent * 100}%`, backgroundColor: accent },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: `${percent * 100}%`,
              backgroundColor: accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    flex: 1,
    width: "100%",
  },
  trackWrapper: {
    height: 56,
    justifyContent: "center",
    width: "100%",
  },
  track: {
    position: "absolute",
    height: 12,
    borderRadius: 999,
    width: "100%",
    opacity: 0.25,
  },
  fill: {
    position: "absolute",
    height: 12,
    borderRadius: 999,
  },
  thumb: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#0b1119",
    transform: [{ translateX: -16 }],
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
});
