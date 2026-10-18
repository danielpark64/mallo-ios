// ─── 목록 보기 아이콘 (View로 그림): 한 줄 보기 = 얇은 줄 세 개, 크게 보기 = 큰 칸 두 개 ─────
// 헤더의 [설정] 옆 버튼에 쓴다. 누르면 바뀔 모양을 보여 준다(2026-10-18: 목록 위 글자 버튼이 복사·PDF와 섞여 헷갈림).
import { View } from 'react-native';

export function ListDensityIcon({ compact, size = 18, color = '#888' }: { compact: boolean; size?: number; color?: string }) {
  const s = size;
  const w = Math.max(1.5, s * 0.1);
  if (compact) {
    return (
      <View style={{ width: s, height: s, justifyContent: 'space-evenly' }} pointerEvents="none">
        {[0, 1, 2].map((i) => <View key={i} style={{ height: w, borderRadius: w, backgroundColor: color }} />)}
      </View>
    );
  }
  return (
    <View style={{ width: s, height: s, justifyContent: 'space-between' }} pointerEvents="none">
      {[0, 1].map((i) => <View key={i} style={{ height: s * 0.42, borderRadius: s * 0.1, borderWidth: w, borderColor: color }} />)}
    </View>
  );
}
