// 홍보 배너(광고 칸) — 일정 목록 맨 아래. 교대알람의 PromoBanner를 옮겨 온 것.
// 슬라이드(lib/promo.ts)가 2개 이상이면 5초마다 넘어가고, 손으로 밀어도 된다(양 끝 복제본으로 끊김 없이 순환).
// 가볍게: 타이머는 앱이 앞에 있을 때만 돈다(Android는 백그라운드에서도 JS 타이머가 돌아 배터리를 쓴다).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, Linking, ScrollView, StyleSheet, TouchableOpacity, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Text } from './AppText';
import { SupportSheet } from './SupportSheet';
import { useT } from '../lib/i18n';
import { promoSlides, type PromoSlide } from '../lib/promo';
import { alarmAppInstalled } from '../lib/siblingShare';
import { useTheme, type Palette } from '../lib/theme';

const ROTATE_MS = 5000;

const TONES: Record<PromoSlide['tone'], { icon: string; box: string; border: string }> = {
  purple: { icon: 'rgba(162,155,254,0.18)', box: 'rgba(162,155,254,0.08)', border: 'rgba(162,155,254,0.28)' },
  amber: { icon: 'rgba(250,199,117,0.20)', box: 'rgba(250,199,117,0.09)', border: 'rgba(250,199,117,0.34)' },
  blue: { icon: 'rgba(61,139,255,0.18)', box: 'rgba(61,139,255,0.07)', border: 'rgba(61,139,255,0.28)' },
};

export function PromoBanner() {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t, lang } = useT();
  const [active, setActive] = useState(AppState.currentState === 'active');
  // 교대알람이 깔려 있으면 그 광고는 뺀다 — 앱으로 돌아올 때(active)마다 한 번 다시 확인(타이머·폴링 없음)
  const slides = useMemo(() => promoSlides(lang, undefined, { hasAlarmApp: alarmAppInstalled() }), [lang, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = slides.length;
  const extended = count > 1 ? [slides[count - 1], ...slides, slides[0]] : slides;
  const [width, setWidth] = useState(0);
  const [dotIdx, setDotIdx] = useState(0);
  const [showSupport, setShowSupport] = useState(false);
  const posRef = useRef(1); // extended 배열 기준 위치, 실제 슬라이드는 1..count
  const scrollRef = useRef<ScrollView>(null);

  const handleLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);

  // 레이아웃 측정 직후(또는 언어가 바뀌어 슬라이드 수가 달라진 뒤) 첫 슬라이드로 애니메이션 없이 이동
  useEffect(() => {
    posRef.current = count > 1 ? 1 : 0;
    setDotIdx(0);
    if (width > 0) scrollRef.current?.scrollTo({ x: width * posRef.current, animated: false });
  }, [width, count]);

  // 5초마다 자동 롤링 — 손으로 밀어 dotIdx가 바뀌면 타이머가 다시 시작된다
  useEffect(() => {
    if (count < 2 || !width || !active || showSupport) return;
    const timer = setInterval(() => {
      posRef.current += 1;
      scrollRef.current?.scrollTo({ x: width * posRef.current, animated: true });
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, width, dotIdx, active, showSupport]);

  // 경계의 복제 슬라이드에 도착하면 반대쪽 실제 슬라이드로 즉시 이동
  const settleAt = (rawPos: number) => {
    if (count < 2) return;
    let pos = rawPos;
    if (pos <= 0) {
      pos = count;
      scrollRef.current?.scrollTo({ x: width * pos, animated: false });
    } else if (pos >= count + 1) {
      pos = 1;
      scrollRef.current?.scrollTo({ x: width * pos, animated: false });
    }
    posRef.current = pos;
    setDotIdx(pos - 1);
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    settleAt(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const open = (slide: PromoSlide) => {
    if (slide.url) Linking.openURL(slide.url).catch(() => {});
    else setShowSupport(true);
  };

  if (count === 0) return null;
  return (
    <View onLayout={handleLayout} style={s.wrap} testID="promo-banner">
      {width > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={count > 1}
          onMomentumScrollEnd={handleMomentumEnd}
        >
          {extended.map((slide, i) => {
            const tone = TONES[slide.tone];
            return (
              <TouchableOpacity
                key={`${slide.key}-${i}`}
                style={[s.banner, { width, borderColor: tone.border, backgroundColor: tone.box }]}
                activeOpacity={0.8}
                onPress={() => open(slide)}
                accessibilityRole="button"
                accessibilityLabel={`${t(slide.title)}, ${t(slide.sub)}`}
              >
                <View style={[s.icon, { backgroundColor: tone.icon }]}><Text style={s.iconText}>{slide.icon}</Text></View>
                <View style={s.textCol}>
                  <Text style={s.title} numberOfLines={1} ellipsizeMode="tail">{t(slide.title)}</Text>
                  <Text style={s.sub} numberOfLines={1} ellipsizeMode="tail">{t(slide.sub)}</Text>
                </View>
                <Text style={s.arrow}>›</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      {count > 1 && (
        <View style={s.dots}>
          {slides.map((sl, i) => <View key={sl.key} style={[s.dot, i === dotIdx && s.dotActive]} />)}
        </View>
      )}
      <SupportSheet visible={showSupport} onClose={() => setShowSupport(false)} />
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { marginTop: 18 },
  banner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  iconText: { fontSize: 18 },
  textCol: { flex: 1, minWidth: 0 },
  title: { color: C.text, fontSize: 14, fontWeight: '800' },
  sub: { color: C.textSub, fontSize: 11, fontWeight: '600', marginTop: 2 },
  arrow: { color: C.textSub, fontSize: 20, fontWeight: '700', marginLeft: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 7 },
  dot: { width: 14, height: 3, borderRadius: 2, backgroundColor: C.border },
  dotActive: { backgroundColor: C.accent },
});
