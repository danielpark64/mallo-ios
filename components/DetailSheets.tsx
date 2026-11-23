// ─── 일정 화면(ScheduleDetail)의 팝업들 ──────────────────────────────────────────
// 날짜·시간 / 알림 / 내용 고치기 / 내보내기 / 미루기 설명 / 결과 / 첨부 붙이기.
// 모두 일정 화면 창 안에 겹쳐 띄운다(창을 또 열지 않는다 — iOS는 창이 닫히는 중에 다른 창을 못 띄우고,
// Android 뒤로가기는 일정 화면이 받아 팝업부터 닫는다). 열려 있을 때만 그려지고, 닫으면 상태도 버린다.
// [완료]는 바로 저장한다(저장·알람 다시 걸기는 부모 → App.saveEditor → lib/notifications.ts).
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { MicIcon } from './MicIcon';
import { Waveform, formatDuration } from './Waveform';
import { AlarmFields, DateTimeFields, minuteItemsWith, validEnd, type AlarmMode } from './ScheduleFields';
import type { AppendResult, EditorResult } from './ScheduleEditor';
import { useFontScale, useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { normalizeRemind } from '../lib/reminders';
import { voiceAlarmOn, voiceAlarmSupported } from '../lib/voiceAlarm';
import { SOUND_LABEL, getDefaultAlarmSound, isSoundId, recordSoundChoices } from '../lib/alarmSounds';
import { SoundList, type SoundChoice } from './SoundPicker';
import { useSharedPlayer } from '../lib/sharedPlayer';
import { useVoiceRecorder } from '../lib/useVoiceRecorder';
import { NO_FILE_NOTICE } from '../lib/voiceCapture';
import { notifyAudioLost } from '../lib/audioLostNotice';
import { sttBlockedNotice } from '../lib/sttErrors';
import { OUTCOME_BUTTON, OUTCOME_KINDS } from '../lib/outcome';
import type { OutcomeKind, ScheduleRecord } from '../lib/storage';

/** 저장했으면 true, 겹치는 일정 확인 등에서 취소했으면 false(팝업을 그대로 둔다) */
export type SheetSave = (res: EditorResult) => Promise<boolean> | boolean;

// ── 공통 틀: 어두운 배경 + 아래에서 올라온 판. 위 줄 [취소] 제목 [완료] ─────────────────
export function Popup({
  title, onCancel, onDone, cancelLabel = '취소', children, testID, tall = false, center = false,
}: {
  title: string;
  onCancel: () => void;
  /** 없으면 [완료] 자리가 비고, [취소] 대신 cancelLabel(닫기 등) */
  onDone?: () => void;
  cancelLabel?: string;
  children: ReactNode;
  testID: string;
  /** 화면 대부분 높이(내용 고치기) */
  tall?: boolean;
  /** 가운데 작은 설명 상자(미루기란?) */
  center?: boolean;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  // 아래 시스템 막대(제스처 줄)에 마지막 줄이 가리지 않게
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={StyleSheet.absoluteFill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      testID={`${testID}-wrap`}
    >
      <View style={[s.dim, center && s.dimCenter]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} accessibilityLabel={t('닫기')} testID={`${testID}-backdrop`} />
        <View style={[center ? s.card : s.sheet, tall && s.tall, !center && { paddingBottom: 16 + insets.bottom }]} testID={testID} accessibilityViewIsModal>
          <View style={s.head}>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" testID={`${testID}-cancel`}>
              <Text style={s.headBtn}>{t(cancelLabel)}</Text>
            </TouchableOpacity>
            <Text style={s.title} numberOfLines={2} accessibilityRole="header">{title}</Text>
            {onDone ? (
              <TouchableOpacity onPress={onDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" testID={`${testID}-done`}>
                <Text style={[s.headBtn, s.doneBtn]}>{t('완료')}</Text>
              </TouchableOpacity>
            ) : <View style={s.headSpacer} />}
          </View>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={tall ? { flexGrow: 1, paddingBottom: 8 } : { paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const endOf = (r: ScheduleRecord) => (r.endAt != null ? new Date(r.endAt) : null);

/** 날짜·시간을 그대로 두고 내용·알림만 바꾸는 저장 값 */
function keepWhenResult(r: ScheduleRecord): EditorResult {
  return {
    id: r.id,
    content: r.content || r.transcript || '',
    date: new Date(r.scheduleAt ?? Date.now()),
    hasTime: r.hasTime,
    endDate: endOf(r),
    alarmMode: (r.alarmMode as AlarmMode) ?? 'both',
    remindBefore: normalizeRemind(r.remindBefore ?? []),
    exactAlarm: r.exactAlarm !== false,
    voiceAlarm: voiceAlarmOn(r) && !!r.uri,
    needsDate: !!r.needsDate,
    keepWhen: true,
  };
}

// ── 날짜·시간 ─────────────────────────────────────────────────────────────────
export function DateSheet({ record, markedDays, defaultRemind, onCancel, onSave, onSaved }: {
  record: ScheduleRecord;
  markedDays: Set<string>;
  /** 날짜를 안 정한 녹음을 정할 때 붙일 기본 미리 알림 */
  defaultRemind?: number[];
  onCancel: () => void;
  onSave: SheetSave;
  onSaved: () => void;
}) {
  const { t } = useT();
  // 처음 값: 편집기와 같다. 날짜를 안 정한 녹음은 녹음 시각(지난 시각) 대신 오늘의 다음 정시
  const init = useMemo(() => {
    if (record.needsDate || record.scheduleAt == null) {
      const next = new Date();
      next.setHours(next.getHours() + 1, 0, 0, 0);
      return { date: next, hour: next.getHours(), minute: 0, extra: null as number | null };
    }
    const d = new Date(record.scheduleAt);
    // 시간 미정 일정은 저장 시각(0시)이 아니라 9시를 기본으로 (자정 알람 방지)
    return { date: d, hour: record.hasTime ? d.getHours() : 9, minute: record.hasTime ? d.getMinutes() : 0, extra: record.hasTime ? d.getMinutes() : null };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [date, setDate] = useState(init.date);
  const [hour, setHour] = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const [endDate, setEndDate] = useState<Date | null>(record.needsDate ? null : endOf(record));
  const touchedRef = useRef(false);
  const savingRef = useRef(false);
  const minuteItems = useMemo(() => minuteItemsWith(init.extra), [init.extra]);

  // 시작일을 끝나는 날 뒤로 옮기면 기간을 지운다
  useEffect(() => { if (endDate && !validEnd(date, endDate)) setEndDate(null); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (d: Date) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const remind = record.needsDate && !(record.remindBefore ?? []).length ? (defaultRemind ?? []) : (record.remindBefore ?? []);
      const ok = await onSave({
        ...keepWhenResult(record),
        date: d,
        hasTime: true,
        endDate: validEnd(d, endDate),
        remindBefore: normalizeRemind(remind),
        needsDate: false, // 날짜를 정했으니 꼬리표를 푼다
        keepWhen: false,
      });
      if (ok) onSaved();
    } finally {
      savingRef.current = false;
    }
  };

  const done = () => {
    // 아무것도 안 바꿨으면 저장하지 않는다(날짜를 안 정한 녹음은 [완료]가 곧 "정하기")
    if (!touchedRef.current && !record.needsDate) { onCancel(); return; }
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= Date.now()) {
      Alert.alert(t('지난 시각이에요'), t('이 시각은 이미 지나서 알람이 울리지 않아요. 그대로 저장할까요?'), [
        { text: t('취소'), style: 'cancel' },
        { text: t('그대로 저장'), onPress: () => { submit(d); } },
      ]);
      return;
    }
    submit(d);
  };

  return (
    <Popup title={t('날짜·시간')} onCancel={onCancel} onDone={done} testID="sheet-date">
      <DateTimeFields
        date={date}
        onDate={setDate}
        hour={hour}
        onHour={setHour}
        minute={minute}
        onMinute={setMinute}
        minuteItems={minuteItems}
        endDate={endDate}
        onEndDate={setEndDate}
        markedDays={markedDays}
        onTouched={() => { touchedRef.current = true; }}
      />
    </Popup>
  );
}

// ── 알림: 소리·진동 + 미리 알림 + 정각 ─────────────────────────────────────────────
export function AlarmSheet({ record, onCancel, onSave, onSaved }: {
  record: ScheduleRecord;
  onCancel: () => void;
  onSave: SheetSave;
  onSaved: () => void;
}) {
  const { t } = useT();
  const base = useMemo(() => keepWhenResult(record), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<AlarmMode>(base.alarmMode);
  const [remind, setRemind] = useState<number[]>(base.remindBefore);
  const [exact, setExact] = useState(base.exactAlarm);
  const [voice, setVoice] = useState(voiceAlarmOn(record));
  // 알람 소리: 'follow' = 설정의 기본 소리를 따름(record.alarmSound 없음)
  const defSound = getDefaultAlarmSound();
  const initSound: SoundChoice = isSoundId(record.alarmSound) ? record.alarmSound : 'follow';
  const [sound, setSound] = useState<SoundChoice>(initSound);
  const [picking, setPicking] = useState<SoundChoice | null>(null); // 소리 고르기 팝업이 열려 있으면 그 안에서 고르는 값
  const soundChoices = useMemo<SoundChoice[]>(() => {
    const list: SoundChoice[] = ['follow', ...recordSoundChoices(defSound)];
    if (initSound !== 'follow' && !list.includes(initSound)) list.splice(1, 0, initSound);
    return list;
  }, [defSound, initSound]);
  const savingRef = useRef(false);
  const toggle = (m: number) => setRemind((cur) => normalizeRemind(cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  // [VOICE_ALARM] 보류된 기능 — 상용에서는 칩이 보이지 않는다
  const showVoice = voiceAlarmSupported() && !!record.uri && mode !== 'vibe';

  const done = async () => {
    const same = mode === base.alarmMode && exact === base.exactAlarm && voice === voiceAlarmOn(record)
      && remind.join(',') === base.remindBefore.join(',') && sound === initSound;
    if (same) { onCancel(); return; }
    if (savingRef.current) return; // 연타로 알람이 두 번 걸리지 않게
    savingRef.current = true;
    try {
      const ok = await onSave({
        ...base, alarmMode: mode, remindBefore: normalizeRemind(remind), exactAlarm: exact, voiceAlarm: voice && !!record.uri,
        alarmSound: sound === 'follow' ? null : sound, // null = 설정 기본을 따르게
      });
      if (ok) onSaved();
    } finally {
      savingRef.current = false;
    }
  };

  if (picking != null) {
    // 소리 고르기 팝업 — [완료]는 알림 팝업으로 돌아갈 뿐, 저장은 알림 팝업의 [완료]에서 함께 한다
    return (
      <Popup title={t('알람 소리')} onCancel={() => setPicking(null)} onDone={() => { setSound(picking); setPicking(null); }} testID="sheet-sound">
        <SoundList choices={soundChoices} value={picking} onChange={setPicking} followSound={defSound} />
      </Popup>
    );
  }

  const soundLabel = sound === 'follow' ? `${t('기본')} (${t(SOUND_LABEL[defSound])})` : t(SOUND_LABEL[sound]);
  return (
    <Popup title={t('알림')} onCancel={onCancel} onDone={done} testID="sheet-alarm">
      <AlarmFields
        mode={{ value: mode, onChange: setMode }}
        sound={{ label: soundLabel, disabled: mode === 'vibe', onPress: () => setPicking(sound) }}
        remindBefore={remind}
        onToggleRemind={toggle}
        exactAlarm={exact}
        onExact={setExact}
        voice={showVoice ? { value: voice, onChange: setVoice } : null}
        noneText="알림 없음 — 울리지 않아요"
      />
    </Popup>
  );
}

// ── 내용 고치기 + 말로 덧붙이기 ─────────────────────────────────────────────────
// 메인 내용은 글자로 고치고, 마이크는 원래 녹음을 바꾸지 않고 녹음과 함께 새 항목으로 덧붙인다([완료]에 함께 저장).
export function ContentSheet({ record, onCancel, onSave, onSaved, cancelRef }: {
  record: ScheduleRecord;
  onCancel: () => void;
  onSave: SheetSave;
  onSaved: () => void;
  /** 뒤로가기도 같은 "버릴까요?" 확인을 거치게 — 일정 화면이 이 함수를 부른다 */
  cancelRef?: MutableRefObject<(() => void) | null>;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const { scale } = useFontScale();
  const original = record.content || record.transcript || '';
  const [content, setContent] = useState(original);
  const voice = useVoiceRecorder();
  const player = useSharedPlayer();
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  recordingRef.current = recording;
  const [capture, setCapture] = useState<AppendResult | null>(null);
  const [extraText, setExtraText] = useState('');
  const busyRef = useRef(false); // 시작·정지 처리 중 연타 방지
  const confirmRedoRef = useRef(false);
  const savingRef = useRef(false);

  // 팝업이 닫히면(뒤로가기 포함) 진행 중인 녹음을 버린다
  useEffect(() => () => { if (recordingRef.current) voice.cancel().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExtra = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (!recording) {
        if (capture && !confirmRedoRef.current) {
          // 이미 덧붙인 녹음이 있으면 바꿀지 먼저 묻는다
          busyRef.current = false;
          Alert.alert(t('다시 녹음할까요?'), t('앞에서 한 녹음과 그 글이 새 녹음으로 바뀌어요.'), [
            { text: t('취소'), style: 'cancel' },
            { text: t('다시 녹음'), onPress: () => { confirmRedoRef.current = true; toggleExtra().finally(() => { confirmRedoRef.current = false; }); } },
          ]);
          return;
        }
        Keyboard.dismiss();
        player.stop(); // 듣던 녹음이 섞이지 않게
        setRecording(true);
        try { await voice.start(); } catch { setRecording(false); }
        return;
      }
      const res = await voice.stop();
      setRecording(false);
      if (res.audioLost && res.transcript) notifyAudioLost();
      if (res.transcript) {
        // 한 번에 녹음은 하나만 덧붙인다 — 다시 하면 새 녹음으로 바꾼다
        setCapture({
          content: res.transcript, transcript: res.transcript, uri: res.uri ?? '',
          durationSec: res.durationSec, segments: res.segments.length ? res.segments : undefined,
        });
        setExtraText(res.transcript);
      }
    } catch {
      try { await voice.cancel(); } catch {}
      setRecording(false);
    } finally {
      busyRef.current = false;
    }
  };
  const discardExtra = () => { setCapture(null); setExtraText(''); };

  // 고친 게 있으면 닫기 전에 묻는다(배경 누르기·취소·뒤로가기) — 키보드를 내리려다 고친 글을 잃지 않게
  const dirty = recording || content.trim() !== original.trim() || !!extraText.trim() || !!capture;
  const askCancel = () => {
    if (!dirty) { onCancel(); return; }
    Keyboard.dismiss();
    Alert.alert(t('고친 내용을 버릴까요?'), t('저장하지 않고 닫으면 고친 글과 덧붙인 녹음이 사라져요.'), [
      { text: t('계속 고치기'), style: 'cancel' },
      { text: t('버리기'), style: 'destructive', onPress: onCancel },
    ]);
  };
  if (cancelRef) cancelRef.current = askCancel;
  useEffect(() => () => { if (cancelRef) cancelRef.current = null; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = async () => {
    if (recording) {
      Alert.alert(t('녹음 중이에요'), t('마이크를 다시 눌러 녹음을 마친 뒤 저장해주세요.'));
      return;
    }
    if (!content.trim()) { Alert.alert(t('내용을 입력해주세요')); return; }
    const extra = extraText.trim();
    if (content.trim() === original.trim() && !extra) { onCancel(); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const ok = await onSave({
        ...keepWhenResult(record),
        content: content.trim(),
        append: extra
          ? {
              content: extra,
              transcript: capture?.transcript ?? extra,
              uri: capture?.uri ?? '',
              durationSec: capture?.durationSec ?? 0,
              segments: capture && extra === capture.transcript.trim() ? capture.segments : undefined,
            }
          : undefined,
      });
      if (ok) onSaved();
    } finally {
      savingRef.current = false;
    }
  };

  const minH = Math.round(6 * 24 * scale + 28); // 최소 6줄 — 여러 줄 내용이 한눈에

  return (
    <Popup title={t('내용 고치기')} onCancel={askCancel} onDone={done} testID="sheet-content" tall>
      <TextInput
        style={[s.input, { fontSize: 17 * scale, lineHeight: 24 * scale, minHeight: minH }]}
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
        placeholder={t('할 일을 입력하세요')}
        placeholderTextColor={C.textDim}
        testID="content-input"
      />
      <TouchableOpacity
        style={[s.voiceBar, recording && s.voiceBarOn]}
        onPress={toggleExtra}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t(recording ? '완료' : '＋ 말로 덧붙이기')}
        testID="content-mic"
      >
        {recording ? (
          <>
            <View style={s.voiceBarWave}>
              <Waveform compact metering={voice.recorderState.metering} isRecording={voice.recorderState.isRecording} />
            </View>
            <Text style={s.voiceBarStop}>{t('■ 완료')}</Text>
          </>
        ) : (
          <>
            <MicIcon size={20} color={C.onAccent} />
            <Text style={s.voiceBarText}>{t('＋ 말로 덧붙이기')}</Text>
          </>
        )}
      </TouchableOpacity>
      {recording ? (
        <Text style={s.recHint} accessibilityLiveRegion="polite">
          {voice.listening
            ? `${t('🎙 지금 말씀하세요')} · ${formatDuration(Math.floor((voice.recorderState.durationMillis ?? 0) / 1000))}`
            : voice.sttBlocked ? t(sttBlockedNotice(Platform.OS)) : t('준비 중…')}
        </Text>
      ) : null}
      {recording || extraText || capture ? (
        <View style={s.extraBox}>
          <View style={s.extraHead}>
            <Text style={s.extraLabel}>{t('덧붙일 내용 · 완료하면 추가돼요')}</Text>
            {!recording && (
              <TouchableOpacity onPress={discardExtra} accessibilityRole="button" accessibilityLabel={t('덧붙일 내용 지우기')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.extraClose}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={[s.extraInput, { fontSize: 16 * scale, lineHeight: 22 * scale }]}
            value={recording ? voice.liveText : extraText}
            editable={!recording}
            onChangeText={setExtraText}
            placeholder={t('말씀하시면 여기에 바로 적혀요')}
            placeholderTextColor={C.textDim}
            multiline
            testID="content-extra"
          />
          {capture && !capture.uri && !recording ? <Text style={s.hint}>{t(NO_FILE_NOTICE)}</Text> : null}
        </View>
      ) : null}
      <Text style={s.hint}>{t('녹음 듣기는 일정 화면에서 그대로 돼요')}</Text>
    </Popup>
  );
}

// ── 내보내기: 복사 · 텍스트 · PDF ──────────────────────────────────────────────
export function ExportSheet({ onClose, onCopy, onPreview }: {
  onClose: () => void;
  onCopy: () => void;
  onPreview: (kind: 'txt' | 'pdf') => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  return (
    <Popup title={t('내보내기')} onCancel={onClose} cancelLabel="닫기" testID="sheet-export">
      <View style={s.btnCol}>
        <TouchableOpacity style={s.bigBtn} onPress={() => { onClose(); onCopy(); }} accessibilityRole="button" testID="export-copy">
          <Text style={s.bigBtnText}>{t('복사')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bigBtn} onPress={() => { onClose(); onPreview('txt'); }} accessibilityRole="button" testID="export-txt">
          <Text style={s.bigBtnText}>{t('텍스트')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bigBtn} onPress={() => { onClose(); onPreview('pdf'); }} accessibilityRole="button" testID="export-pdf">
          <Text style={s.bigBtnText}>PDF</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.hint}>{t('텍스트와 PDF는 먼저 미리보기를 보여 줘요')}</Text>
    </Popup>
  );
}

// ── 미루기란? ────────────────────────────────────────────────────────────────
export function PostponeHelp({ onClose }: { onClose: () => void }) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  return (
    <Popup title={t('미루기란?')} onCancel={onClose} cancelLabel="닫기" testID="sheet-postpone" center>
      <Text style={s.body}>{t('일정이 다른 날로 바뀌었을 때 누르세요. 새 날짜로 일정을 다시 만들고 알람도 그쪽에 걸어요. 이 일정은 알람이 꺼진 채 "바뀜 → 새 날짜"로 남아요.')}</Text>
      <TouchableOpacity style={[s.bigBtn, s.okBtn]} onPress={onClose} accessibilityRole="button" testID="postpone-ok">
        <Text style={[s.bigBtnText, { color: C.onAccent }]}>{t('알겠어요')}</Text>
      </TouchableOpacity>
    </Popup>
  );
}

// ── 지난 일정의 결과: 못 했어요 · 덜 했어요 · 바뀌었어요 ─────────────────────────────
export function OutcomeSheet({ current, onPick, onClose }: {
  current?: OutcomeKind;
  onPick: (k: OutcomeKind) => void;
  onClose: () => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  return (
    <Popup title={t('어떻게 됐나요?')} onCancel={onClose} cancelLabel="닫기" testID="sheet-outcome">
      <Text style={s.hint}>{t('했으면 그대로 두세요')}</Text>
      <View style={s.chipRow}>
        {OUTCOME_KINDS.map((k) => {
          const on = current === k;
          return (
            <TouchableOpacity
              key={k}
              style={[s.chip, on && s.chipOn]}
              onPress={() => { onClose(); onPick(k); }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              testID={`outcome-${k}`}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>{t(OUTCOME_BUTTON[k])}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {current ? <Text style={s.hint}>{t('같은 버튼을 다시 누르면 표시가 풀려요')}</Text> : null}
    </Popup>
  );
}

// ── 첨부 붙이기: ＋ 사진 · ＋ 파일 · 📋 붙여넣기 ──────────────────────────────────
export function AttachSheet({ busy, onPick, onClose }: {
  busy: boolean;
  onPick: (what: 'photo' | 'file' | 'paste') => void;
  onClose: () => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  return (
    <Popup title={t('사진·파일 붙이기')} onCancel={onClose} cancelLabel="닫기" testID="sheet-attach">
      <View style={s.btnCol}>
        <TouchableOpacity style={s.bigBtn} disabled={busy} onPress={() => onPick('photo')} accessibilityRole="button" testID="attach-photo">
          <Text style={s.bigBtnText}>{t('＋ 사진')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bigBtn} disabled={busy} onPress={() => onPick('file')} accessibilityRole="button" testID="attach-file">
          <Text style={s.bigBtnText}>{t('＋ 파일')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bigBtn} disabled={busy} onPress={() => onPick('paste')} accessibilityRole="button" testID="attach-paste">
          <Text style={s.bigBtnText}>{t('📋 붙여넣기')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.hint}>{t('원본은 복사하지 않아요. 길게 누르면 뺄 수 있어요.')}</Text>
    </Popup>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  dimCenter: { justifyContent: 'center', padding: 24 },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, maxHeight: '90%',
  },
  tall: { height: '92%', maxHeight: '92%' },
  card: { backgroundColor: C.bg, borderRadius: 18, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, maxHeight: '85%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, minHeight: 36 },
  headBtn: { color: C.textSub, fontSize: 16, fontWeight: '700' },
  doneBtn: { color: C.accent, fontWeight: '800' },
  headSpacer: { width: 40 },
  title: { flex: 1, textAlign: 'center', color: C.text, fontSize: 17, fontWeight: '800' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  input: {
    flexGrow: 1,
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, color: C.text,
  },
  voiceBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 50, borderRadius: 14, marginTop: 10, paddingHorizontal: 16, backgroundColor: C.red,
  },
  voiceBarOn: { backgroundColor: C.surface, borderWidth: 2, borderColor: C.red, justifyContent: 'space-between' },
  voiceBarText: { color: C.onAccent, fontSize: 16, fontWeight: '800' },
  voiceBarWave: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  voiceBarStop: { color: C.red, fontSize: 16, fontWeight: '800', marginLeft: 8 },
  recHint: { color: C.red, fontSize: 13, fontWeight: '700', marginTop: 8 },
  extraBox: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.accent, backgroundColor: C.surface },
  extraHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  extraLabel: { color: C.accent, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  extraClose: { color: C.textSub, fontSize: 16, fontWeight: '700' },
  extraInput: { color: C.text, maxHeight: 160, padding: 0 },
  hint: { color: C.textSub, fontSize: 12, marginTop: 10, lineHeight: 17 },
  body: { color: C.text, fontSize: 15, lineHeight: 22 },
  btnCol: { gap: 10 },
  bigBtn: {
    minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10,
  },
  bigBtnText: { color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  okBtn: { marginTop: 16, backgroundColor: C.accent, borderColor: C.accent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, minHeight: 42, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipOn: { borderColor: C.red, backgroundColor: C.red },
  chipText: { color: C.text, fontSize: 15, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
});
