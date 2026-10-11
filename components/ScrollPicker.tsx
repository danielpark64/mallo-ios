// ─── 휠 방식 숫자 선택기 (편집기 시간 피커 · 조회 년/월/일 공용) ───────────────────
// 가운데 줄이 선택값. 위아래로 무한히 도는 것처럼 보이도록 항목을 여러 번 이어 붙인다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '../lib/colors';

export const PICK_H = 42;
const TARGET_MID_OFFSET = 48;

export function ScrollPicker({
  value, items, onChange, label,
}: {
  value: number;
  items: number[];
  onChange: (v: number) => void;
  label: (v: number) => string;
}) {
  const flatRef        = useRef<FlatList>(null);
  const isScrolling    = useRef(false);
  const skipEffect     = useRef(false);
  const [laid, setLaid] = useState(false);

  const loopCount = useMemo(
    () => 2 * Math.ceil(TARGET_MID_OFFSET / items.length) + 1,
    [items]
  );
  const looped   = useMemo(() => Array.from({ length: loopCount }, () => items).flat(), [items, loopCount]);
  const total    = looped.length;
  const midOff   = Math.floor(loopCount / 2) * items.length;

  const targetY = useCallback(
    (v: number) => (midOff + items.indexOf(v)) * PICK_H,
    [items, midOff]
  );

  // initialScrollIndex: item n-1 을 뷰포트 상단에 → item n 이 중앙 하이라이트에 위치
  const initScrollIndex = Math.max(0, midOff + items.indexOf(value) - 1);

  // 초기 스크롤 — onLayout 후 200ms + 500ms 2단계로 확실하게 실행
  useEffect(() => {
    if (!laid) return;
    const t1 = setTimeout(() => {
      flatRef.current?.scrollToOffset({ offset: targetY(value), animated: false });
    }, 200);
    const t2 = setTimeout(() => {
      flatRef.current?.scrollToOffset({ offset: targetY(value), animated: false });
    }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laid]);

  useEffect(() => {
    if (!laid) return;
    if (skipEffect.current) { skipEffect.current = false; return; }
    if (isScrolling.current) return;
    flatRef.current?.scrollToOffset({ offset: targetY(value), animated: true });
  }, [value, laid, targetY]);

  const handleEnd = useCallback((y: number) => {
    isScrolling.current = false;
    const idx    = Math.round(y / PICK_H);
    const clipped = Math.max(0, Math.min(total - 1, idx));
    const newVal  = looped[clipped];
    if (newVal !== value) {
      skipEffect.current = true;
      onChange(newVal);
    }
    // 끝 근처면 가운데로 순간이동
    const localIdx = items.indexOf(newVal);
    const tgt = (midOff + localIdx) * PICK_H;
    if (Math.abs(clipped - (midOff + localIdx)) > items.length * 2) {
      setTimeout(() => {
        flatRef.current?.scrollToOffset({ offset: tgt, animated: false });
      }, 50);
    }
  }, [value, looped, total, items, midOff, onChange]);

  const getItemLayout = useCallback((_: any, i: number) => ({
    length: PICK_H, offset: PICK_H * (i + 1), index: i,
  }), []);

  const renderItem = useCallback(({ item }: { item: number }) => (
    <TouchableOpacity style={pick.item} onPress={() => onChange(item)} activeOpacity={0.6}>
      <Text style={item === value ? pick.sel : pick.dim}>{label(item)}</Text>
    </TouchableOpacity>
  ), [value, onChange, label]);

  return (
    <View style={pick.wrap} onLayout={() => setLaid(true)}>
      <View style={pick.highlight} pointerEvents="none" />
      <FlatList
        ref={flatRef}
        data={looped}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialScrollIndex={initScrollIndex}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICK_H}
        decelerationRate="fast"
        windowSize={3}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: PICK_H }}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onMomentumScrollEnd={(e: any) => {
          if (!isScrolling.current) return;
          handleEnd(e.nativeEvent.contentOffset.y);
        }}
        onScrollEndDrag={(e: any) => {
          if (!isScrolling.current) return;
          const vy = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(vy) < 0.01) handleEnd(e.nativeEvent.contentOffset.y);
        }}
      />
    </View>
  );
}

const pick = StyleSheet.create({
  wrap:      { flex: 1, height: PICK_H * 3, overflow: 'hidden', position: 'relative' },
  highlight: { position: 'absolute', top: PICK_H, left: 4, right: 4, height: PICK_H, backgroundColor: C.surfaceHigh, borderRadius: 10 },
  item:      { height: PICK_H, justifyContent: 'center', alignItems: 'center' },
  sel:       { fontSize: 24, color: C.text, fontWeight: '700' },
  dim:       { fontSize: 15, color: C.textDim, fontWeight: '400' },
});
