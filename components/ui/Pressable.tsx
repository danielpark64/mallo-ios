// ─── PressScale — 눌림 스케일 + 옵션 햅틱을 가진 TouchableOpacity 대체 ────────────
import { useRef, type ReactNode } from 'react';
import { Animated, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  style?: import('react-native').StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: ReactNode;
  /** 'none'이면 햅틱 없음 (녹음 중처럼 진동이 마이크에 실리면 안 되는 자리) */
  haptic?: 'none' | 'selection' | 'light' | 'medium';
};

export function PressScale({ style, scaleTo = 0.97, haptic = 'light', onPressIn, onPressOut, onPress, children, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    // ⚠️ style은 반드시 Pressable 자신에 줘야 한다 — flex:1 같은 레이아웃 스타일이
    // 안쪽 Animated.View에만 있으면 Pressable이 Yoga 레이아웃에 참여하지 못해
    // 부모가 row/flex일 때 자식이 크기 0으로 찌그러진다 (실제로 이 버그가 있었음).
    <Pressable
      style={style}
      onPressIn={(e) => {
        Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic === 'selection') Haptics.selectionAsync();
        else if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.(e);
      }}
      {...rest}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
