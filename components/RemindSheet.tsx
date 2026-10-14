// ─── 알림 바꾸기 시트 ─────────────────────────────────────────────────────────
// 상세 화면의 알림 줄을 누르면 아래에서 열린다. 칩을 고르고 **이 시트 안의 "저장"**을 눌러야 바뀐다.
// 예전엔 상세에 즉시 저장 칩이 있어, 칩을 바꾼 뒤 오른쪽 위 "수정"을 저장으로 알고 누르는 혼란이 있었다.
// 수정 화면까지 가면 한 번 더 거쳐야 해서(2026-10-14 피드백) 칩과 저장을 한 시트에 묶었다 — 그동안 "수정"은 가려진다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { useT } from '../lib/i18n';
import { normalizeRemind, remindLabel, REMIND_OPTIONS } from '../lib/reminders';
import { useTheme, type Palette } from '../lib/theme';
import { voiceAlarmSupported } from '../lib/voiceAlarm';

export function RemindSheet({
  visible,
  remindBefore,
  exactAlarm,
  voiceAlarm,
  showVoice,
  onSave,
  onClose,
}: {
  visible: boolean;
  remindBefore: number[];
  exactAlarm: boolean;
  /** [VOICE_ALARM] 보류된 기능 — 상용에서는 showVoice가 항상 false */
  voiceAlarm: boolean;
  showVoice: boolean;
  onSave: (remindBefore: number[], exactAlarm: boolean, voiceAlarm: boolean) => void;
  onClose: () => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [r, setR] = useState<number[]>(remindBefore);
  const [exact, setExact] = useState(exactAlarm);
  const [voice, setVoice] = useState(voiceAlarm);
  const savingRef = useRef(false);

  // 열릴 때마다 저장된 값으로 되돌린다(취소·바깥 누르기는 버린다)
  useEffect(() => {
    if (!visible) return;
    setR(normalizeRemind(remindBefore));
    setExact(exactAlarm);
    setVoice(voiceAlarm);
    savingRef.current = false;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (m: number) => setR((cur) => normalizeRemind(cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const none = r.length === 0 && !exact;
  const summary = r.length
    ? t('{list}에 한 번씩 미리 알려요', { list: r.map((m) => t(remindLabel(m))).join(' · ') }) + (exact ? t(', 정각에도 울려요') : '')
    : exact ? t('정각에만 울려요 (못 들으면 1분·2분 뒤 다시)') : t('알림 없음 — 울리지 않아요');

  const save = () => {
    if (savingRef.current) return; // 연타로 알람이 두 번 걸리지 않게
    savingRef.current = true;
    onSave(normalizeRemind(r), exact, voice);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel={t('닫기')} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
        <View style={s.handle} />
        <Text style={s.title} accessibilityRole="header">{t('알림 바꾸기')}</Text>
        <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 4 }}>
          <Text style={s.groupLabel}>{t('미리 알림')}</Text>
          <View style={s.chips}>
            {REMIND_OPTIONS.map((m) => {
              const on = r.includes(m);
              return (
                <TouchableOpacity
                  key={m}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() => toggle(m)}
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t('미리 알림 {label}', { label: t(remindLabel(m)) })}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>{t(remindLabel(m))}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[s.chips, { marginTop: 10 }]}>
            <TouchableOpacity
              style={[s.chip, exact && s.chipOn]}
              onPress={() => setExact((v) => !v)}
              accessibilityState={{ selected: exact }}
              accessibilityLabel={t('정각 알림')}
            >
              <Text style={[s.chipText, exact && s.chipTextOn]}>{t('정각')}</Text>
            </TouchableOpacity>
            {/* [VOICE_ALARM] 보류된 기능 — 상용에서는 보이지 않는다 */}
            {showVoice && voiceAlarmSupported() && (
              <TouchableOpacity
                style={[s.chip, voice && s.chipOn]}
                onPress={() => setVoice((v) => !v)}
                accessibilityState={{ selected: voice }}
                accessibilityLabel={t('알람 소리 내 목소리')}
              >
                <Text style={[s.chipText, voice && s.chipTextOn]}>{t('🎙 내 목소리')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[s.summary, none && s.summaryWarn]}>{summary}</Text>
        </ScrollView>
        <View style={s.btnRow}>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose} accessibilityRole="button">
            <Text style={s.cancelBtnText}>{t('취소')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.saveBtn} onPress={save} accessibilityRole="button" testID="remind-save">
            <Text style={s.saveBtnText}>{t('저장')}</Text>
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
    paddingHorizontal: 20, paddingTop: 10, maxHeight: '75%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 14 },
  title: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  scroll: { flexGrow: 0 },
  groupLabel: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.textSub, fontSize: 15, fontWeight: '700' },
  chipTextOn: { color: C.onAccent },
  summary: { color: C.textSub, fontSize: 13, marginTop: 12, lineHeight: 18 },
  summaryWarn: { color: C.red, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: C.textSub, fontSize: 16, fontWeight: '700' },
  saveBtn: { flex: 2, minHeight: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: C.onAccent, fontSize: 17, fontWeight: '800' },
});
