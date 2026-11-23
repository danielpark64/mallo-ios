// ─── 받은 일정 확인 시트 ────────────────────────────────────────────────────────
// mallo://receive?d=… 로 앱이 열리면 띄운다. 사용자가 [달력에 넣기]를 눌러야 저장된다(자동 저장 없음).
// "알람도 켤까요?"(기본 켬)는 아직 오지 않은 시각 있는 일정에만 보인다 — 지난 일정·시간 미정은 알람을 걸지 않는다.
// 같은 일정(같은 id)을 더 새로 받았으면 "새 내용으로 바꿀까요?"로 묻는다(옛 링크는 App이 시트 없이 알린다).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { useT } from '../lib/i18n';
import { useTheme, type Palette } from '../lib/theme';
import { remindLabel } from '../lib/reminders';
import { canArmShared, whenText, type SharedSchedule } from '../lib/sendSchedule';

export function ReceiveSheet({
  visible,
  data,
  update,
  onAccept,
  onReject,
}: {
  visible: boolean;
  data: SharedSchedule | null;
  /** 이미 받은 같은 일정의 새 내용인가 */
  update: boolean;
  onAccept: (alarmOn: boolean) => void;
  onReject: () => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [alarmOn, setAlarmOn] = useState(true);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!visible) return;
    setAlarmOn(true);
    doneRef.current = false;
  }, [visible]);

  if (!data) return null;
  const armable = canArmShared(data);
  const remindLine = data.hasTime
    ? data.remindBefore.length
      ? t('미리 알림 {list} · 정각 알림 {state}', { list: data.remindBefore.map((m) => t(remindLabel(m))).join(' · '), state: t(data.exactAlarm ? '켬' : '끔') })
      : data.exactAlarm ? t('미리 알림 없음 · 정각 알림 켬') : t('알림 없음')
    : null;
  const accept = () => {
    if (doneRef.current) return; // 연타로 두 번 저장되지 않게
    doneRef.current = true;
    onAccept(armable && alarmOn);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onReject}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onReject} accessibilityLabel={t('안 받기')} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal testID="receive-sheet">
        <View style={s.handle} />
        <Text style={s.title} accessibilityRole="header">{t(update ? '새 내용으로 바꿀까요?' : '받은 일정을 넣을까요?')}</Text>
        {update ? <Text style={s.sub}>{t('보낸 사람이 같은 일정을 고쳐서 다시 보냈어요')}</Text> : null}
        <ScrollView style={s.scroll}>
          {data.from ? <Text style={s.from}>📩 {t('보낸 사람: {name}', { name: data.from })}</Text> : null}
          <View style={s.preview}>
            <Text style={s.previewWhen}>{whenText(data)}</Text>
            <Text style={s.previewContent}>{data.content}</Text>
            {remindLine && armable ? <Text style={s.previewSub}>{remindLine}</Text> : null}
          </View>
          {armable ? (
            <View style={s.toggleRow}>
              <Text style={s.toggleText}>{t('알람도 켤까요?')}</Text>
              <Switch value={alarmOn} onValueChange={setAlarmOn} accessibilityLabel={t('알람도 켤까요?')} testID="receive-alarm" />
            </View>
          ) : data.hasTime ? (
            <Text style={s.previewSub}>{t('지난 일정이라 알람은 걸지 않아요')}</Text>
          ) : null}
        </ScrollView>
        <View style={s.btnRow}>
          <TouchableOpacity style={s.rejectBtn} onPress={onReject} accessibilityRole="button" testID="receive-reject">
            <Text style={s.rejectText}>{t('안 받기')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.acceptBtn} onPress={accept} accessibilityRole="button" testID="receive-accept">
            <Text style={s.acceptText}>{t(update ? '바꾸기' : '달력에 넣기')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10, maxHeight: '80%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 14 },
  title: { color: C.text, fontSize: 19, fontWeight: '800' },
  sub: { color: C.textSub, fontSize: 13, marginTop: 4 },
  scroll: { flexGrow: 0 },
  from: { color: C.accent, fontSize: 15, fontWeight: '800', marginTop: 12 },
  preview: { marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, gap: 4 },
  previewWhen: { color: C.text, fontSize: 16, fontWeight: '800' },
  previewContent: { color: C.text, fontSize: 16, lineHeight: 23 },
  previewSub: { color: C.textSub, fontSize: 13, marginTop: 8 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, paddingHorizontal: 14, minHeight: 54, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  toggleText: { color: C.text, fontSize: 16, fontWeight: '700', flex: 1 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  rejectBtn: { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: C.textSub, fontSize: 16, fontWeight: '700' },
  acceptBtn: { flex: 2, minHeight: 52, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: C.onAccent, fontSize: 17, fontWeight: '800' },
});
