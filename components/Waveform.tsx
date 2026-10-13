// 녹음 중 소리 크기를 막대로 보여주는 파형 — 메인 녹음 시트와 편집기 "내용 추가"가 함께 쓴다
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme, type Palette } from '../lib/theme';

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const BAR_COUNT = 30;
export function Waveform({ metering, isRecording, compact }: { metering: number | undefined; isRecording: boolean; compact?: boolean }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const animValues = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15))
  ).current;
  const barsRef = useRef<number[]>(Array(BAR_COUNT).fill(0.15));

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      const meteringLevel =
        metering !== undefined ? Math.max(0, Math.min(1, (metering + 60) / 60)) : 0;
      const level = Math.min(1, meteringLevel + 0.15 + Math.random() * 0.15);
      barsRef.current = [...barsRef.current.slice(1), level];
      barsRef.current.forEach((v, i) => {
        Animated.spring(animValues[i], { toValue: v, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
      });
    }, 80);
    return () => clearInterval(timer);
  }, [isRecording, metering]);

  return (
    <View style={[styles.waveform, compact && styles.waveformCompact]}>
      {animValues.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            compact && styles.barCompact,
            {
              transform: [{ scaleY: anim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }) }],
              opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  waveform: { flexDirection: 'row', alignItems: 'center', height: 56, gap: 3, marginBottom: 16 },
  waveformCompact: { height: 36, marginBottom: 8, justifyContent: 'center' },
  bar: { width: 4, height: 48, borderRadius: 2, backgroundColor: C.red },
  barCompact: { height: 30 },
});
