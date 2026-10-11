// ─── 달력 (월 보기 / 주 보기) ───────────────────────────────────────────────────
// 월 보기는 6주 그리드, 주 보기는 한 줄(일~토). 헤더의 ‹ › 로 한 달/한 주씩 이동, 가운데 라벨을 누르면 오늘로.
// 보이는 기간이 바뀌면 onVisibleRangeChange로 알려 부모가 그 기간의 일정을 모두 보여줄 수 있게 한다.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  addDays,
  dayKey,
  endOfMonth,
  formatMonthLabel,
  formatWeekLabel,
  isSameDay,
  monthGrid,
  startOfMonth,
  startOfWeek,
  WEEKDAYS,
} from '../lib/dateUtils';
import { C } from '../lib/colors';
import type { CalendarMode } from '../lib/prefs';

export type DateRange = { start: Date; end: Date };

export function Calendar({
  selectedDate,
  onSelectDate,
  markedDays,
  mode = 'month',
  onModeChange,
  onVisibleRangeChange,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  markedDays: Set<string>;
  /** 월/주 보기. 생략하면 월 보기 고정(모드 토글 숨김) */
  mode?: CalendarMode;
  onModeChange?: (m: CalendarMode) => void;
  /** 화면에 보이는 기간(양 끝 포함)이 바뀔 때 */
  onVisibleRangeChange?: (range: DateRange) => void;
}) {
  const [view, setView] = useState(() => ({
    year: selectedDate.getFullYear(),
    month: selectedDate.getMonth(),
  }));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(selectedDate));

  // 바깥에서 selectedDate가 바뀌면(일정 저장 후 이동, 녹음 후 오늘로 복귀 등) 달력도 그 달/그 주로 동기화.
  // 사용자가 직접 넘긴 달/주는 selectedDate가 그대로라 유지된다.
  useEffect(() => {
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    setView((v) => (v.year === y && v.month === m ? v : { year: y, month: m }));
    const ws = startOfWeek(selectedDate);
    setWeekStart((w) => (isSameDay(w, ws) ? w : ws));
  }, [selectedDate]);

  // 모드를 바꾸면 "보고 있던 기간"을 이어간다 — 월→주: 보던 달에 선택 날짜가 있으면 그 주, 아니면 그 달 첫 주.
  // 주→월: 보던 주(목요일 기준)의 달. 첫 마운트에는 건너뛴다.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (mode === 'week') {
      const inViewedMonth = selectedDate.getFullYear() === view.year && selectedDate.getMonth() === view.month;
      setWeekStart(startOfWeek(inViewedMonth ? selectedDate : new Date(view.year, view.month, 1)));
    } else {
      const mid = addDays(weekStart, 3);
      setView({ year: mid.getFullYear(), month: mid.getMonth() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 보이는 기간 통지 — 같은 기간이면 다시 부르지 않는다
  const lastRangeKeyRef = useRef('');
  const range: DateRange =
    mode === 'week'
      ? { start: weekStart, end: addDays(weekStart, 6) }
      : { start: startOfMonth(new Date(view.year, view.month, 1)), end: endOfMonth(new Date(view.year, view.month, 1)) };
  useEffect(() => {
    const key = `${mode}:${dayKey(range.start)}:${dayKey(range.end)}`;
    if (key === lastRangeKeyRef.current) return;
    lastRangeKeyRef.current = key;
    onVisibleRangeChange?.(range);
  });

  const today = new Date();

  const prev = () => {
    if (mode === 'week') setWeekStart((w) => addDays(w, -7));
    else setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  };
  const next = () => {
    if (mode === 'week') setWeekStart((w) => addDays(w, 7));
    else setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));
  };
  const goToday = () => {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    setView({ year: t.getFullYear(), month: t.getMonth() });
    setWeekStart(startOfWeek(t));
    onSelectDate(t);
  };

  const cells: (Date | null)[] =
    mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : monthGrid(view.year, view.month);
  const label = mode === 'week' ? formatWeekLabel(weekStart) : formatMonthLabel(view.year, view.month);
  const showsToday = cells.some((d) => d && isSameDay(d, today));

  return (
    <View style={styles.wrap}>
      {/* 헤더: ‹ 기간 라벨 › */}
      <View style={styles.head}>
        <TouchableOpacity onPress={prev} style={styles.navBtn} accessibilityLabel={mode === 'week' ? '지난 주' : '지난 달'}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday} activeOpacity={0.7} style={styles.labelBtn} accessibilityLabel="오늘로 이동">
          <Text style={styles.monthLabel}>{label}</Text>
          {!showsToday && <Text style={styles.todayHint}>오늘로</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={next} style={styles.navBtn} accessibilityLabel={mode === 'week' ? '다음 주' : '다음 달'}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 요일 헤더 */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, i === 0 && styles.sun, i === 6 && styles.sat]}>
            {w}
          </Text>
        ))}
      </View>

      {/* 날짜 그리드 (월: 6주, 주: 1줄) */}
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const selected = isSameDay(d, selectedDate);
          const isToday = isSameDay(d, today);
          const marked = markedDays.has(dayKey(d));
          const dow = d.getDay();
          // 주 보기에서 달이 걸치는 주는 그 주의 다수 달(목요일 기준)이 아닌 날짜만 흐리게
          const outsideMonth = mode === 'week' && d.getMonth() !== addDays(weekStart, 3).getMonth();
          return (
            <TouchableOpacity key={dayKey(d)} style={styles.cell} onPress={() => onSelectDate(d)} activeOpacity={0.7}>
              <View style={[styles.dayCircle, selected && styles.daySelected, !selected && isToday && styles.dayToday]}>
                <Text
                  style={[
                    styles.dayText,
                    dow === 0 && styles.sun,
                    dow === 6 && styles.sat,
                    outsideMonth && styles.dayTextOutside,
                    selected && styles.dayTextSelected,
                  ]}
                >
                  {d.getDate()}
                </Text>
              </View>
              <View style={[styles.dot, marked && !selected && styles.dotOn]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 월/주 보기 토글 — 고른 값은 부모가 저장해 다음 실행에도 유지 */}
      {onModeChange && (
        <View style={styles.modeRow}>
          <View style={styles.modeToggle}>
            {(['month', 'week'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnOn]}
                onPress={() => mode !== m && onModeChange(m)}
                accessibilityState={{ selected: mode === m }}
                accessibilityLabel={m === 'month' ? '월 보기' : '주 보기'}
              >
                <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextOn]}>{m === 'month' ? '월' : '주'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.border,
  },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  navText: { color: C.textSub, fontSize: 26, fontWeight: '300' },
  labelBtn: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  monthLabel: { color: C.text, fontSize: 17, fontWeight: '700' },
  todayHint: { color: C.accent, fontSize: 11, fontWeight: '600', marginTop: 1 },

  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekday: { flex: 1, textAlign: 'center', color: C.textSub, fontSize: 12, fontWeight: '600' },
  sun: { color: C.sun },
  sat: { color: C.sat },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: C.accent },
  dayToday: { borderWidth: 1.5, borderColor: C.accent },
  dayText: { color: C.text, fontSize: 15, fontWeight: '400' },
  dayTextOutside: { color: C.textDim },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: '#6FB2FF' },

  modeRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  modeToggle: { flexDirection: 'row', backgroundColor: C.surfaceHigh, borderRadius: 9, padding: 3 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 7 },
  modeBtnOn: { backgroundColor: C.accent },
  modeBtnText: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  modeBtnTextOn: { color: '#fff' },
});
