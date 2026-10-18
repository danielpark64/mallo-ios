// ─── 달력 탭: 위아래로 이어지는 한 달 보기 (iOS 캘린더 방식) ──────────────────────────
// 2026-10-18 사용자 결정: 달력은 달력만 크게, 칸에 일정 이름(점 대신), 기간 일정은 이어진 막대,
// 공휴일·음력, 위아래 연속 스크롤(아이폰처럼). 날짜를 누르면 그날 일정(onPickDay), "‹ 2026"은 1년 보기(onYearPress).
// 배치 계산은 lib/calendarKit/monthLayout.ts(순수 함수, 테스트 있음).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, StyleSheet, TouchableOpacity, View, type GestureResponderEvent, type ViewToken } from 'react-native';
import { Text } from './AppText';
import { useFontScale, useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { formatDayHeader, formatMonthLabel, formatMonthShort, weekdayLabels } from '../lib/dateUtils';
import { clampZoom, panZoom, pinchZoom, type Zoom } from '../lib/calendarKit/zoom';
import { cellMetrics, monthWeeks, singleDayIndex, weekBars, type CalDensity, type CalEvent, type CellMetrics } from '../lib/calendarKit/monthLayout';
import { getHolidayShort, ymdKey } from '../lib/calendarKit/holidays';
import { getSolarTerm } from '../lib/calendarKit/solarTerms';
import { lunarShortText } from '../lib/calendarKit/lunar';
import { shiftOn, type ShiftData } from '../lib/shiftImport';

const BEFORE = 24; // 오늘 기준 앞뒤로 그릴 달 수
const AFTER = 36;

type Metrics = CellMetrics;

function monthOf(index: number, base: Date) {
  const d = new Date(base.getFullYear(), base.getMonth() + index - BEFORE, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

/** 그릴 수 있는 달 범위(1년 보기의 해 이동을 이 안으로 막는다) */
export function monthScrollYearRange(): { min: number; max: number } {
  const now = new Date();
  return {
    min: new Date(now.getFullYear(), now.getMonth() - BEFORE, 1).getFullYear(),
    max: new Date(now.getFullYear(), now.getMonth() + AFTER, 1).getFullYear(),
  };
}

export const MonthScroll = memo(function MonthScroll({
  events,
  selected,
  showLunar,
  onToggleLunar,
  onPickDay,
  onYearPress,
  jumpTo,
  density,
  onDensity,
  shifts = null,
}: {
  events: CalEvent[];
  selected: Date | null;
  showLunar: boolean;
  /** 음력 켜기·끄기(한국어 화면에서만 넘긴다) */
  onToggleLunar?: () => void;
  onPickDay: (d: Date) => void;
  onYearPress: (year: number) => void;
  /** 이 달로 스크롤(1년 보기에서 달을 눌렀을 때·저장한 일정의 달). nonce가 바뀔 때마다. 처음 그릴 때 있으면 그 달에서 시작 */
  jumpTo: { y: number; m: number; nonce: number } | null;
  /** 확대 단계: 0 작게(점) · 1 보통 · 2 크게 — 두 손가락 벌리기/오므리기, 달 제목·요일 줄 두 번 탭 */
  density: CalDensity;
  onDensity: (d: CalDensity) => void;
  /** 교대알람에서 가져온 근무표 — 칸의 날짜 옆에 작은 색 글씨 */
  shifts?: ShiftData | null;
}) {
  const C = useTheme();
  const { t, lang } = useT();
  const { scale } = useFontScale();
  const s = useMemo(() => makeStyles(C, scale), [C, scale]);
  const base = useMemo(() => new Date(), []);
  const metrics: Metrics = useMemo(() => cellMetrics(density, scale), [density, scale]);

  const months = useMemo(() => Array.from({ length: BEFORE + AFTER + 1 }, (_, i) => i), []);
  // 달마다 높이가 다르다(5주/6주) → 누적 위치표
  const layout = useMemo(() => {
    const offsets: number[] = [];
    const heights: number[] = [];
    let acc = 0;
    for (const i of months) {
      const { y, m } = monthOf(i, base);
      const h = metrics.titleH + monthWeeks(y, m).length * metrics.cellH;
      offsets.push(acc);
      heights.push(h);
      acc += h;
    }
    return { offsets, heights };
  }, [months, base, metrics]);

  const singles = useMemo(() => singleDayIndex(events), [events]);
  const listRef = useRef<FlatList<number>>(null);
  const indexOf = (y: number, m: number) => (y - base.getFullYear()) * 12 + (m - base.getMonth()) + BEFORE;
  // 1년 보기에서 달을 골라 돌아오면 새로 그려지므로, 그 달에서 바로 시작한다(그린 직후 scrollToIndex는 무시될 수 있다)
  const [initialIndex] = useState(() => {
    const i = jumpTo ? indexOf(jumpTo.y, jumpTo.m) : BEFORE;
    return i >= 0 && i < BEFORE + AFTER + 1 ? i : BEFORE;
  });
  const firstJumpRef = useRef(jumpTo?.nonce ?? null);
  const [visible, setVisible] = useState(() => monthOf(initialIndex, base));
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // 같은 달이면 상태를 바꾸지 않는다 — 스크롤 중 불필요한 다시 그리기 방지(저사양 32)
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.item === 'number') {
      const next = monthOf(first.item, base);
      setVisible((cur) => (cur.y === next.y && cur.m === next.m ? cur : next));
    }
  }).current;

  const scrollToMonth = useCallback((y: number, m: number, animated = true) => {
    const idx = indexOf(y, m);
    if (idx < 0 || idx >= months.length) return;
    try { listRef.current?.scrollToIndex({ index: idx, animated }); } catch {}
  }, [base, months.length]);

  // 글자 크기가 바뀌면 칸 높이가 달라져 같은 스크롤 위치가 엉뚱한 달(예: 10월→3월)이 된다 → 보던 달로 되돌린다.
  // 보던 달은 높이가 바뀌기 전(그리는 중)에 잡아 둔다 — 그린 뒤에는 보이는 달 값이 이미 바뀌어 있을 수 있다
  const prevMetricsRef = useRef(metrics);
  const keepMonthRef = useRef<{ y: number; m: number } | null>(null);
  if (prevMetricsRef.current !== metrics) {
    prevMetricsRef.current = metrics;
    keepMonthRef.current = visibleRef.current;
  }
  useEffect(() => {
    const k = keepMonthRef.current;
    if (!k) return;
    keepMonthRef.current = null;
    const id = setTimeout(() => scrollToMonth(k.y, k.m, false), 0);
    return () => clearTimeout(id);
  }, [metrics, scrollToMonth]);

  // ── 화면 확대(사진처럼): 두 손가락 벌리기·오므리기, 확대 중 한 손가락 옆으로 밀기, 제목 두 번 탭 2배 ──
  // 위아래 한 손가락은 그대로 목록 스크롤. 계산은 lib/calendarKit/zoom.ts(테스트 있음).
  const boxRef = useRef<View>(null);
  const sizeRef = useRef({ w: 1, h: 1, x: 0, y: 0 });
  const zoomRef = useRef<Zoom>({ s: 1, tx: 0, ty: 0 });
  const aS = useRef(new Animated.Value(1)).current;
  const aX = useRef(new Animated.Value(0)).current;
  const aY = useRef(new Animated.Value(0)).current;
  const [zoomed, setZoomed] = useState(false);
  // iOS: 두 손가락 확대 중에는 목록이 같이 스크롤되지 않게 잠근다(Android는 PanResponder가 막아 준다)
  const [pinching, setPinching] = useState(false);
  // 요일 칸 폭(요일 글자 위치를 확대에 맞춰 옮길 때 쓴다)
  const [wdCell, setWdCell] = useState(0);
  // 요일 i의 왼쪽 위치 = tx + s·(i+½)·폭 − ½·폭 (애니메이션 값이라 매 렌더 새로 만들지 않는다)
  const wdX = useMemo(
    () => Array.from({ length: 7 }, (_, i) => Animated.add(Animated.add(aX, Animated.multiply(aS, (i + 0.5) * wdCell)), -wdCell / 2)),
    [aX, aS, wdCell],
  );
  const applyZoom = useCallback((z: Zoom, animated = false) => {
    zoomRef.current = z;
    if (animated) {
      Animated.parallel([
        Animated.timing(aS, { toValue: z.s, duration: 180, useNativeDriver: true }),
        Animated.timing(aX, { toValue: z.tx, duration: 180, useNativeDriver: true }),
        Animated.timing(aY, { toValue: z.ty, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      aS.setValue(z.s); aX.setValue(z.tx); aY.setValue(z.ty);
    }
  }, [aS, aX, aY]);
  const gestureRef = useRef<{ mode: 'pinch' | 'pan' | null; start: Zoom; f0: { x: number; y: number }; d0: number; panDx0?: number | null }>({ mode: null, start: { s: 1, tx: 0, ty: 0 }, f0: { x: 0, y: 0 }, d0: 0 });
  const mid = (e: GestureResponderEvent) => {
    const t2 = e.nativeEvent.touches;
    const { x, y } = sizeRef.current;
    return {
      f: { x: (t2[0].pageX + t2[1].pageX) / 2 - x, y: (t2[0].pageY + t2[1].pageY) / 2 - y },
      d: Math.hypot(t2[0].pageX - t2[1].pageX, t2[0].pageY - t2[1].pageY),
    };
  };
  const endGesture = () => {
    gestureRef.current.mode = null;
    setPinching(false);
    const z = zoomRef.current;
    // 거의 원래 크기면 딱 맞춰 되돌린다
    if (z.s < 1.08) applyZoom({ s: 1, tx: 0, ty: 0 }, true);
    setZoomed(zoomRef.current.s > 1.08);
  };
  const zoomer = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponderCapture: (e, g) => {
      if (e.nativeEvent.touches.length === 2) return true;
      // 확대 중에는 옆으로 미는 한 손가락을 가져온다(위아래는 목록에 맡긴다)
      return zoomRef.current.s > 1.01 && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3;
    },
    onPanResponderGrant: (e) => {
      // 확대 상자의 화면 위치(손가락 좌표를 상자 기준으로 바꾸려고)
      boxRef.current?.measure((_x, _y, w, h, px, py) => { sizeRef.current = { w, h, x: px, y: py }; });
      const g = gestureRef.current;
      g.start = { ...zoomRef.current };
      g.panDx0 = null;
      if (e.nativeEvent.touches.length === 2) {
        const { f, d } = mid(e);
        g.mode = 'pinch'; g.f0 = f; g.d0 = d;
        setPinching(true);
      } else g.mode = 'pan';
    },
    onPanResponderMove: (e, gs) => {
      const g = gestureRef.current;
      const { w, h } = sizeRef.current;
      if (e.nativeEvent.touches.length === 2) {
        const { f, d } = mid(e);
        if (g.mode !== 'pinch' || g.d0 <= 0) { g.mode = 'pinch'; g.start = { ...zoomRef.current }; g.f0 = f; g.d0 = d; setPinching(true); return; }
        applyZoom(pinchZoom(g.start, g.f0, f, d / g.d0, w, h));
      } else if (g.mode === 'pan') {
        // 가로챈 순간까지 움직인 10px만큼 튀지 않게 시작점을 맞춘다
        if (g.panDx0 == null) g.panDx0 = gs.dx;
        applyZoom(panZoom(g.start, gs.dx - g.panDx0, w, h));
      }
    },
    onPanResponderRelease: endGesture,
    onPanResponderTerminate: endGesture,
    onPanResponderTerminationRequest: () => false,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [applyZoom]);
  const resetZoom = useCallback(() => { applyZoom({ s: 1, tx: 0, ty: 0 }, true); setZoomed(false); }, [applyZoom]);
  // 달 제목·요일 줄 두 번 탭: 2배 ↔ 원래(칸은 한 번 탭이 그날 시트라 두 번 탭을 쓰지 않는다 — 반응이 늦어진다)
  const lastTapRef = useRef(0);
  const onTitleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current >= 320) { lastTapRef.current = now; return; }
    lastTapRef.current = 0;
    if (zoomRef.current.s > 1.01) { resetZoom(); return; }
    const { w } = sizeRef.current;
    boxRef.current?.measure((_x, _y, bw, bh, px, py) => { sizeRef.current = { w: bw, h: bh, x: px, y: py }; });
    applyZoom(clampZoom({ s: 2, tx: -(w || 0) / 2, ty: 0 }, w, sizeRef.current.h), true);
    setZoomed(true);
  }, [applyZoom, resetZoom]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wd = useMemo(() => weekdayLabels(), [lang]);
  // 날짜가 바뀔 때만 달라지는 문자열 — Date 객체를 넘기면 MonthBlock memo가 매번 깨진다
  const today = new Date();
  const todayKey = ymdKey(today);
  const selKey = selected ? ymdKey(selected) : null;
  const renderItem = useCallback(({ item }: { item: number }) => {
    const { y, m } = monthOf(item, base);
    const inMonth = (k: string | null) => (k && k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}-`) ? k : null);
    return (
      <MonthBlock
        y={y} m={m} events={events} singles={singles} metrics={metrics} styles={s} C={C}
        todayKey={inMonth(todayKey)} selKey={inMonth(selKey)} showLunar={showLunar} onPickDay={onPickDay}
        title={y === base.getFullYear() ? formatMonthShort(m) : formatMonthLabel(y, m)} lang={lang}
        onTitleTap={onTitleTap} shifts={shifts}
      />
    );
  }, [base, events, singles, metrics, s, C, todayKey, selKey, showLunar, onPickDay, lang, onTitleTap, shifts]);

  return (
    <View style={{ flex: 1 }}>
      {/* 고정 머리: 지금 보고 있는 달 + 1년 보기 + 오늘, 요일 */}
      <View style={s.head}>
        <TouchableOpacity onPress={() => onYearPress(visible.y)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={`${t('1년 보기')}, ${formatMonthLabel(visible.y, visible.m)}`}>
          <Text style={s.yearBtn}>‹ {visible.y}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {onToggleLunar && (
            <TouchableOpacity onPress={onToggleLunar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityState={{ selected: showLunar }}>
              <Text style={[s.todayBtn, !showLunar && { color: C.textSub }]}>{t('음력')}</Text>
            </TouchableOpacity>
          )}
          {zoomed && (
            <TouchableOpacity onPress={resetZoom} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
              <Text style={s.todayBtn}>{t('원래 크기')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => { resetZoom(); scrollToMonth(today.getFullYear(), today.getMonth()); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
            <Text style={s.todayBtn}>{t('오늘')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity activeOpacity={1} onPress={onTitleTap} style={[s.wdWrap, { height: Math.round(20 * scale) }]}
        onLayout={(e) => setWdCell(e.nativeEvent.layout.width / 7)}
        accessibilityHint={t('두 번 누르면 달력을 확대·원래 크기')}>
        {/* 확대 중에도 요일이 그 칸 위에 오도록 글자 위치만 옮긴다(글자 크기·모양은 그대로).
            처음엔 줄을 늘리고 글자를 1/s로 되돌렸는데 Android에서 요일 줄이 통째로 안 보였다(2026-10-18 32) */}
        {wdCell > 0 && wd.map((w, i) => (
          <Animated.View key={i} style={[s.wdCell, { width: wdCell, transform: [{ translateX: wdX[i] }] }]}>
            <Text style={[s.wd, i === 0 && { color: C.red }, i === 6 && { color: C.accent }]} maxFontSizeMultiplier={1}>{w}</Text>
          </Animated.View>
        ))}
      </TouchableOpacity>
      {/* collapsable={false}: Android에서 이 View가 합쳐져 없어지면 리스트가 두 손가락 터치까지 가져간다 */}
      <View ref={boxRef} style={{ flex: 1, overflow: 'hidden' }} collapsable={false} {...zoomer.panHandlers}
        onLayout={() => boxRef.current?.measure((_x, _y, w, h, px, py) => { sizeRef.current = { w, h, x: px, y: py }; })}>
      <Animated.View style={{ flex: 1, transformOrigin: 'left top', transform: [{ translateX: aX }, { translateY: aY }, { scale: aS }] }}>
      <FlatList
        ref={listRef}
        data={months}
        keyExtractor={(i) => String(i)}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: layout.heights[index], offset: layout.offsets[index], index })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
        windowSize={5}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!pinching}
        renderItem={renderItem}
      />
      </Animated.View>
      </View>
    </View>
  );
});

const MonthBlock = memo(function MonthBlock({
  y, m, events, singles, metrics, styles: s, C, todayKey, selKey, showLunar, onPickDay, title, onTitleTap, shifts,
}: {
  y: number; m: number; events: CalEvent[]; singles: Map<string, CalEvent[]>; metrics: Metrics;
  styles: ReturnType<typeof makeStyles>; C: Palette;
  /** 오늘·선택한 날이 이 달에 있을 때만 'YYYY-MM-DD', 아니면 null(다른 달은 다시 그리지 않게) */
  todayKey: string | null; selKey: string | null; showLunar: boolean;
  onPickDay: (d: Date) => void; title: string;
  /** 언어가 바뀌면 다시 그리도록(공휴일·음력 표시가 언어에 따라 달라진다) */
  lang: string;
  onTitleTap: () => void;
  shifts: ShiftData | null;
}) {
  const weeks = useMemo(() => monthWeeks(y, m), [y, m]);
  // 이 달에 걸치는 일정만 막대 계산에 넘긴다
  const monthEvents = useMemo(() => {
    const ms = new Date(y, m, 1).getTime();
    const me = new Date(y, m + 1, 0).getTime();
    return events.filter((e) => e.start.getTime() <= me && e.end.getTime() >= ms);
  }, [events, y, m]);
  const { cellH, numH, laneH, showNames } = metrics;
  return (
    <View>
      <TouchableOpacity activeOpacity={1} onPress={onTitleTap} style={{ height: metrics.titleH, justifyContent: 'flex-end', paddingBottom: 6, paddingHorizontal: 6 }}>
        <Text style={s.monthTitle} maxFontSizeMultiplier={1}>{title}</Text>
      </TouchableOpacity>
      {weeks.map((week, wi) => {
        // 막대 + 하루 일정이 들어갈 줄 수(작게는 얇은 막대 1줄 + 점)
        const maxLines = showNames ? Math.floor((cellH - numH - 4) / laneH) : 1;
        // 기간 막대가 칸 아래로 넘치지 않게 줄 수를 제한한다(넘친 막대는 그날 시트에서 보인다)
        const bars = weekBars(monthEvents, week).filter((b) => b.lane < maxLines);
        const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
        return (
          <View key={wi} style={[s.week, { height: cellH }]}>
            {week.map((d, ci) => {
              if (!d) return <View key={ci} style={s.cell} />;
              const k = ymdKey(d);
              const isToday = k === todayKey;
              const isSel = k === selKey;
              const hol = getHolidayShort(d);
              const shift = shiftOn(shifts, d);
              const sub = showLunar ? (getSolarTerm(k) ?? lunarShortText(d)) : '';
              const items = singles.get(k) ?? [];
              const barTitles = bars.filter((b) => ci >= b.startCol && ci <= b.endCol).map((b) => b.title);
              const free = Math.max(0, maxLines - lanes);
              const shown = items.length > free ? items.slice(0, Math.max(0, free - 1)) : items;
              const more = items.length - shown.length;
              const red = !!hol || d.getDay() === 0;
              return (
                <TouchableOpacity
                  key={ci}
                  style={[s.cell, isSel && s.cellSel]}
                  onPress={() => onPickDay(d)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={[formatDayHeader(d), hol, shift?.label, ...barTitles, ...items.map((e) => e.title)].filter(Boolean).join(', ')}
                >
                  <View style={[s.numRow, { height: numH }]}>
                    <View style={[s.num, isToday && s.numToday]}>
                      <Text maxFontSizeMultiplier={1} style={[s.numText, red && { color: C.red }, d.getDay() === 6 && !red && { color: C.accent }, isToday && s.numTextToday]}>{d.getDate()}</Text>
                    </View>
                    {shift ? (
                      <Text style={[s.shift, { color: shift.color }]} numberOfLines={1} maxFontSizeMultiplier={1}>{shift.label}</Text>
                    ) : null}
                    {(hol || sub) ? (
                      <Text style={[s.sub, hol ? { color: C.red } : null]} numberOfLines={1} maxFontSizeMultiplier={1}>{hol ?? sub}</Text>
                    ) : null}
                  </View>
                  {/* 기간 막대 자리만큼 비운다 */}
                  <View style={{ height: lanes * laneH }} />
                  {showNames ? (
                    <>
                      {shown.map((e) => (
                        <Text key={e.id} style={[s.chip, { height: laneH - 1 }]} numberOfLines={1} maxFontSizeMultiplier={1}>{e.title}</Text>
                      ))}
                      {more > 0 && <Text style={[s.more, { height: laneH - 1 }]} numberOfLines={1} maxFontSizeMultiplier={1}>+{more}</Text>}
                    </>
                  ) : items.length > 0 ? (
                    // 작게: 일정 수만큼 점(최대 3개)
                    <View style={s.dots}>
                      {items.slice(0, 3).map((e) => <View key={e.id} style={s.dot} />)}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
            {/* 기간 막대: 칸 위에 겹쳐 그린다(누르면 시작한 날) */}
            {bars.map((b) => (
              <View
                key={b.id}
                pointerEvents="none"
                style={[
                  s.bar,
                  {
                    top: numH + b.lane * laneH,
                    height: laneH - 2,
                    left: `${(b.startCol / 7) * 100}%`,
                    width: `${((b.endCol - b.startCol + 1) / 7) * 100}%`,
                    borderTopLeftRadius: b.fromPrev ? 0 : 4, borderBottomLeftRadius: b.fromPrev ? 0 : 4,
                    borderTopRightRadius: b.toNext ? 0 : 4, borderBottomRightRadius: b.toNext ? 0 : 4,
                  },
                ]}
              >
                {showNames && <Text style={s.barText} numberOfLines={1} maxFontSizeMultiplier={1}>{b.title}</Text>}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
});

const makeStyles = (C: Palette, scale: number) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 6 },
  yearBtn: { color: C.red, fontSize: 15, fontWeight: '600' },
  headTitle: { color: C.text, fontSize: 17, fontWeight: '700', flexShrink: 1, marginHorizontal: 8 },
  todayBtn: { color: C.accent, fontSize: 15, fontWeight: '600' },
  wdWrap: { overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  wdCell: { position: 'absolute', top: 0, left: 0 },
  wd: { flex: 1, textAlign: 'center', color: C.textSub, fontSize: 11, fontWeight: '600' },
  monthTitle: { color: C.red, fontSize: 20, fontWeight: '800' },
  week: { flexDirection: 'row', overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  cell: { flex: 1, paddingHorizontal: 1, overflow: 'hidden' },
  cellSel: { backgroundColor: C.surfaceHigh, borderRadius: 6 },
  // 가운데 정렬(2026-10-18): 요일 머리글(가운데) 아래에 숫자가 오게 — 왼쪽 정렬이면 월요일 숫자가 앞 칸 근무 글씨(초번·말번)와 한 덩어리로 읽혔다.
  // 칸이 좁으면 근무·공휴일 글씨가 먼저 줄어들고 숫자는 그대로(shift·sub flexShrink 1)
  numRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  num: { minWidth: Math.round(20 * scale), height: Math.round(20 * scale), borderRadius: Math.round(10 * scale), alignItems: 'center', justifyContent: 'center' },
  numToday: { backgroundColor: C.red },
  numText: { color: C.text, fontSize: 13, fontWeight: '600' },
  numTextToday: { color: '#fff', fontWeight: '800' },
  shift: { fontSize: 9, fontWeight: '800', flexShrink: 1, maxWidth: '55%' },
  sub: { flexShrink: 1, color: C.textDim, fontSize: 9 },
  chip: { fontSize: 10, color: C.text, backgroundColor: C.surfaceHigh, borderRadius: 3, paddingHorizontal: 2, marginBottom: 1, overflow: 'hidden' },
  more: { fontSize: 10, color: C.textSub, paddingHorizontal: 2 },
  dots: { flexDirection: 'row', gap: 3, paddingLeft: 4, marginTop: 1 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent },
  bar: { position: 'absolute', backgroundColor: C.accent, paddingHorizontal: 3, justifyContent: 'center', marginHorizontal: 1 },
  barText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
