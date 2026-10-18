// ─── 작은 점 달력 (일정 탭의 날짜 머리 📅) ────────────────────────────────────────
// 목록을 보다가 "그 날 앞뒤로 뭐가 있지, 그 주는 비었나"를 바로 확인하는 창.
// 큰 달력 탭으로 옮겨 가지 않고 그 자리에서 한 달을 훑고, 날짜를 누르면 목록이 그 날로 간다.
import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { dayKey, formatDayHeader, formatMonthLabel, isSameDay, monthGrid, weekdayLabels } from '../lib/dateUtils';

export function MiniMonthSheet({
  visible,
  selected,
  markedDays,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** 처음 보여 줄 달과 테두리를 칠 날 */
  selected: Date;
  /** 일정이 있는 날(dayKey) — 점으로 표시 */
  markedDays: Set<string>;
  onPick: (d: Date) => void;
  onClose: () => void;
}) {
  const C = useTheme();
  const { t, lang } = useT();
  const s = useMemo(() => makeStyles(C), [C]);
  const [ym, setYm] = useState({ y: selected.getFullYear(), m: selected.getMonth() });
  useEffect(() => {
    if (visible) setYm({ y: selected.getFullYear(), m: selected.getMonth() });
  }, [visible, selected]);
  const cells = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wd = useMemo(() => weekdayLabels(), [lang]);
  const today = new Date();
  const move = (n: number) => setYm(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.back} activeOpacity={1} onPress={onClose} accessibilityLabel={t('닫기')}>
        <TouchableOpacity activeOpacity={1} style={s.card} onPress={() => {}}>
          <View style={s.nav}>
            <TouchableOpacity onPress={() => move(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={t('이전 달')}>
              <Text style={s.navBtn}>‹</Text>
            </TouchableOpacity>
            <Text style={s.title}>{formatMonthLabel(ym.y, ym.m)}</Text>
            <TouchableOpacity onPress={() => move(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={t('다음 달')}>
              <Text style={s.navBtn}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={s.row}>
            {wd.map((w, i) => (
              <Text key={i} style={[s.wd, i === 0 && { color: C.red }, i === 6 && { color: C.accent }]}>{w}</Text>
            ))}
          </View>
          <View style={s.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={s.cell} />;
              const marked = markedDays.has(dayKey(d));
              const sel = isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              return (
                <TouchableOpacity
                  key={i}
                  style={s.cell}
                  onPress={() => onPick(d)}
                  accessibilityLabel={`${formatDayHeader(d)}${marked ? ', ' + t('일정 있음') : ''}`}
                  accessibilityState={{ selected: sel }}
                  testID={`mini-day-${d.getDate()}`}
                >
                  <View style={[s.num, sel && s.numSel, !sel && isToday && s.numToday]}>
                    <Text style={[s.numText, sel && s.numTextSel, d.getDay() === 0 && !sel && { color: C.red }, d.getDay() === 6 && !sel && { color: C.accent }]}>{d.getDate()}</Text>
                  </View>
                  <View style={[s.dot, marked ? { backgroundColor: C.accent } : null]} testID={marked ? 'mini-dot' : undefined} />
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.hint}>{t('날짜를 누르면 목록이 그 날로 가요')}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 6 },
  navBtn: { color: C.text, fontSize: 24, fontWeight: '500', paddingHorizontal: 8 },
  title: { color: C.text, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', color: C.textSub, fontSize: 12, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  numSel: { backgroundColor: C.accent },
  numToday: { borderWidth: 1.5, borderColor: C.accent },
  numText: { color: C.text, fontSize: 14, fontWeight: '500' },
  numTextSel: { color: '#fff', fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  hint: { color: C.textDim, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
