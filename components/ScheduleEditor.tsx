import { useEffect, useRef, useState, useMemo } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { sttBlockedNotice } from '../lib/sttErrors';
import { Text } from './AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Waveform, formatDuration } from './Waveform';
import { useSharedPlayer } from '../lib/sharedPlayer';
import { voiceAlarmOn, voiceAlarmSupported } from '../lib/voiceAlarm';
import { MicIcon } from './MicIcon';
import { formatDayHeader } from '../lib/dateUtils';
import { useFontScale, useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { normalizeRemind } from '../lib/reminders';
import type { Attachment, ScheduleRecord, TranscriptSegment } from '../lib/storage';
import { holdClipRefs, ocrSupported, pickAttachments, recognizeText, saveClipboardImage } from '../lib/attachments';
import { makeLinkAttachment, makeTextAttachment, readClipboard } from '../lib/clipImport';
import { buildImportPreview, type ImportPreview } from '../lib/textImport';
import { useVoiceRecorder } from '../lib/useVoiceRecorder';
import { NO_FILE_NOTICE } from '../lib/voiceCapture';
import { notifyAudioLost } from '../lib/audioLostNotice';
import { AlarmFields, DateTimeFields, minuteItemsWith, validEnd, type AlarmMode } from './ScheduleFields';

export type { AlarmMode };

export type EditorResult = {
  id?: string;
  content: string;
  date: Date;
  hasTime: boolean;
  /** 기간 일정(휴가 등)의 끝나는 날. 없으면 하루짜리 */
  endDate?: Date | null;
  alarmMode: AlarmMode;
  remindBefore: number[];
  exactAlarm: boolean;
  /** 알람을 이 일정의 녹음 앞부분으로 (녹음이 없으면 저장 때 무시된다) */
  voiceAlarm?: boolean;
  /** 알람 소리(lib/alarmSounds.ts SoundId). undefined = 바꾸지 않음(새 일정이면 설정 기본), null = 설정 기본을 따르게 되돌림 */
  alarmSound?: string | null;
  /** 기존 일정 수정 화면에서 말로 덧붙인 내용(저장 때 추가 항목으로 함께 저장) */
  append?: AppendResult;
  /** 새 일정 화면의 마이크로 말한 녹음 — 메인 녹음으로 저장된다 (내용을 고쳤으면 segments 없이) */
  capture?: { uri: string; durationSec: number; transcript: string; segments?: TranscriptSegment[] };
  /** 붙여넣기·사진에서 만든 새 일정에 함께 붙일 것(원문 메모·사진) */
  attachments?: Attachment[];
  /** 새 일정: 붙인 글에서 날짜를 못 찾아 날짜 미정으로 저장(알람 없음, "정하기" 꼬리표). date는 무시된다.
   *  있는 일정: 날짜를 아직 안 정한 채 내용·알림만 고쳤다(꼬리표를 남기고 알람은 걸지 않는다) */
  needsDate?: boolean;
  /** 있는 일정: 날짜·시간·기간을 이 저장에서 바꾸지 않았다(표시 문구를 그대로 둔다) */
  keepWhen?: boolean;
};

/** 새 일정 화면을 열자마자 이 사진의 글자를 읽어 미리보기를 띄운다(상세의 사진 보기에서) */
export type ImportSeed = { photo: Attachment; nonce: number };

/** 새 일정 화면에 미리 채워 둘 값 (lib/outcome.ts의 다시 잡기) */
export type EditorPrefill = {
  content: string;
  hour: number;
  minute: number;
  alarmMode: AlarmMode;
  remindBefore: number[];
  exactAlarm: boolean;
  /** 원래 일정에서 따로 고른 알람 소리(없으면 설정 기본) */
  alarmSound?: string;
};

/** "추가" 저장 결과 — 메인과 동등하게 자기 녹음·전사·구간재생을 갖는 독립 엔트리 */
export type AppendResult = {
  content: string;
  transcript: string;
  uri: string;
  durationSec: number;
  segments?: TranscriptSegment[];
};

// ─── 새 일정·내용 추가 화면 (전체화면) ─────────────────────────────────────────────
// 이미 있는 일정을 보고 고치는 일은 일정 화면(ScheduleDetail)의 팝업에서 한다(2026-11-22 한 화면으로 합침).
// 이 화면은 새 일정(record 없음)과 카드 "＋ 추가"(appendMode)만 맡는다.
export function ScheduleEditor({
  visible, record, defaultDate, markedDays, appendMode = false, defaultRemind, defaultVoice = false, prefill,
  importSeed, onSave, onAppend, onClose: onCloseProp, onDiscardImport,
}: {
  visible: boolean;
  /** 내용 추가(appendMode)할 일정. 새 일정이면 null */
  record: ScheduleRecord | null;
  defaultDate: Date;
  markedDays: Set<string>;
  appendMode?: boolean;
  /** 새 일정의 기본 미리 알림(설정값) */
  defaultRemind?: number[];
  /** 새 일정의 알람 소리 기본값(설정): true = 내 목소리 */
  defaultVoice?: boolean;
  /** 새 일정을 지난 일정에서 다시 잡을 때(바뀌었어요·덜 했어요): 내용·시각·알림을 원래 일정에서 채워 둔다. 날짜는 defaultDate */
  prefill?: EditorPrefill | null;
  /** 저장했으면 true(또는 void). 겹치는 일정 확인 등에서 취소했으면 false */
  onSave: (r: EditorResult) => void | boolean | Promise<void | boolean>;
  onAppend: (id: string, entry: AppendResult) => void;
  onClose: () => void;
  importSeed?: ImportSeed | null;
  /** 저장하지 않고 버린 붙여넣기 첨부 — 붙여넣은 이미지 파일 지우기·열람 권한 반납은 부모가(다른 일정이 쓰면 그대로) */
  onDiscardImport?: (atts: Attachment[]) => void;
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { scale: fontScale } = useFontScale();
  const { t, lang } = useT();
  const [content, setContent] = useState('');
  const [date, setDate]       = useState(new Date());
  const [hour, setHour]       = useState(9);   // 0~23
  const [minute, setMinute]   = useState(0);
  // 편집기를 열 때 받은 분이 5분 단위가 아니면(말로 "3시 37분") 그 값만 휠 목록에 끼워 둔다(열려 있는 동안 고정)
  const [extraMinute, setExtraMinute] = useState<number | null>(null);
  // 사용자가 날짜·시간을 직접 바꿨는지
  const timeTouchedRef = useRef(false);
  const [alarmMode, setAlarmMode] = useState<AlarmMode>('both');
  const [remindBefore, setRemindBefore] = useState<number[]>([]);
  const [exactAlarm, setExactAlarm] = useState(true);
  const [voiceAlarm, setVoiceAlarm] = useState(false);
  const toggleRemind = (m: number) =>
    setRemindBefore((cur) => normalizeRemind(cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  // 기간 일정: 끝나는 날(없으면 하루짜리)
  const [endDate, setEndDate]     = useState<Date | null>(null);
  // 화면을 다시 열 때 펼친 달력을 접는다
  const [openNonce, setOpenNonce] = useState(0);

  // ── 붙여넣기·사진에서 일정 만들기 ────────────────────────────────────────────
  // 미리보기(importPreview)를 띄우고, 저장하면 원문 메모·사진(importAtts)을 함께 붙인다
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importAtts, setImportAtts] = useState<Attachment[]>([]);
  const importAttsRef = useRef<Attachment[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const importBusyRef = useRef(false);
  // 저장 전 첨부는 남는 clip 정리에서 빠지도록 표시해 둔다
  const setPending = (a: Attachment[]) => { importAttsRef.current = a; setImportAtts(a); holdClipRefs(a.map((x) => x.ref)); };
  const discardImport = () => {
    const left = importAttsRef.current;
    setPending([]);
    setImportPreview(null);
    if (left.length) onDiscardImport?.(left);
  };
  // 닫을 때 저장하지 않은 붙여넣기 첨부는 버린다
  const onClose = () => { discardImport(); onCloseProp(); };

  // ── 녹음 — 메인과 동일하게 오디오+전사+구간타임스탬프를 실제로 캡처 ─────────
  const appendVoice = useVoiceRecorder();
  const player = useSharedPlayer();
  const [appendRecording, setAppendRecording] = useState(false);
  const [appendCapture, setAppendCapture] = useState<AppendResult | null>(null);

  // 키보드가 올라오면 날짜·시간·알림 칸을 접어 내용 칸이 키보드 위에 온전히 보이게 한다
  // (접지 않으면 내용 칸이 키보드 뒤로 밀려 쓰는 글이 안 보인다 — 2026-10-13 폰 사용 피드백)
  const [kbOpen, setKbOpen] = useState(false);
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEv, () => setKbOpen(true));
    const b = Keyboard.addListener(hideEv, () => setKbOpen(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  useEffect(() => { if (!visible) setKbOpen(false); }, [visible]);

  // 녹음 캡처(내용 추가·새 일정): 마이크를 누르면 실제 오디오 녹음 + STT를 동시에 캡처
  // 한 화면에서 녹음은 하나만 남는다(녹음 파일을 이어 붙일 수 없다). 다시 녹음하면 앞 녹음과 그 글을 새 것으로 바꾸고,
  // 새 녹음에서 아무 말도 못 알아들었으면 앞 녹음과 글을 그대로 되돌린다.
  const voiceBusyRef = useRef(false); // 시작·정지 처리 중 연타 방지
  const prevTakeRef = useRef<{ capture: AppendResult; content: string } | null>(null);

  const beginCapture = async () => {
    if (voiceBusyRef.current) return;
    voiceBusyRef.current = true;
    if (appendCapture) {
      prevTakeRef.current = { capture: appendCapture, content };
      // 앞 녹음이 적어 준 글을 빼고 새로 받는다 (직접 친 글은 남긴다)
      const i = content.lastIndexOf(appendCapture.transcript);
      if (i >= 0) setContent((content.slice(0, i) + content.slice(i + appendCapture.transcript.length)).replace(/\s+/g, ' ').trim());
      setAppendCapture(null);
    } else {
      prevTakeRef.current = null;
    }
    Keyboard.dismiss();
    player.stop(); // 카드 재생 소리가 녹음에 섞이지 않게
    setAppendRecording(true); // 파형·실시간 글이 바로 보이게 먼저 켠다
    try { await appendVoice.start(); }
    catch { setAppendRecording(false); restorePrevTake(); }
    finally { voiceBusyRef.current = false; }
  };

  const restorePrevTake = () => {
    const prev = prevTakeRef.current;
    prevTakeRef.current = null;
    if (!prev) return;
    setAppendCapture(prev.capture);
    setContent(prev.content);
  };

  const toggleAppendVoice = async () => {
    if (!appendRecording) {
      if (appendCapture) {
        Alert.alert(t('다시 녹음할까요?'), t('앞에서 한 녹음과 그 글이 새 녹음으로 바뀌어요.'), [
          { text: t('취소'), style: 'cancel' },
          { text: t('다시 녹음'), onPress: beginCapture },
        ]);
        return;
      }
      await beginCapture();
      return;
    }
    if (voiceBusyRef.current) return;
    voiceBusyRef.current = true;
    try {
      const res = await appendVoice.stop();
      if (res.audioLost && res.transcript) notifyAudioLost();
      if (res.transcript) {
        prevTakeRef.current = null;
        setAppendCapture({
          content: res.transcript,
          transcript: res.transcript,
          uri: res.uri ?? '', // Android 12 이하는 녹음 파일 없음 (lib/voiceCapture.ts)
          durationSec: res.durationSec,
          segments: res.segments.length ? res.segments : undefined,
        });
        setContent((c) => (c ? c.trimEnd() + ' ' + res.transcript : res.transcript));
      } else {
        restorePrevTake();
      }
    } catch {
      try { await appendVoice.cancel(); } catch {}
      restorePrevTake();
    } finally {
      setAppendRecording(false);
      voiceBusyRef.current = false;
    }
  };

  // 에디터 닫힐 때 녹음 정리
  useEffect(() => {
    if (!visible) {
      player.stop();
      if (appendRecording) { appendVoice.cancel(); setAppendRecording(false); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setOpenNonce((n) => n + 1);
    setImportPreview(null);
    setPending([]);
    setAppendCapture(null);
    timeTouchedRef.current = false;
    setExtraMinute(null);
    if (record) {
      // 내용 추가: 날짜·알림은 그대로, 내용 칸은 비워서 시작
      setContent(appendMode ? '' : (record.content || record.transcript || ''));
      const d = record.scheduleAt ? new Date(record.scheduleAt) : new Date(defaultDate);
      setDate(d);
      setHour(record.hasTime ? d.getHours() : 9);
      setMinute(record.hasTime ? d.getMinutes() : 0);
      setAlarmMode((record.alarmMode as AlarmMode) ?? 'both');
      setRemindBefore(normalizeRemind(record.remindBefore ?? []));
      setExactAlarm(record.exactAlarm !== false);
      setVoiceAlarm(voiceAlarmOn(record));
      setEndDate(null);
    } else if (prefill) {
      setContent(prefill.content);
      setDate(new Date(defaultDate));
      setHour(prefill.hour);
      setMinute(prefill.minute);
      setExtraMinute(prefill.minute % 5 ? prefill.minute : null);
      setAlarmMode(prefill.alarmMode);
      setRemindBefore(normalizeRemind(prefill.remindBefore));
      setExactAlarm(prefill.exactAlarm);
      setVoiceAlarm(false); // 다시 잡은 일정에는 녹음이 없다
      setEndDate(null);
    } else {
      setContent('');
      setDate(new Date(defaultDate));
      setHour(9);
      setMinute(0);
      setAlarmMode('both');
      setRemindBefore(normalizeRemind(defaultRemind ?? []));
      setExactAlarm(true);
      setVoiceAlarm(defaultVoice);
      setEndDate(null);
    }
  }, [visible, record, appendMode, prefill]);

  // 상세의 사진 보기에서 [📅 이 사진으로 일정 만들기]로 열렸으면 바로 글자를 읽는다
  useEffect(() => {
    if (!visible || !importSeed || record || appendMode) return;
    busyRun(() => runOcr(importSeed.photo));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, importSeed?.nonce]);

  // 시작일을 바꿨는데 끝나는 날보다 뒤면 기간을 지운다(거꾸로 된 기간 방지)
  useEffect(() => {
    if (endDate && !validEnd(date, endDate)) setEndDate(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const pastConfirmedRef = useRef(false);
  const handleSave = () => {
    if (appendRecording) {
      Alert.alert(t('녹음 중이에요'), t('마이크를 다시 눌러 녹음을 마친 뒤 저장해주세요.'));
      return;
    }
    if (!content.trim()) { Alert.alert(t('내용을 입력해주세요')); return; }
    if (appendMode && record) {
      // 녹음한 전사 그대로면 구간재생용 세그먼트를 함께 저장, 이후 텍스트를 고쳤다면
      // 오디오는 그대로 유지하되 세그먼트(단어별 타임스탬프)만 무효화
      const matchesRecording = appendCapture && content.trim() === appendCapture.transcript.trim();
      onAppend(record.id, {
        content: content.trim(),
        transcript: appendCapture?.transcript ?? content.trim(),
        uri: appendCapture?.uri ?? '',
        durationSec: appendCapture?.durationSec ?? 0,
        segments: matchesRecording ? appendCapture?.segments : undefined,
      });
      return;
    }
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= Date.now() && !pastConfirmedRef.current) {
      Alert.alert(t('지난 시각이에요'), t('이 시각은 이미 지나서 알람이 울리지 않아요. 그대로 저장할까요?'), [
        { text: t('취소'), style: 'cancel' },
        { text: t('그대로 저장'), onPress: () => { pastConfirmedRef.current = true; handleSave(); pastConfirmedRef.current = false; } },
      ]);
      return;
    }
    const matches = appendCapture && content.trim() === appendCapture.transcript.trim();
    onSave({
      content: content.trim(), date: d, hasTime: true, alarmMode, remindBefore, exactAlarm,
      endDate: validEnd(d, endDate),
      // 진동 전용이어도 선택은 남겨 둔다(울릴 때 voiceUriOf가 걸러 준다) — 소리 모드로 되돌리면 그대로 살아난다
      voiceAlarm: voiceAlarm && hasVoiceSource,
      // 알람 소리는 일정 화면의 알림 팝업에서 고른다 — 여기서는 다시 잡은 일정만 원래 일정의 소리를 이어받는다
      ...(!record && prefill?.alarmSound ? { alarmSound: prefill.alarmSound } : {}),
      capture: appendCapture
        ? { uri: appendCapture.uri, durationSec: appendCapture.durationSec, transcript: appendCapture.transcript, segments: matches ? appendCapture.segments : undefined }
        : undefined,
      // 붙여넣기·사진에서 미리보기를 [고쳐서 저장]했으면 원문 메모·사진을 함께
      attachments: importAttsRef.current.length ? importAttsRef.current : undefined,
    });
  };

  // ── 붙여넣기·사진에서 → 미리보기 → 저장 ──────────────────────────────────────
  const busyRun = async (fn: () => Promise<void>) => {
    if (importBusyRef.current) return;
    importBusyRef.current = true;
    setImportBusy(true);
    try { await fn(); }
    catch { Alert.alert(t('글자를 읽지 못했어요')); }
    finally { importBusyRef.current = false; setImportBusy(false); }
  };

  // 앞서 붙여 두고 저장하지 않은 것은 버리고 새것으로
  const showPreview = (text: string, atts: Attachment[]) => {
    const p = buildImportPreview(text);
    const old = importAttsRef.current.filter((a) => !atts.some((b) => b.ref === a.ref));
    if (old.length) onDiscardImport?.(old);
    if (!p) {
      setPending([]);
      if (atts.length) onDiscardImport?.(atts);
      Alert.alert(t('복사한 내용이 없어요'));
      return;
    }
    Keyboard.dismiss();
    setPending(atts);
    setImportPreview(p);
  };

  // 폰 안에서 글자 인식 → 미리보기. 실패하면 이 사진은 붙이지 않는다(다른 일정에 붙은 사진이면 부모가 그대로 둔다)
  const runOcr = async (photo: Attachment) => {
    const drop = () => onDiscardImport?.([photo]);
    if (!ocrSupported()) { drop(); Alert.alert(t('이 기기에서는 글자 인식을 쓸 수 없어요')); return; }
    const r = await recognizeText(photo, lang);
    if (r.status === 'ok') { showPreview(r.text, [photo]); return; }
    drop();
    if (r.status === 'notReady') Alert.alert(t('글자 인식 준비 중이에요. 잠시 뒤 다시 해 보세요'));
    else if (r.status === 'empty') Alert.alert(t('사진에서 글자를 찾지 못했어요'));
    else Alert.alert(t('글자를 읽지 못했어요'));
  };

  // [📋 붙여넣기] — 누를 때만 클립보드를 읽는다. 이미지면 그 이미지의 글자를 읽는다
  const pasteToNew = () => busyRun(async () => {
    const c = await readClipboard();
    if (c.kind === 'empty') { Alert.alert(t('복사한 내용이 없어요')); return; }
    if (c.kind === 'image') {
      const a = await saveClipboardImage();
      if (!a) { Alert.alert(t('첨부하지 못했어요')); return; }
      await runOcr(a);
      return;
    }
    if (c.kind === 'link') { showPreview(c.url, [makeLinkAttachment(c.url)]); return; }
    showPreview(c.text, [makeTextAttachment(c.text)]);
  });

  // [📷 사진에서] — 사진 하나를 골라 글자를 읽는다
  const photoToNew = () => busyRun(async () => {
    const r = await pickAttachments('photo', 1);
    if (r.denied) {
      Alert.alert(t('사진 접근 권한이 필요해요'), t('설정 › 세이람 › 사진에서 접근을 허용해 주세요. 사진은 복사하지 않고 위치만 저장해요.'));
      return;
    }
    const a = r.items.find((x) => x.kind === 'photo');
    if (!a) {
      if (r.hidden > 0 && Platform.OS === 'ios') Alert.alert(t('허용하지 않은 사진은 붙이지 못했어요'), t('설정 › 세이람 › 사진에서 그 사진도 허용해 주세요.'));
      if (r.items.length) onDiscardImport?.(r.items);
      return;
    }
    await runOcr(a);
  });

  // 미리보기 [저장] — 날짜를 찾았으면 그 날로(시간이 있으면 알람), 못 찾았으면 날짜 미정으로
  // 저장에 성공한 뒤에만 미리보기를 닫는다(겹치는 일정 확인에서 취소하면 그대로 남긴다)
  const finishImport = async (res: EditorResult) => { if ((await onSave(res)) !== false) setImportPreview(null); };
  const saveImport = (p: ImportPreview) => {
    const atts = importAttsRef.current;
    const rb = p.remindBefore ? normalizeRemind(p.remindBefore) : remindBefore;
    if (!p.date) {
      finishImport({ content: p.content, date: new Date(), hasTime: false, alarmMode, remindBefore: rb, exactAlarm, needsDate: true, attachments: atts });
      return;
    }
    const res: EditorResult = { content: p.content, date: p.date, hasTime: p.hasTime, endDate: p.endDate ?? null, alarmMode, remindBefore: rb, exactAlarm, attachments: atts };
    if (p.hasTime && p.date.getTime() <= Date.now()) {
      Alert.alert(t('지난 시각이에요'), t('이 시각은 이미 지나서 알람이 울리지 않아요. 그대로 저장할까요?'), [
        { text: t('취소'), style: 'cancel' },
        { text: t('그대로 저장'), onPress: () => finishImport(res) },
      ]);
      return;
    }
    finishImport(res);
  };
  // 미리보기 [고쳐서 저장] — 찾은 값을 칸에 채우고 이 화면에서 고친다(저장하면 원문 메모·사진도 함께)
  const editImport = (p: ImportPreview) => {
    setContent(p.content);
    if (p.date) {
      const d = p.date;
      setDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      if (p.hasTime) {
        setHour(d.getHours());
        setMinute(d.getMinutes());
        setExtraMinute(d.getMinutes() % 5 ? d.getMinutes() : null);
      }
      setEndDate(p.endDate ?? null);
      timeTouchedRef.current = true;
    }
    if (p.remindBefore) setRemindBefore(normalizeRemind(p.remindBefore));
    setImportPreview(null);
  };
  const cancelImport = () => discardImport();

  const minuteItems = useMemo(() => minuteItemsWith(extraMinute), [extraMinute]);

  const meridiem = t(hour < 12 ? '오전' : '오후');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const timeStr = `${h12}:${minute.toString().padStart(2, '0')}`;

  // [VOICE_ALARM] 보류된 기능 (lib/voiceAlarm.ts 스위치로 꺼짐)
  // 내 목소리 알람 칩: 방금 한 녹음이 있고, 소리가 나는 모드일 때만 보인다
  const hasVoiceSource = !!appendCapture?.uri;
  const showVoiceChip = !appendMode && voiceAlarmSupported() && hasVoiceSource && alarmMode !== 'vibe';
  const voiceActive = appendRecording;

  const navTitle = t(appendMode ? '내용 추가' : '새 일정');
  // 내용 칸은 글자 크기에 맞춰 최소 4줄 — 화면이 모자라면 칸을 줄이지 않고 화면 전체가 스크롤된다
  const inputMinHeight = Math.round(4 * 24 * fontScale + 28);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Modal은 별도 창이라 바깥 SafeAreaProvider의 인셋이 전달되지 않는다 → 안쪽에 따로 둔다
          (없으면 iOS에서 취소/저장 네비가 상태바 위로 올라감 — 2026-10-12 폰 확인) */}
      <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* 상단 네비게이션 */}
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={onClose}>
            <Text style={styles.navCancelText}>{t('취소')}</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>{navTitle}</Text>
          <View style={styles.navRight}>
            <TouchableOpacity style={styles.navBtn} onPress={handleSave}>
              <Text style={styles.navSaveText}>{t('저장')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {appendMode && !kbOpen ? (
          <>
            {/* 추가 모드: 기존 내용 잠금 표시 */}
            <View style={styles.appendInfoRow}>
              <Text style={styles.appendInfoText}>
                {record ? formatDayHeader(new Date(record.scheduleAt ?? Date.now())) : ''}
                {record?.hasTime && record.scheduleAt ? ` · ${meridiem} ${timeStr}` : ''}
              </Text>
            </View>
            <ScrollView style={styles.lockedBox} contentContainerStyle={{ padding: 14 }}>
              <Text style={styles.lockedText}>{record?.content || record?.transcript}</Text>
            </ScrollView>
          </>
        ) : null}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID="editor-scroll"
        >
          {!appendMode && !kbOpen && (
            <View style={styles.section}>
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
                onTouched={() => { timeTouchedRef.current = true; }}
                mode={{ value: alarmMode, onChange: setAlarmMode }}
                resetKey={openNonce}
              />
            </View>
          )}

          {!appendMode && !kbOpen && (
            <View style={styles.section}>
              <Text style={styles.label}>{t('알림')}</Text>
              <AlarmFields
                remindBefore={remindBefore}
                onToggleRemind={toggleRemind}
                exactAlarm={exactAlarm}
                onExact={setExactAlarm}
                voice={showVoiceChip ? { value: voiceAlarm, onChange: setVoiceAlarm } : null}
              />
            </View>
          )}

          {/* 내용 입력 — 남은 공간을 차지하되 최소 4줄 */}
          <View style={styles.contentArea}>
            <View style={styles.contentLabelRow}>
              <Text style={styles.label}>{t(appendMode ? '추가할 내용' : '내용')}</Text>
              {appendRecording && (
                <Text style={styles.sttHint} accessibilityLiveRegion="polite">
                  {appendVoice.listening
                    ? `${t('🎙 지금 말씀하세요')} · ${formatDuration(Math.floor((appendVoice.recorderState.durationMillis ?? 0) / 1000))}`
                    : appendVoice.sttBlocked ? t(sttBlockedNotice(Platform.OS)) : t('준비 중…')}
                </Text>
              )}
              {kbOpen && !appendRecording && (
                <TouchableOpacity style={styles.kbDoneBtn} onPress={() => Keyboard.dismiss()} accessibilityRole="button">
                  <Text style={styles.kbDoneText}>{t('입력 완료')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* 말하기 막대 — 누르기 전: 화면 폭 전체의 빨간 "눌러서 말하기" / 녹음 중: 같은 자리에 파형 + "■ 완료" */}
            {!(kbOpen && !voiceActive) && (
              <TouchableOpacity
                style={[styles.voiceBar, voiceActive && styles.voiceBarOn]}
                testID="editor-mic"
                accessibilityRole="button"
                accessibilityLabel={t(voiceActive ? '완료' : '눌러서 말하기')}
                onPress={toggleAppendVoice}
                activeOpacity={0.8}
              >
                {voiceActive ? (
                  <>
                    <View style={styles.voiceBarWave}>
                      <Waveform compact metering={appendVoice.recorderState.metering} isRecording={appendVoice.recorderState.isRecording} />
                    </View>
                    <Text style={styles.voiceBarStop}>{t('■ 완료')}</Text>
                  </>
                ) : (
                  <>
                    <MicIcon size={22} color={C.onAccent} />
                    <Text style={styles.voiceBarText}>{t('눌러서 말하기')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {/* 새 일정: 복사한 글·사진 속 글자로 만들기 */}
            {!record && !appendMode && !voiceActive && (
              <View style={styles.importRow}>
                <TouchableOpacity style={styles.importBtn} onPress={pasteToNew} disabled={importBusy} accessibilityRole="button" testID="editor-paste">
                  <Text style={styles.importBtnText}>{t('📋 붙여넣기')}</Text>
                </TouchableOpacity>
                {ocrSupported() && (
                  <TouchableOpacity style={styles.importBtn} onPress={photoToNew} disabled={importBusy} accessibilityRole="button" testID="editor-photo">
                    <Text style={styles.importBtnText}>{t('📷 사진에서')}</Text>
                  </TouchableOpacity>
                )}
                {importBusy ? (
                  <View style={styles.importBusy}>
                    <ActivityIndicator size="small" color={C.textSub} />
                    <Text style={styles.importHint}>{t('글자를 읽는 중…')}</Text>
                  </View>
                ) : importAtts.length > 0 && !importPreview ? (
                  <Text style={styles.importHint} numberOfLines={2}>
                    {importAtts.some((a) => a.kind === 'photo') ? t('사진을 일정에 함께 붙여요') : t('📎 원문 메모가 함께 저장돼요')}
                  </Text>
                ) : null}
              </View>
            )}
            {appendCapture?.uri && !appendRecording && (
              <Text style={styles.appendCaptureHint}>
                {t('녹음 저장됨 ({sec}초) · 내용을 고치면 구간재생은 빠지고 녹음은 그대로 남아요', { sec: appendCapture.durationSec })}
              </Text>
            )}
            {appendCapture && !appendCapture.uri && !appendRecording && (
              <Text style={styles.appendCaptureHint}>{t(NO_FILE_NOTICE)}</Text>
            )}
            <View style={styles.contentInputWrap}>
              <TextInput
                style={[styles.contentInput, { fontSize: 17 * fontScale, lineHeight: 24 * fontScale, minHeight: inputMinHeight }]}
                value={appendRecording && appendVoice.liveText
                  ? (content ? content.trimEnd() + ' ' : '') + appendVoice.liveText
                  : content}
                editable={!appendRecording}
                onChangeText={setContent}
                placeholder={t(appendRecording ? '말씀하시면 여기에 바로 적혀요' : appendMode ? '이어붙일 내용을 말하거나 입력하세요' : '할 일을 입력하세요')}
                placeholderTextColor={C.textDim}
                multiline
                textAlignVertical="top"
                testID="editor-content"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 붙여넣기·사진에서 미리보기 — 이 창 안에 띄운다(iOS는 창을 두 개 나란히 못 띄운다) */}
      {importPreview && (
        <View style={styles.importBg} testID="import-preview">
          <View style={styles.importCard}>
            <Text style={styles.importTitle}>{t('이 내용으로 저장할까요?')}</Text>
            <Text style={styles.label}>{t('날짜')}</Text>
            <Text style={styles.importWhen}>{importPreview.date ? importPreview.display : t('날짜 미정')}</Text>
            {!importPreview.date && (
              <Text style={styles.importHint}>{t('날짜를 못 찾았어요. 날짜 미정으로 저장하고 나중에 정할 수 있어요.')}</Text>
            )}
            <Text style={styles.label}>{t('내용')}</Text>
            <Text style={styles.importContent}>{importPreview.content}</Text>
            <Text style={styles.label}>{t('원문')}</Text>
            <ScrollView style={styles.importSource}>
              <Text style={styles.importSourceText}>{importPreview.source}</Text>
            </ScrollView>
            <Text style={styles.importHint}>
              {importAtts.some((a) => a.kind === 'photo') ? t('사진을 일정에 함께 붙여요') : t('원문은 메모로 함께 남겨요')}
            </Text>
            <View style={styles.importBtnRow}>
              <TouchableOpacity style={styles.importBtn} onPress={cancelImport} accessibilityRole="button">
                <Text style={styles.importBtnText}>{t('취소')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.importBtn} onPress={() => editImport(importPreview)} accessibilityRole="button" testID="import-edit">
                <Text style={styles.importBtnText}>{t('고쳐서 저장')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.importBtn, styles.importSave]} onPress={() => saveImport(importPreview)} accessibilityRole="button" testID="import-save">
                <Text style={[styles.importBtnText, { color: C.onAccent }]}>{t('저장')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}


const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  importRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  importBtn: {
    paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  importBtnText: { color: C.text, fontSize: 14, fontWeight: '700' },
  importBusy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  importHint: { color: C.textSub, fontSize: 12, marginTop: 4, flexShrink: 1 },
  importBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 18 },
  importCard: { backgroundColor: C.bg, borderRadius: 16, padding: 18, maxHeight: '88%' },
  importTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  importWhen: { color: C.text, fontSize: 18, fontWeight: '700' },
  importContent: { color: C.text, fontSize: 16 },
  importSource: { maxHeight: 130, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 10 },
  importSourceText: { color: C.textSub, fontSize: 13, lineHeight: 19 },
  importBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  importSave: { backgroundColor: C.accent, borderColor: C.accent },

  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: 52,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  navCancelText: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  navSaveText: { color: C.red, fontSize: 16, fontWeight: '700' },
  navTitle: { position: 'absolute', left: 60, right: 60, textAlign: 'center', color: C.text, fontSize: 16, fontWeight: '700' },
  navRight: { flexDirection: 'row', alignItems: 'center' },

  section: { paddingHorizontal: 20, paddingBottom: 8 },
  label: { color: C.accent, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },

  appendInfoRow: { paddingHorizontal: 20, paddingTop: 14 },
  appendInfoText: { color: C.textSub, fontSize: 13, fontWeight: '600' },
  lockedBox: {
    marginHorizontal: 20, marginTop: 8, maxHeight: 140, flexGrow: 0,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
  },
  lockedText: { color: C.textSub, fontSize: 15, lineHeight: 22 },

  // 남는 공간을 다 받되, 내용 칸 자체가 최소 4줄 높이를 지킨다(예전엔 남은 공간만 받아 한 줄로 찌그러졌다)
  contentArea: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },
  contentLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  sttHint: { color: C.red, fontSize: 13, fontWeight: '700', marginTop: 14, flexShrink: 1 },
  kbDoneBtn: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.accent },
  kbDoneText: { color: C.onAccent, fontSize: 13, fontWeight: '700' },
  appendCaptureHint: { color: C.accent, fontSize: 12, marginBottom: 8, lineHeight: 16 },
  contentInputWrap: { flex: 1 },
  contentInput: {
    flex: 1,
    backgroundColor: C.surface, borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    color: C.text, fontSize: 17, lineHeight: 24,
    borderWidth: 1, borderColor: C.border,
  },
  voiceBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 54, borderRadius: 16, marginBottom: 10, paddingHorizontal: 16,
    backgroundColor: C.red,
  },
  voiceBarOn: { backgroundColor: C.surface, borderWidth: 2, borderColor: C.red, justifyContent: 'space-between' },
  voiceBarText: { color: C.onAccent, fontSize: 17, fontWeight: '800' },
  voiceBarWave: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  voiceBarStop: { color: C.red, fontSize: 16, fontWeight: '800', marginLeft: 8 },
});
