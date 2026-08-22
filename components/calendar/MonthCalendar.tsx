// ─── MonthCalendar — 편집기 날짜 선택용 정적 월 달력 ─────────────────────────────
// 접이식이 필요 없다: Modal>ScrollView 안에 있어 수직 제스처를 넣으면 스크롤과
// 경합하고, 날짜를 고르면 바로 닫히는 흐름이라 접힘 상태를 가질 이유가 없다.
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../ui/Text';
import { monthMatrix } from '../../lib/dateUtils';
import { useStyles, type Theme } from '../../lib/theme';
import { CalendarGrid, WeekdayHeader } from './CalendarGrid';

export function MonthCalendar({
  selectedDate,
  onSelectDate,
  markedDays,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  markedDays: Set<string>;
}) {
  const s = useStyles(makeStyles);
  const [view, setView] = useState(() => ({
    year: selectedDate.getFullYear(),
    month: selectedDate.getMonth(),
  }));

  const today = new Date();
  const rows = monthMatrix(view.year, view.month);

  const prevMonth = () =>
    setView((v) => {
      const m = v.month - 1;
      return m < 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: m };
    });
  const nextMonth = () =>
    setView((v) => {
      const m = v.month + 1;
      return m > 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: m };
    });
  const goToday = () => {
    setView({ year: today.getFullYear(), month: today.getMonth() });
    onSelectDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
          <Text style={s.navText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday} activeOpacity={0.7}>
          <Text style={s.monthLabel}>{view.year}년 {view.month + 1}월</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
          <Text style={s.navText}>›</Text>
        </TouchableOpacity>
      </View>
      <WeekdayHeader />
      <CalendarGrid
        rows={rows}
        selectedDate={selectedDate}
        today={today}
        markedDays={markedDays}
        onSelectDate={onSelectDate}
        dimMonth={{ year: view.year, month: view.month }}
      />
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
    paddingBottom: 10,
    marginBottom: 4,
    ...t.elevation('e1'),
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  navText: { color: t.c.textSub, fontSize: 26, fontWeight: '300' },
  monthLabel: { color: t.c.text, fontSize: 17, fontWeight: '700' },
});
