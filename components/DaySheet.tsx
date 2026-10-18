// ─── 달력에서 날짜를 누르면 아래에서 올라오는 그날 일정 ─────────────────────────────
// 그날 일정(기간 일정 포함)·공휴일·음력, "＋ 이 날 일정 추가". 카드를 누르면 시트를 닫은 뒤 상세를 연다
// (iOS는 모달이 떠 있는 동안 다른 모달을 띄우면 조용히 무시한다 — 닫고 나서 연다: App 쪽에서 지연).
import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { ScheduleCard } from './ScheduleCard';
import { useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { formatDayHeader, relativeDayLabel, schedulesOn } from '../lib/dateUtils';
import { getHoliday } from '../lib/calendarKit/holidays';
import { lunarShortText } from '../lib/calendarKit/lunar';
import { getLang } from '../lib/i18n/lang';
import type { ScheduleRecord } from '../lib/storage';
import { shiftOn, type ShiftData } from '../lib/shiftImport';

export function DaySheet({
  day,
  records,
  compact,
  shifts = null,
  onClose,
  onOpen,
  onAppend,
  onFixDate,
  onAdd,
}: {
  day: Date | null;
  records: ScheduleRecord[];
  compact: boolean;
  /** 교대알람에서 가져온 근무표 */
  shifts?: ShiftData | null;
  onClose: () => void;
  onOpen: (r: ScheduleRecord) => void;
  onAppend: (r: ScheduleRecord) => void;
  onFixDate: (r: ScheduleRecord) => void;
  onAdd: (d: Date) => void;
}) {
  const C = useTheme();
  const { t } = useT();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const items = useMemo(() => (day ? schedulesOn(records, day) : []), [records, day]);
  if (!day) return null;
  const rel = relativeDayLabel(day);
  const hol = getHoliday(day);
  const lunar = getLang() === 'ko' ? lunarShortText(day) : '';
  const shift = shiftOn(shifts, day);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.back} activeOpacity={1} onPress={onClose} accessibilityLabel={t('닫기')} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.grab} />
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{rel ? `${rel} · ` : ''}{formatDayHeader(day)}</Text>
            {shift ? (
              <Text style={[s.sub, { color: shift.color, fontWeight: '700' }]}>{t('교대알람 근무: {name}', { name: shift.label })}</Text>
            ) : null}
            {(hol || lunar) ? (
              <Text style={s.sub}>
                {hol ? <Text style={{ color: C.red }}>{hol}</Text> : null}
                {hol && lunar ? '  ' : ''}
                {lunar ? t('음력 {d}', { d: lunar }) : ''}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
            <Text style={s.close}>{t('닫기')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {items.length === 0 && <Text style={s.empty}>{t('이 날은 일정이 없어요')}</Text>}
          {items.map((r) => (
            <ScheduleCard key={r.id} item={r} compact={compact} onPress={onOpen} onAppend={onAppend} onFixDate={onFixDate} />
          ))}
        </ScrollView>
        <TouchableOpacity style={s.add} onPress={() => onAdd(day)} activeOpacity={0.75} accessibilityRole="button">
          <Text style={s.addText}>{t('＋ 이 날 일정 추가')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  title: { color: C.text, fontSize: 18, fontWeight: '700' },
  sub: { color: C.textSub, fontSize: 13, marginTop: 3 },
  close: { color: C.accent, fontSize: 15, fontWeight: '600' },
  empty: { color: C.textDim, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  add: { marginTop: 6, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: C.surfaceHigh },
  addText: { color: C.accent, fontSize: 15, fontWeight: '700' },
});
