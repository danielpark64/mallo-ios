// ─── 1년 보기 (달력 탭에서 "‹ 2026"을 누르면) ─────────────────────────────────────
// 해마다 작은 달 12개(3열×4줄), 한 달 보기처럼 위아래로 이어지는 연속 스크롤(2026-10-18 사용자 요청, iOS 캘린더 방식).
// 일정 있는 날은 파랑 굵게, 공휴일·일요일은 빨강, 오늘은 빨간 동그라미. 달을 누르면 그 달의 한 달 보기로(onPickMonth).
// 위치 계산이 정확하도록 작은 달은 항상 6주 높이로 그린다(달마다 높이가 같다).
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View, type ViewToken } from 'react-native';
import { Text } from './AppText';
import { useFontScale, useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { formatMonthLabel, formatMonthShort } from '../lib/dateUtils';
import { monthWeeks } from '../lib/calendarKit/monthLayout';
import { getHoliday, ymdKey } from '../lib/calendarKit/holidays';

export function YearView({
  year,
  minYear,
  maxYear,
  busyDays,
  onPickMonth,
  onClose,
}: {
  /** 처음 보여 줄 해 */
  year: number;
  minYear: number;
  maxYear: number;
  /** 일정 있는 날('YYYY-MM-DD') */
  busyDays: Set<string>;
  onPickMonth: (y: number, m: number) => void;
  onClose: () => void;
}) {
  const C = useTheme();
  const { t, lang } = useT();
  const { scale } = useFontScale();
  const s = useMemo(() => makeStyles(C, scale), [C, scale]);
  const years = useMemo(() => Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i), [minYear, maxYear]);
  // 해 하나의 높이: 제목 + 4줄 × (달 제목 + 6주)
  const rowH = Math.round(14 * scale);
  const monthH = Math.round(22 * scale) + rowH * 6 + 14;
  const yearH = Math.round(52 * scale) + monthH * 4;
  const startIndex = Math.min(years.length - 1, Math.max(0, year - minYear));
  const [visibleYear, setVisibleYear] = useState(years[startIndex]);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.item === 'number') setVisibleYear((cur) => (cur === first.item ? cur : (first.item as number)));
  }).current;
  const todayKey = ymdKey(new Date());
  const renderItem = useCallback(({ item }: { item: number }) => (
    <YearBlock y={item} busyDays={busyDays} todayKey={todayKey} onPickMonth={onPickMonth} styles={s} C={C} rowH={rowH} monthH={monthH} yearH={yearH} lang={lang} />
  ), [busyDays, todayKey, onPickMonth, s, C, rowH, monthH, yearH, lang]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.head}>
        <Text style={s.headYear}>{visibleYear}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
          <Text style={s.close}>{t('한 달 보기')}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={years}
        keyExtractor={(y) => String(y)}
        initialScrollIndex={startIndex}
        getItemLayout={(_, index) => ({ length: yearH, offset: yearH * index, index })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
      />
    </View>
  );
}

const YearBlock = memo(function YearBlock({
  y, busyDays, todayKey, onPickMonth, styles: s, C, rowH, monthH, yearH,
}: {
  y: number; busyDays: Set<string>; todayKey: string; onPickMonth: (y: number, m: number) => void;
  styles: ReturnType<typeof makeStyles>; C: Palette; rowH: number; monthH: number; yearH: number;
  /** 언어가 바뀌면 다시 그리도록 */
  lang: string;
}) {
  return (
    <View style={{ height: yearH }}>
      <Text style={s.year} maxFontSizeMultiplier={1}>{y}</Text>
      <View style={s.grid}>
        {Array.from({ length: 12 }, (_, m) => {
          const weeks = monthWeeks(y, m);
          while (weeks.length < 6) weeks.push(Array(7).fill(null)); // 높이를 맞추려고 6주로
          const isThisMonth = todayKey.startsWith(`${y}-${String(m + 1).padStart(2, '0')}-`);
          return (
            <TouchableOpacity key={m} style={[s.month, { height: monthH }]} onPress={() => onPickMonth(y, m)} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={formatMonthLabel(y, m)}>
              <Text style={[s.mTitle, isThisMonth && { color: C.red }]} maxFontSizeMultiplier={1}>{formatMonthShort(m)}</Text>
              {weeks.map((w, wi) => (
                <View key={wi} style={[s.row, { height: rowH }]}>
                  {w.map((d, ci) => {
                    if (!d) return <View key={ci} style={s.dayBox} />;
                    const k = ymdKey(d);
                    const isToday = k === todayKey;
                    const red = !!getHoliday(d) || d.getDay() === 0;
                    const busy = busyDays.has(k);
                    return (
                      <View key={ci} style={[s.dayBox, isToday && s.todayBox]}>
                        <Text maxFontSizeMultiplier={1} style={[s.day, red && { color: C.red }, busy && !red && s.busy, busy && s.busyBold, isToday && { color: '#fff' }]}>{d.getDate()}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

const makeStyles = (C: Palette, scale: number) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  headYear: { color: C.red, fontSize: 20, fontWeight: '800' },
  close: { color: C.accent, fontSize: 15, fontWeight: '600' },
  year: { color: C.text, fontSize: 26, fontWeight: '800', paddingHorizontal: 14, height: Math.round(52 * scale), textAlignVertical: 'bottom', paddingTop: Math.round(14 * scale) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  month: { width: '33.33%', paddingHorizontal: 6, paddingTop: 6, overflow: 'hidden' },
  mTitle: { color: C.text, fontSize: 15, fontWeight: '800', height: Math.round(22 * scale) },
  row: { flexDirection: 'row' },
  dayBox: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  todayBox: { backgroundColor: C.red },
  day: { textAlign: 'center', fontSize: 9, color: C.textSub },
  busy: { color: C.accent },
  busyBold: { fontWeight: '800' },
});
