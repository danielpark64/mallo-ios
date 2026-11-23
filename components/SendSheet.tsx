// ─── 일정 보내기 시트 ───────────────────────────────────────────────────────────
// 상세 화면의 [📤 일정 보내기]와 말로 보내기("…엄마한테 보내줘")가 같은 시트를 쓴다.
// 미리보기(내용·날짜시간·미리 알림) + 보내는 사람 이름(선택, 기억) → [카톡] / [문자] 중 사용자가 고른다.
// 보내기는 항상 사용자가 버튼으로 한다 — 이 시트는 카톡·문자 앱의 보내기 화면을 열 뿐 자동 발송하지 않는다.
// 보내는 것은 글만(lib/sendSchedule.ts). 목소리·사진·첨부는 보내지 않는다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { useT } from '../lib/i18n';
import { useTheme, type Palette } from '../lib/theme';
import { loadPrefs, savePrefs, type SendVia } from '../lib/prefs';
import { normalizeRemind, remindLabel } from '../lib/reminders';
import { buildShareLink, decodePayload, encodePayload, kakaoText, smsText, whenText } from '../lib/sendSchedule';
import { findPhoneByName, openKakao, openSms } from '../lib/sendActions';
import type { ScheduleRecord } from '../lib/storage';

export function SendSheet({
  visible,
  record,
  recipient,
  savedNote = false,
  onClose,
}: {
  visible: boolean;
  record: ScheduleRecord | null;
  /** 말로 보내기에서 말한 받는 사람("엄마") — 제목에 쓰고, 문자를 고르면 연락처에서 번호를 찾는다 */
  recipient?: string | null;
  /** 말로 보내기: "내 달력에도 저장했어요"를 보인다 */
  savedNote?: boolean;
  onClose: () => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [name, setName] = useState('');
  const [via, setVia] = useState<SendVia>('kakao');
  const busyRef = useRef(false);

  // 열릴 때마다 기억해 둔 이름·방식을 읽는다
  useEffect(() => {
    if (!visible) return;
    const p = loadPrefs();
    setName(p.sendName);
    setVia(p.sendVia);
    busyRef.current = false;
  }, [visible]);

  if (!record) return null;

  const remind = normalizeRemind(record.remindBefore ?? []);
  const exact = record.exactAlarm !== false;
  const remindLine = !record.hasTime
    ? null
    : remind.length
      ? t('미리 알림 {list} · 정각 알림 {state}', { list: remind.map((m) => t(remindLabel(m))).join(' · '), state: t(exact ? '켬' : '끔') })
      : exact ? t('미리 알림 없음 · 정각 알림 켬') : t('알림 없음');
  // 미리보기는 실제로 보낼 내용(잘린 내용 포함)으로 보여 준다
  const preview = (() => {
    const { payload } = buildShareLink(record, name);
    return decodePayload(encodePayload(payload));
  })();

  const send = async (how: SendVia) => {
    if (busyRef.current || !preview) return; // 연타로 두 번 열리지 않게
    busyRef.current = true;
    Keyboard.dismiss();
    const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 20);
    savePrefs({ sendName: trimmed, sendVia: how });
    const { link, payload } = buildShareLink(record, trimmed);
    const data = decodePayload(encodePayload(payload));
    if (!data) { busyRef.current = false; return; }
    try {
      if (how === 'kakao') await openKakao(kakaoText(data, link, t));
      else await openSms(smsText(data, link, t), recipient ? await findPhoneByName(recipient) : null);
    } finally {
      busyRef.current = false;
      onClose();
    }
  };

  const order: SendVia[] = via === 'sms' ? ['sms', 'kakao'] : ['kakao', 'sms'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel={t('닫기')} />
        <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal testID="send-sheet">
          <View style={s.handle} />
          <Text style={s.title} accessibilityRole="header">
            {recipient ? t('{name}에게 보낼까요?', { name: recipient }) : t('일정 보내기')}
          </Text>
          {savedNote ? <Text style={s.saved}>✓ {t('내 달력에도 저장했어요')}</Text> : null}
          <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
            {/* 미리보기 */}
            <View style={s.preview}>
              {recipient ? <Text style={s.previewSub}>{t('받는 사람: {name}', { name: recipient })}</Text> : null}
              <Text style={s.previewWhen}>{preview ? whenText(preview) : record.scheduleDisplay}</Text>
              <Text style={s.previewContent}>{preview?.content ?? record.content}</Text>
              {remindLine ? <Text style={s.previewSub}>{remindLine}</Text> : null}
            </View>
            <Text style={s.groupLabel}>{t('보내는 사람 이름 (선택)')}</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={(v) => setName(v.slice(0, 20))}
              placeholder={t('보내는 사람 이름 (선택)')}
              placeholderTextColor={C.textDim}
              maxLength={20}
              returnKeyType="done"
              testID="send-name"
            />
            <Text style={s.hint}>{t('받는 사람에게 보일 이름이에요. 한 번 적으면 기억해요')}</Text>
            <Text style={s.hint}>🔒 {t('녹음한 목소리는 보내지 않고 글로만 갑니다')}</Text>
          </ScrollView>
          {order.map((how, i) => (
            <TouchableOpacity
              key={how}
              style={[s.btn, i === 0 ? s.btnMain : s.btnSub]}
              onPress={() => send(how)}
              accessibilityRole="button"
              testID={`send-${how}`}
            >
              <Text style={[s.btnText, i === 0 ? s.btnTextMain : s.btnTextSub]}>
                {t(how === 'kakao' ? '💬 카톡으로 보내기' : '✉️ 문자로 보내기')}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={s.note}>{t('문자는 글이 길면 요금이 나올 수 있어요. 카톡은 무료예요')}</Text>
          <TouchableOpacity style={s.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={s.cancelText}>{t('취소')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10, maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 14 },
  title: { color: C.text, fontSize: 19, fontWeight: '800', marginBottom: 4 },
  saved: { color: C.accent, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  scroll: { flexGrow: 0 },
  preview: { marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, gap: 4 },
  previewWhen: { color: C.text, fontSize: 16, fontWeight: '800' },
  previewContent: { color: C.text, fontSize: 16, lineHeight: 23 },
  previewSub: { color: C.textSub, fontSize: 13 },
  groupLabel: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  input: {
    minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    paddingHorizontal: 14, color: C.text, fontSize: 16,
  },
  hint: { color: C.textSub, fontSize: 12, marginTop: 6, lineHeight: 17 },
  btn: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  btnMain: { backgroundColor: C.accent },
  btnSub: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.accent, marginTop: 10 },
  btnText: { fontSize: 17, fontWeight: '800' },
  btnTextMain: { color: C.onAccent },
  btnTextSub: { color: C.accent },
  note: { color: C.textDim, fontSize: 12, marginTop: 8, textAlign: 'center', lineHeight: 17 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelText: { color: C.textSub, fontSize: 15, fontWeight: '700' },
});
