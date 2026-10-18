// ─── 달력 아이콘 (View로 그린 단순 모양: 테두리 + 윗줄 + 고리 두 개) ─────────────────
// 이모지(📅)는 iOS에서 "JUL 17" 그림으로 나와 날짜처럼 읽힌다(2026-10-18 시뮬레이터) → 직접 그린다.
import { View } from 'react-native';

export function CalendarIcon({ size = 16, color = '#888' }: { size?: number; color?: string }) {
  const s = size;
  const line = Math.max(1, Math.round(s * 0.09));
  return (
    <View style={{ width: s, height: s }} pointerEvents="none">
      {/* 몸통 */}
      <View
        style={{
          position: 'absolute', top: s * 0.14, left: 0, right: 0, bottom: 0,
          borderWidth: line, borderColor: color, borderRadius: s * 0.16,
        }}
      />
      {/* 윗줄(머리) */}
      <View style={{ position: 'absolute', top: s * 0.38, left: 0, right: 0, height: line, backgroundColor: color }} />
      {/* 고리 */}
      <View style={{ position: 'absolute', top: 0, left: s * 0.26, width: line, height: s * 0.26, backgroundColor: color, borderRadius: line }} />
      <View style={{ position: 'absolute', top: 0, right: s * 0.26, width: line, height: s * 0.26, backgroundColor: color, borderRadius: line }} />
    </View>
  );
}
