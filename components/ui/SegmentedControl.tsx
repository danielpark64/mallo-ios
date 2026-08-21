// ─── SegmentedControl — 슬라이딩 인디케이터가 있는 탭 세그먼트 ───────────────────
// 달력/전체일정 탭에 사용. reanimated로 인디케이터를 부드럽게 움직인다.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme, type Theme } from '../../lib/theme';
import { PressScale } from './Pressable';
import { AppText } from './Text';

export function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  const s = makeStyles(t);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const [width, setWidth] = useState(0);
  const segW = options.length > 0 ? width / options.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(index * segW, { duration: t.duration.base }) }],
  }));

  return (
    <View
      style={s.wrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - t.space.xs)}
    >
      {segW > 0 && (
        <Animated.View
          style={[s.indicator, indicatorStyle, { width: segW }]}
        />
      )}
      {options.map((o) => (
        <PressScale
          key={o.value}
          haptic="selection"
          style={s.tab}
          onPress={() => {
            if (o.value !== value) onChange(o.value);
          }}
        >
          <AppText variant="label" color={o.value === value ? 'text' : 'textSub'}>
            {o.label}
          </AppText>
        </PressScale>
      ))}
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  wrap: {
    flexDirection: 'row', backgroundColor: t.c.surfaceAlt,
    borderRadius: t.radius.md, padding: t.space.xs, position: 'relative',
  },
  indicator: {
    position: 'absolute', top: t.space.xs, bottom: t.space.xs, left: t.space.xs,
    backgroundColor: t.c.surface, borderRadius: t.radius.sm,
    ...t.elevation('e1'),
  },
  tab: { flex: 1, paddingVertical: t.space.sm + 1, alignItems: 'center', borderRadius: t.radius.sm },
});
