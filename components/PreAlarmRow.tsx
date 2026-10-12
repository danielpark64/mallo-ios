// ─── 하루 전 미리 알림 줄 ─────────────────────────────────────────────────────
// 실제 일정 카드와 구분되는 작은 테두리 줄. 누르면 원래 일정의 상세가 열린다.
import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { useTheme, type Palette } from '../lib/theme';
import { formatTime, type PreAlarmItem } from '../lib/dateUtils';
import type { ScheduleRecord } from '../lib/storage';
import { useT } from '../lib/i18n';

export function PreAlarmRow({ item, onPress }: { item: PreAlarmItem; onPress: (r: ScheduleRecord) => void }) {
  const C = useTheme();
  const { t } = useT();
  const s = useMemo(() => makeStyles(C), [C]);
  const target = new Date(item.record.scheduleAt!);
  const text = item.record.content || item.record.transcript;
  return (
    <TouchableOpacity style={s.row} onPress={() => onPress(item.record)} activeOpacity={0.7} testID="pre-alarm-row">
      <Text style={s.time}>⏰ {formatTime(new Date(item.fireAt))}</Text>
      <View style={s.body}>
        <Text style={s.label}>{t('미리 알림 · 하루 전')}</Text>
        <Text style={s.text} numberOfLines={1}>{t('내일 {time} · {text}', { time: formatTime(target), text: text ?? '' })}</Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  time: { color: C.textSub, fontSize: 13, fontWeight: '700' },
  body: { flex: 1 },
  label: { color: C.accent, fontSize: 11, fontWeight: '700' },
  text: { color: C.textSub, fontSize: 13, marginTop: 2 },
});
