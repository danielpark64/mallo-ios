// ─── 글자 크기 설정이 일괄 적용되는 Text ───────────────────────────────────────
// 각 화면이 fontSize/lineHeight를 직접 정하더라도 여기서 설정 배율(작게~아주 크게)을 곱한다.
// react-native의 Text 대신 이 컴포넌트를 import 한다. (교대알람 AppText와 같은 방식)
import { StyleSheet, Text as RNText, type TextProps } from 'react-native';
import { MAX_OS_FONT_MULTIPLIER, useFontScale } from '../lib/theme';

export function scaledTextStyle(style: TextProps['style'], scale: number) {
  const flat = StyleSheet.flatten(style) as { fontSize?: number; lineHeight?: number } | undefined;
  const fontSize = (flat?.fontSize ?? 14) * scale;
  const lineHeight = flat?.lineHeight != null ? flat.lineHeight * scale : undefined;
  return lineHeight != null ? { fontSize, lineHeight } : { fontSize };
}

export function Text(props: TextProps) {
  const { scale } = useFontScale();
  const base = { maxFontSizeMultiplier: MAX_OS_FONT_MULTIPLIER, ...props };
  if (scale === 1) return <RNText {...base} />;
  return <RNText {...base} style={[props.style, scaledTextStyle(props.style, scale)]} />;
}
