// ─── 전체 일정 조회: 기간 직접 선택 시트 (년 / 월 / 일 휠) ─────────────────────
// 숫자를 타이핑하는 대신 휠을 굴려 고른다. 각 휠의 맨 위 "전체"를 고르면 그 항목은 조건에서 빠진다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Palette } from '../lib/theme';
import type { RecordFilter } from '../lib/filterRecords';
import { ScrollPicker } from './ScrollPicker';

const ANY = 0; // "전체"

export function FilterSheet({
  visible,
  value,
  yearChoices,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: Pick<RecordFilter, 'year' | 'month' | 'day'>;
  /** 휠에 보여줄 연도 후보(일정이 있는 해 ± 1년) */
  yearChoices: number[];
  onApply: (v: Pick<RecordFilter, 'year' | 'month' | 'day'>) => void;
  onClose: () => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [year, setYear] = useState(value.year ?? ANY);
  const [month, setMonth] = useState(value.month ?? ANY);
  const [day, setDay] = useState(value.day ?? ANY);

  // 열릴 때마다 현재 적용값으로 되돌린다
  useEffect(() => {
    if (!visible) return;
    setYear(value.year ?? ANY);
    setMonth(value.month ?? ANY);
    setDay(value.day ?? ANY);
  }, [visible, value.year, value.month, value.day]);

  // ScrollPicker는 items/label 참조가 바뀌면 전체를 다시 계산·재스크롤하므로 고정해 둔다
  const years = useMemo(() => [ANY, ...yearChoices], [yearChoices]);
  const months = useMemo(() => [ANY, ...Array.from({ length: 12 }, (_, i) => i + 1)], []);
  const days = useMemo(() => [ANY, ...Array.from({ length: 31 }, (_, i) => i + 1)], []);
  const label = useCallback((v: number) => (v === ANY ? '전체' : String(v)), []);

  const summary = [year !== ANY && `${year}년`, month !== ANY && `${month}월`, day !== ANY && `${day}일`]
    .filter(Boolean)
    .join(' ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />
        <Text style={s.title}>기간 직접 선택</Text>
        <Text style={s.summary}>{summary || '전체 기간'}</Text>

        <View style={s.pickers}>
          <View style={s.pickerCol}>
            <Text style={s.pickerLabel}>년</Text>
            {/* ScrollPicker는 flex:1이라 세로 컨테이너 안에선 높이가 0이 된다 → 가로 행으로 감싸 높이를 지킨다 */}
            <View style={s.pickerRow}>
              <ScrollPicker value={year} items={years} onChange={setYear} label={label} />
            </View>
          </View>
          <View style={s.pickerCol}>
            <Text style={s.pickerLabel}>월</Text>
            {/* ScrollPicker는 flex:1이라 세로 컨테이너 안에선 높이가 0이 된다 → 가로 행으로 감싸 높이를 지킨다 */}
            <View style={s.pickerRow}>
              <ScrollPicker value={month} items={months} onChange={setMonth} label={label} />
            </View>
          </View>
          <View style={s.pickerCol}>
            <Text style={s.pickerLabel}>일</Text>
            {/* ScrollPicker는 flex:1이라 세로 컨테이너 안에선 높이가 0이 된다 → 가로 행으로 감싸 높이를 지킨다 */}
            <View style={s.pickerRow}>
              <ScrollPicker value={day} items={days} onChange={setDay} label={label} />
            </View>
          </View>
        </View>

        <View style={s.btnRow}>
          <TouchableOpacity
            style={s.resetBtn}
            onPress={() => { setYear(ANY); setMonth(ANY); setDay(ANY); }}
            activeOpacity={0.8}
          >
            <Text style={s.resetBtnText}>초기화</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.applyBtn}
            onPress={() =>
              onApply({ year: year === ANY ? null : year, month: month === ANY ? null : month, day: day === ANY ? null : day })
            }
            activeOpacity={0.85}
          >
            <Text style={s.applyBtnText}>적용</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 14 },
  title: { color: C.text, fontSize: 17, fontWeight: '700' },
  summary: { color: C.accent, fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: 12 },
  pickers: { flexDirection: 'row', gap: 10 },
  pickerCol: { flex: 1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center' },
  pickerLabel: { color: C.textSub, fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  resetBtn: { flex: 1, height: 50, borderRadius: 14, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  resetBtnText: { color: C.textSub, fontSize: 15, fontWeight: '600' },
  applyBtn: { flex: 2, height: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
