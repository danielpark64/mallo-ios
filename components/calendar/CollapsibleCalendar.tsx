// ─── CollapsibleCalendar — 메인 화면용: 평소엔 주간 한 줄, 아래로 당기면 월간 ─────────
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AppText as Text } from '../ui/Text';
import {
  addDays,
  addMonths,
  isSameDay,
  monthMatrix,
  startOfWeek,
  weekIndexOf,
} from '../../lib/dateUtils';
import { useStyles, type Theme } from '../../lib/theme';
import { CELL_H, CalendarGrid, WEEKDAY_H, WeekdayHeader } from './CalendarGrid';

const ROWS = 6;
const WEEK_H = CELL_H;
const MONTH_H = CELL_H * ROWS;

export function CollapsibleCalendar({
  selectedDate,
  onSelectDate,
  markedDays,
  onRangeChange,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  markedDays: Set<string>;
  onRangeChange?: (from: Date, to: Date) => void;
}) {
  const s = useStyles(makeStyles);
  const today = new Date();

  const [expanded, setExpanded] = useState(false);
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(selectedDate));
  const [monthView, setMonthView] = useState(() => {
    const label = addDays(startOfWeek(selectedDate), 4); // 그 주의 목요일이 속한 달
    return { year: label.getFullYear(), month: label.getMonth() };
  });

  const progress = useSharedValue(0);
  const startProgress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(expanded ? 1 : 0, { damping: 20, stiffness: 220, mass: 0.6 });
  }, [expanded, progress]);

  // 바깥(App)에서 선택 날짜가 바뀌면(카드 탭 등) 표시 주도 따라간다
  useEffect(() => {
    if (!isSameDay(weekAnchor, startOfWeek(selectedDate))) {
      const wa = startOfWeek(selectedDate);
      setWeekAnchor(wa);
      const label = addDays(wa, 4);
      setMonthView({ year: label.getFullYear(), month: label.getMonth() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // 현재 화면에 보이는 기간(주/월)을 바깥에 알려 그 안의 일정 전부를 보여줄 수 있게 한다
  useEffect(() => {
    if (!onRangeChange) return;
    if (expanded) {
      const from = new Date(monthView.year, monthView.month, 1);
      const to = new Date(monthView.year, monthView.month + 1, 0);
      onRangeChange(from, to);
    } else {
      onRangeChange(weekAnchor, addDays(weekAnchor, 6));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, weekAnchor, monthView]);

  const rows = monthMatrix(monthView.year, monthView.month);
  const selectedRow = Math.max(0, weekIndexOf(monthView.year, monthView.month, weekAnchor));

  const swipeX = useSharedValue(0);

  const gridStyle = useAnimatedStyle(() => ({
    height: WEEK_H + (MONTH_H - WEEK_H) * progress.value,
  }));
  const rowsStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -selectedRow * CELL_H * (1 - progress.value) },
      { translateX: swipeX.value },
    ],
  }));

  const snapTo = (goExpand: boolean) => {
    'worklet';
    progress.value = withSpring(
      goExpand ? 1 : 0,
      { damping: 20, stiffness: 220, mass: 0.6 },
      (finished) => {
        'worklet';
        if (finished) runOnJS(setExpanded)(goExpand);
      }
    );
  };
  const haptic = () => Haptics.selectionAsync();

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-16, 16])
    .onBegin(() => {
      startProgress.value = progress.value;
    })
    .onUpdate((e) => {
      const p = startProgress.value + e.translationY / (MONTH_H - WEEK_H);
      progress.value = Math.max(0, Math.min(1, p));
    })
    .onEnd((e) => {
      const goExpand = e.velocityY > 400 ? true : e.velocityY < -400 ? false : progress.value > 0.5;
      runOnJS(haptic)();
      snapTo(goExpand);
    });

  const shiftWeek = (deltaWeeks: number) => {
    const wa = addDays(weekAnchor, deltaWeeks * 7);
    setWeekAnchor(wa);
    const label = addDays(wa, 4);
    setMonthView({ year: label.getFullYear(), month: label.getMonth() });
    // 선택 요일(0~6)을 유지한 채 새 주로 이동 — 아래 목록도 그 요일 기준으로 갱신
    const rawOffset = Math.round((selectedDate.getTime() - weekAnchor.getTime()) / 86400000);
    const offset = Math.max(0, Math.min(6, rawOffset));
    onSelectDate(addDays(wa, offset));
  };
  const shiftMonth = (delta: number) => {
    const next = addMonths(new Date(monthView.year, monthView.month, 1), delta);
    setMonthView({ year: next.getFullYear(), month: next.getMonth() });
    // 선택된 날짜(일)를 유지한 채 새 달로 이동 — 달 길이가 짧으면 말일로 clamp
    const daysInNext = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const day = Math.min(selectedDate.getDate(), daysInNext);
    onSelectDate(new Date(next.getFullYear(), next.getMonth(), day));
  };

  const goPrev = () => (expanded ? shiftMonth(-1) : shiftWeek(-1));
  const goNext = () => (expanded ? shiftMonth(1) : shiftWeek(1));

  const CARD_W = 350; // 슬라이드 아웃/인 거리 계산용 대략치 — 정확한 폭 불필요, 화면 밖으로만 나가면 됨
  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      // 손가락을 따라 살짝 저항감 있게 움직여서 "밀고 있다"는 게 실제로 보이게 한다
      swipeX.value = e.translationX * 0.6;
    })
    .onEnd((e) => {
      const goingNext = e.translationX < -40;
      const goingPrev = e.translationX > 40;
      if (goingNext || goingPrev) {
        runOnJS(haptic)();
        const exitTo = goingNext ? -CARD_W : CARD_W;
        swipeX.value = withTiming(exitTo, { duration: 140 }, (finished) => {
          'worklet';
          if (!finished) return;
          runOnJS(goingNext ? goNext : goPrev)();
          swipeX.value = goingNext ? CARD_W : -CARD_W;
          swipeX.value = withSpring(0, { damping: 22, stiffness: 260 });
        });
      } else {
        swipeX.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });
  const gesture = Gesture.Race(pan, swipe);
  const goToday = () => {
    const wa = startOfWeek(today);
    setWeekAnchor(wa);
    setMonthView({ year: today.getFullYear(), month: today.getMonth() });
    onSelectDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  };

  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const YEAR_RANGE = 12;
  const years = Array.from({ length: YEAR_RANGE * 2 + 1 }, (_, i) => monthView.year - YEAR_RANGE + i);

  const applyYear = (y: number) => {
    Haptics.selectionAsync();
    setYearPickerOpen(false);
    if (expanded) {
      setMonthView((v) => ({ year: y, month: v.month }));
    } else {
      const d = new Date(y, weekAnchor.getMonth(), weekAnchor.getDate());
      const wa = startOfWeek(d);
      setWeekAnchor(wa);
      const label = addDays(wa, 4);
      setMonthView({ year: label.getFullYear(), month: label.getMonth() });
    }
  };

  const handleSelect = (d: Date) => {
    Haptics.selectionAsync();
    onSelectDate(d);
  };

  const toggleExpand = () => {
    Haptics.selectionAsync();
    snapTo(!expanded);
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <TouchableOpacity onPress={goPrev} style={s.navBtn}>
          <Text style={s.navText}>‹</Text>
        </TouchableOpacity>
        <View style={s.labelRow}>
          <TouchableOpacity
            onPress={() => setYearPickerOpen(true)}
            activeOpacity={0.7}
            style={s.yearBtn}
          >
            <Text style={s.yearBtnText}>{monthView.year}년</Text>
            <Text style={s.yearBtnCaret}>▾</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToday} activeOpacity={0.7}>
            <Text style={s.monthLabel}>
              {' '}{monthView.month + 1}월{!expanded ? ` ${selectedRow + 1}주` : ''}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={goNext} style={s.navBtn}>
          <Text style={s.navText}>›</Text>
        </TouchableOpacity>
      </View>

      <WeekdayHeader />

      <GestureDetector gesture={gesture}>
        <View>
          <Animated.View style={[s.clip, gridStyle]}>
            <Animated.View style={rowsStyle}>
              <CalendarGrid
                rows={rows}
                selectedDate={selectedDate}
                today={today}
                markedDays={markedDays}
                onSelectDate={handleSelect}
                dimMonth={monthView}
              />
            </Animated.View>
          </Animated.View>

          <TouchableOpacity style={s.handleRow} onPress={toggleExpand} activeOpacity={0.7}>
            <View style={s.handle} />
            <Text style={s.hint}>{expanded ? '위로 밀면 주간 보기' : '아래로 당기면 월 달력'}</Text>
          </TouchableOpacity>
        </View>
      </GestureDetector>

      <Modal
        visible={yearPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setYearPickerOpen(false)}
      >
        <TouchableOpacity
          style={s.yearOverlay}
          activeOpacity={1}
          onPress={() => setYearPickerOpen(false)}
        >
          <View style={s.yearSheet} onStartShouldSetResponder={() => true}>
            <Text style={s.yearSheetTitle}>연도 선택</Text>
            <ScrollView style={s.yearList}>
              <View style={s.yearGrid}>
                {years.map((y) => (
                  <TouchableOpacity
                    key={y}
                    style={[s.yearChip, y === monthView.year && s.yearChipActive]}
                    onPress={() => applyYear(y)}
                  >
                    <Text style={[s.yearChipText, y === monthView.year && s.yearChipTextActive]}>
                      {y}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  wrap: {
    backgroundColor: t.c.surface,
    marginHorizontal: 16,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 4,
    ...t.elevation('e1'),
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  navText: { color: t.c.textSub, fontSize: 26, fontWeight: '300' },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  monthLabel: { color: t.c.text, fontSize: 17, fontWeight: '700' },
  yearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: t.c.surfaceAlt, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  yearBtnText: { color: t.c.text, fontSize: 17, fontWeight: '700' },
  yearBtnCaret: { color: t.c.textDim, fontSize: 11, fontWeight: '700' },
  clip: { overflow: 'hidden' },
  handleRow: { alignItems: 'center', gap: 5, paddingTop: 10, paddingBottom: 2 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: t.c.border },
  hint: { color: t.c.textDim, fontSize: 11, fontWeight: '500' },
  yearOverlay: {
    flex: 1, backgroundColor: t.c.overlay, alignItems: 'center', justifyContent: 'center',
  },
  yearSheet: {
    backgroundColor: t.c.surface, borderRadius: 20, padding: 16, width: 280, maxHeight: '60%',
  },
  yearSheetTitle: {
    color: t.c.text, fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 12,
  },
  yearList: { maxHeight: 320 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  yearChip: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.c.surfaceAlt,
  },
  yearChipActive: { backgroundColor: t.c.accent },
  yearChipText: { color: t.c.text, fontSize: 15, fontWeight: '600' },
  yearChipTextActive: { color: t.c.onAccent },
});
