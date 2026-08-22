// ─── CalendarGrid — 순수 렌더링 (제스처·애니메이션 없음) ───────────────────────────
// 주간(1행)과 월간(6행) 양쪽에서 공유한다. 7칸씩 명시적으로 행을 나눠서
// (Android에서 100/7% 반올림 오차로 토요일 칸이 다음 줄로 밀리던 버그 있었음)
// flex:1로 등분한다.
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../ui/Text';
import { dayKey, isSameDay, isSameMonth, WEEKDAYS } from '../../lib/dateUtils';
import { useStyles, type Theme } from '../../lib/theme';

export const CELL_H = 44;
export const WEEKDAY_H = 24;

export function WeekdayHeader() {
  const s = useStyles(makeStyles);
  return (
    <View style={s.weekRow}>
      {WEEKDAYS.map((w, i) => (
        <Text key={w} style={[s.weekday, i === 0 && s.sun, i === 6 && s.sat]}>
          {w}
        </Text>
      ))}
    </View>
  );
}

export function CalendarGrid({
  rows,
  selectedDate,
  today,
  markedDays,
  onSelectDate,
  dimMonth,
}: {
  rows: Date[][];
  selectedDate: Date;
  today: Date;
  markedDays: Set<string>;
  onSelectDate: (d: Date) => void;
  /** 있으면 이 달 밖의 날짜(인접 월)를 흐리게 표시 */
  dimMonth?: { year: number; month: number };
}) {
  const s = useStyles(makeStyles);
  return (
    <View>
      {rows.map((row, ri) => (
        <View key={ri} style={s.weekRowLine}>
          {row.map((d) => {
            const selected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            const marked = markedDays.has(dayKey(d));
            const dow = d.getDay();
            const outside = dimMonth ? !isSameMonth(d, new Date(dimMonth.year, dimMonth.month, 1)) : false;
            return (
              <TouchableOpacity
                key={dayKey(d)}
                style={s.cell}
                onPress={() => onSelectDate(d)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    s.dayCircle,
                    selected && s.daySelected,
                    !selected && isToday && s.dayToday,
                  ]}
                >
                  <Text
                    style={[
                      s.dayText,
                      dow === 0 && s.sun,
                      dow === 6 && s.sat,
                      outside && s.dayTextOutside,
                      selected && s.dayTextSelected,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                {/* 선택된 날에도 점이 보이도록 onAccent로 — 예전엔 선택 원에 가려 사라졌었다 */}
                <View style={[s.dot, marked && (selected ? s.dotOnSelected : s.dotOn)]} />
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  weekRow: { flexDirection: 'row', marginBottom: 2, height: WEEKDAY_H },
  weekday: { flex: 1, textAlign: 'center', color: t.c.textSub, fontSize: 12, fontWeight: '600' },
  sun: { color: t.c.sun },
  sat: { color: t.c.sat },

  weekRowLine: { flexDirection: 'row', height: CELL_H },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  daySelected: { backgroundColor: t.c.accent },
  dayToday: { borderWidth: 1.5, borderColor: t.c.accent },
  dayText: { color: t.c.text, fontSize: 15, fontWeight: '400' },
  dayTextOutside: { color: t.c.textDisabled },
  dayTextSelected: { color: t.c.onAccent, fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: t.c.accent },
  dotOnSelected: { backgroundColor: t.c.onAccent },
});
