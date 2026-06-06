import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { dayKey, isSameDay, monthGrid, WEEKDAYS } from '../lib/dateUtils';

export function Calendar({
  selectedDate,
  onSelectDate,
  markedDays,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  markedDays: Set<string>;
}) {
  const [view, setView] = useState(() => ({
    year: selectedDate.getFullYear(),
    month: selectedDate.getMonth(),
  }));

  const today = new Date();
  const cells = monthGrid(view.year, view.month);

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
    <View style={styles.wrap}>
      {/* 헤더: 연월 + 이동 */}
      <View style={styles.head}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday}>
          <Text style={styles.monthLabel}>
            {view.year}년 {view.month + 1}월
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 요일 헤더 */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            style={[styles.weekday, i === 0 && styles.sun, i === 6 && styles.sat]}
          >
            {w}
          </Text>
        ))}
      </View>

      {/* 날짜 그리드 */}
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const selected = isSameDay(d, selectedDate);
          const isToday = isSameDay(d, today);
          const marked = markedDays.has(dayKey(d));
          const dow = d.getDay();
          return (
            <TouchableOpacity
              key={dayKey(d)}
              style={styles.cell}
              onPress={() => onSelectDate(d)}
              activeOpacity={0.7}
            >
              <View style={[styles.dayCircle, selected && styles.daySelected, !selected && isToday && styles.dayToday]}>
                <Text
                  style={[
                    styles.dayText,
                    dow === 0 && styles.sun,
                    dow === 6 && styles.sat,
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  navText: { color: '#9bdcff', fontSize: 26, fontWeight: '300' },
  monthLabel: { color: '#f0f0ff', fontSize: 18, fontWeight: '700' },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', color: '#666680', fontSize: 12, fontWeight: '600' },
  sun: { color: '#e06c6c' },
  sat: { color: '#6c9ce0' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: '#e05c5c' },
  dayToday: { borderWidth: 1.5, borderColor: '#9bdcff' },
  dayText: { color: '#d8d8ee', fontSize: 15, fontWeight: '500' },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: '#7dd3fc' },
});
