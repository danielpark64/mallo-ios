// ─── 마이크 아이콘 (의존성 없이 View로 그린 표준 모양: 캡슐 + U자 홀더 + 받침) ───────
// 이모지(🎙)는 기기·OS마다 모양이 달라 "일반적인 마이크"로 통일한다.
import { View } from 'react-native';
import { useT } from '../lib/i18n';

export function MicIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  const s = size;
  const { t } = useT();
  return (
    <View style={{ width: s, height: s, alignItems: 'center' }} accessibilityLabel={t('마이크')} pointerEvents="none">
      {/* 캡슐 */}
      <View
        style={{
          position: 'absolute', top: s * 0.02,
          width: s * 0.36, height: s * 0.58, borderRadius: s * 0.18, backgroundColor: color,
        }}
      />
      {/* U자 홀더 */}
      <View
        style={{
          position: 'absolute', top: s * 0.3,
          width: s * 0.64, height: s * 0.44,
          borderWidth: s * 0.085, borderColor: color, borderTopColor: 'transparent',
          borderBottomLeftRadius: s * 0.32, borderBottomRightRadius: s * 0.32,
        }}
      />
      {/* 줄기 */}
      <View style={{ position: 'absolute', top: s * 0.72, width: s * 0.085, height: s * 0.16, backgroundColor: color }} />
      {/* 받침 */}
      <View
        style={{
          position: 'absolute', top: s * 0.86,
          width: s * 0.42, height: s * 0.085, borderRadius: s * 0.04, backgroundColor: color,
        }}
      />
    </View>
  );
}
