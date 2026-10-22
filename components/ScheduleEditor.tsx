import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Alert, Animated, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { sttBlockedNotice } from '../lib/sttErrors';
import { Text } from './AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { Calendar } from './Calendar';
import { ScrollPicker } from './ScrollPicker';
import { Waveform, formatDuration } from './Waveform';
import { useSharedPlayer } from '../lib/sharedPlayer';
import { recordSpeechText } from '../lib/speech';
import { voiceAlarmOn, voiceAlarmSupported } from '../lib/voiceAlarm';
import { MicIcon } from './MicIcon';
import { formatDayHeader } from '../lib/dateUtils';
import { useFontScale, useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { REMIND_OPTIONS, normalizeRemind, remindLabel } from '../lib/reminders';
import { sttLang as sttLangFor } from '../lib/sttLang';
import type { ScheduleRecord, TranscriptSegment } from '../lib/storage';
import { useVoiceRecorder } from '../lib/useVoiceRecorder';
import { NO_FILE_NOTICE } from '../lib/voiceCapture';
import { notifyAudioLost } from '../lib/audioLostNotice';

export type AlarmMode = 'both' | 'sound' | 'vibe';

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
  /** 기존 일정 수정 화면에서 말로 덧붙인 내용(저장 때 추가 항목으로 함께 저장) */
  append?: AppendResult;
  /** 새 일정 화면의 마이크로 말한 녹음 — 메인 녹음으로 저장된다 (내용을 고쳤으면 segments 없이) */
  capture?: { uri: string; durationSec: number; transcript: string; segments?: TranscriptSegment[] };
};

/** 새 일정 화면에 미리 채워 둘 값 (lib/outcome.ts의 다시 잡기) */
export type EditorPrefill = {
  content: string;
  hour: number;
  minute: number;
  alarmMode: AlarmMode;
  remindBefore: number[];
  exactAlarm: boolean;
};

/** "추가" 저장 결과 — 메인과 동등하게 자기 녹음·전사·구간재생을 갖는 독립 엔트리 */
export type AppendResult = {
  content: string;
  transcript: string;
  uri: string;
  durationSec: number;
  segments?: TranscriptSegment[];
};

// ─── 무한궤도 스크롤 피커 ─────────────────────────────────────────────────────
// 항목 수가 적은 피커(시 등)도 양방향 스크롤 버퍼가 충분하도록
// midOffset(중앙까지의 행 수)이 대략 같아지게 loopCount를 동적으로 계산

const HOURS24     = Array.from({ length: 24 }, (_, i) => i); // 0~23
const MINUTES     = [0,5,10,15,20,25,30,35,40,45,50,55];

// ─── 편집기 (전체화면) ─────────────────────────────────────────────────────────
export function ScheduleEditor({
  visible, record, defaultDate, markedDays, appendMode = false, defaultRemind, defaultVoice = false, prefill,
  onSave, onAppend, onDelete, onClose,
}: {
  visible: boolean;
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
  onSave: (r: EditorResult) => void;
  onAppend: (id: string, entry: AppendResult) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { scale: fontScale } = useFontScale();
  const { t, lang } = useT();
  // 내용 입력 STT는 앱 언어를 따른다
  const sttLang = sttLangFor();
  const [content, setContent] = useState('');
  const [date, setDate]       = useState(new Date());
  const [hour, setHour]       = useState(9);   // 0~23
  const [minute, setMinute]   = useState(0);
  // 편집기를 열 때 받은 분이 5분 단위가 아니면(말로 "3시 37분") 그 값만 휠 목록에 끼워 둔다(열려 있는 동안 고정)
  const [extraMinute, setExtraMinute] = useState<number | null>(null);
  // 사용자가 날짜·시간을 직접 바꿨는지 — 안 바꿨으면 지난 일정의 내용만 고쳐도 "지난 시각" 확인을 띄우지 않는다
  const timeTouchedRef = useRef(false);
  const [alarmMode, setAlarmMode] = useState<AlarmMode>('both');
  const [remindBefore, setRemindBefore] = useState<number[]>([]);
  const [exactAlarm, setExactAlarm] = useState(true);
  const [voiceAlarm, setVoiceAlarm] = useState(false);
  const toggleRemind = (m: number) =>
    setRemindBefore((cur) => normalizeRemind(cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const [showCal, setShowCal]     = useState(false);
  // 기간 일정: 끝나는 날(없으면 하루짜리)
  const [endDate, setEndDate]     = useState<Date | null>(null);
  const [showEndCal, setShowEndCal] = useState(false);

  // ── 내용 입력 STT (일반 수정/생성 — 텍스트만, 오디오 저장 없음) ──────────────────
  const [sttOn, setSttOn]         = useState(false);
  const sttRef                    = useRef(false);
  const baseContentRef            = useRef(''); // STT 시작 전 기존 내용
  const micAnim                   = useRef(new Animated.Value(1)).current;

  // ── 추가 모드 녹음 — 메인과 동일하게 오디오+전사+구간타임스탬프를 실제로 캡처 ─────────
  const appendVoice = useVoiceRecorder();
  const player = useSharedPlayer();
  const [appendRecording, setAppendRecording] = useState(false);
  const [appendCapture, setAppendCapture] = useState<AppendResult | null>(null);
  // 녹음까지 남기는 마이크: 내용 추가 + 새 일정. 기존 일정 수정에서는 원래 녹음을 바꾸지 않고 "말로 덧붙이기"(editAppendMode)로 새 항목을 만든다
  const captureMode = appendMode || !record;

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

  // 마이크 pulse 애니메이션
  useEffect(() => {
    if (sttOn || appendRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micAnim, { toValue: 1.25, duration: 500, useNativeDriver: true }),
          Animated.timing(micAnim, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      micAnim.stopAnimation();
      micAnim.setValue(1);
    }
  }, [sttOn, appendRecording]);

  useSpeechRecognitionEvent('result', (e) => {
    if (!sttRef.current) return;
    const text = e.results?.[0]?.transcript ?? '';
    const combined = baseContentRef.current
      ? baseContentRef.current.trimEnd() + ' ' + text
      : text;
    setContent(combined);
  });

  useSpeechRecognitionEvent('end', () => {
    if (!sttRef.current) return;
    // 자동 재시작 (iOS continuous 제한 우회)
    setTimeout(() => {
      if (!sttRef.current) return;
      ExpoSpeechRecognitionModule.start({ lang: sttLang, interimResults: true, continuous: false });
    }, 150);
  });

  useSpeechRecognitionEvent('error', () => {
    if (!sttRef.current) return;
    setTimeout(() => {
      if (!sttRef.current) return;
      ExpoSpeechRecognitionModule.start({ lang: sttLang, interimResults: true, continuous: false });
    }, 300);
  });

  const startStt = () => {
    Keyboard.dismiss();
    player.stop(); // 듣던 녹음이 받아쓰기에 섞이지 않게
    baseContentRef.current = content; // 현재 내용 보존
    sttRef.current = true;
    setSttOn(true);
    setTimeout(() => {
      ExpoSpeechRecognitionModule.start({ lang: sttLang, interimResults: true, continuous: false });
    }, 100);
  };

  const stopStt = () => {
    sttRef.current = false;
    setSttOn(false);
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
  };

  const toggleStt = () => {
    if (sttOn) stopStt();
    else startStt();
  };

  // 녹음 캡처(내용 추가·새 일정): 마이크를 누르면 실제 오디오 녹음 + STT를 동시에 캡처
  // 한 화면에서 녹음은 하나만 남는다(녹음 파일을 이어 붙일 수 없다). 다시 녹음하면 앞 녹음과 그 글을 새 것으로 바꾸고,
  // 새 녹음에서 아무 말도 못 알아들었으면 앞 녹음과 글을 그대로 되돌린다.
  const voiceBusyRef = useRef(false); // 시작·정지 처리 중 연타 방지
  const prevTakeRef = useRef<{ capture: AppendResult; content: string } | null>(null);

  // ── 기존 일정 수정 화면의 "말로 덧붙이기" ──
  // 상세의 알림 칩(즉시 저장)과 "수정" 버튼이 따로 있어 헷갈렸다(2026-10-14 폰 피드백) → 고치기·덧붙이기·알림을 한 화면에서.
  // 메인 내용은 글자로 고치고, 마이크는 녹음과 함께 새 항목으로 덧붙인다(저장을 눌러야 함께 저장).
  const editAppendMode = !!record && !appendMode;
  const [extraRecording, setExtraRecording] = useState(false);
  const [extraCapture, setExtraCapture] = useState<AppendResult | null>(null);
  const [extraText, setExtraText] = useState('');
  const toggleExtra = async () => {
    if (voiceBusyRef.current) return;
    voiceBusyRef.current = true;
    try {
      if (!extraRecording) {
        if (extraCapture && !confirmRedoRef.current) {
          // 카드 "＋ 추가"와 같게: 이미 덧붙인 녹음이 있으면 바꿀지 먼저 묻는다
          voiceBusyRef.current = false;
          Alert.alert(t('다시 녹음할까요?'), t('앞에서 한 녹음과 그 글이 새 녹음으로 바뀌어요.'), [
            { text: t('취소'), style: 'cancel' },
            { text: t('다시 녹음'), onPress: () => { confirmRedoRef.current = true; toggleExtra().finally(() => { confirmRedoRef.current = false; }); } },
          ]);
          return;
        }
        Keyboard.dismiss();
        player.stop();
        setExtraRecording(true);
        try { await appendVoice.start(); } catch { setExtraRecording(false); }
        return;
      }
      const res = await appendVoice.stop();
      setExtraRecording(false);
      if (res.audioLost && res.transcript) notifyAudioLost();
      if (res.transcript) {
        // 한 화면에서 녹음은 하나만 덧붙인다 — 다시 하면 새 녹음으로 바꾼다
        setExtraCapture({
          content: res.transcript, transcript: res.transcript, uri: res.uri ?? '',
          durationSec: res.durationSec, segments: res.segments.length ? res.segments : undefined,
        });
        setExtraText(res.transcript);
      }
    } catch {
      try { await appendVoice.cancel(); } catch {}
      setExtraRecording(false);
    } finally {
      voiceBusyRef.current = false;
    }
  };
  const confirmRedoRef = useRef(false);
  const discardExtra = () => { setExtraCapture(null); setExtraText(''); };

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

  // 에디터 닫힐 때 STT/추가녹음 정리
  useEffect(() => {
    if (!visible) {
      player.stop();
      stopStt();
      if (appendRecording || extraRecording) { appendVoice.cancel(); setAppendRecording(false); setExtraRecording(false); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setAppendCapture(null);
    timeTouchedRef.current = false;
    setExtraMinute(null);
    setExtraCapture(null);
    setExtraText('');
    if (record) {
      setContent(appendMode ? '' : (record.content || record.transcript || ''));
      const d = record.scheduleAt ? new Date(record.scheduleAt) : new Date(defaultDate);
      if (record.needsDate) {
        // 날짜를 안 정한 녹음을 "정하기"로 열 때: 녹음 시각(이미 지난 시각)을 그대로 두면 알람 없이 꼬리표만 풀린다
        // → 오늘의 다음 정시를 기본으로 하고, 새 일정처럼 기본 미리 알림을 붙여 준다
        const next = new Date();
        next.setHours(next.getHours() + 1, 0, 0, 0);
        setDate(next);
        setHour(next.getHours());
        setMinute(0);
      } else {
        setDate(d);
        // 시간 미정 일정은 저장 시각(0시)이 아니라 9시를 기본으로 (자정 알람 방지)
        setHour(record.hasTime ? d.getHours() : 9);
        setMinute(record.hasTime ? d.getMinutes() : 0);
      }
      setExtraMinute(record.hasTime && !record.needsDate ? d.getMinutes() : null);
      setAlarmMode((record.alarmMode as AlarmMode) ?? 'both');
      setRemindBefore(normalizeRemind(record.needsDate && !(record.remindBefore ?? []).length ? (defaultRemind ?? []) : (record.remindBefore ?? [])));
      setExactAlarm(record.exactAlarm !== false);
      setVoiceAlarm(voiceAlarmOn(record)); // 일정에 따로 정한 값이 없으면 설정을 따른다
      setEndDate(record.endAt != null && !appendMode ? new Date(record.endAt) : null);
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
    setShowCal(false);
    setShowEndCal(false);
  }, [visible, record, appendMode, prefill]);

  // 시작일을 바꿨는데 끝나는 날보다 뒤면 기간을 지운다(거꾸로 된 기간 방지)
  useEffect(() => {
    if (endDate && new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime()
      <= new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) setEndDate(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const pastConfirmedRef = useRef(false);
  const handleSave = () => {
    if ((captureMode && appendRecording) || extraRecording) {
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
    // 새 일정·날짜를 정하는 녹음이거나, 사용자가 날짜·시간을 직접 바꿨을 때만 확인한다
    const timeMatters = !record || !!record.needsDate || timeTouchedRef.current;
    if (timeMatters && d.getTime() <= Date.now() && !pastConfirmedRef.current) {
      Alert.alert(t('지난 시각이에요'), t('이 시각은 이미 지나서 알람이 울리지 않아요. 그대로 저장할까요?'), [
        { text: t('취소'), style: 'cancel' },
        { text: t('그대로 저장'), onPress: () => { pastConfirmedRef.current = true; handleSave(); pastConfirmedRef.current = false; } },
      ]);
      return;
    }
    const matches = appendCapture && content.trim() === appendCapture.transcript.trim();
    onSave({
      id: record?.id, content: content.trim(), date: d, hasTime: true, alarmMode, remindBefore, exactAlarm,
      endDate: endDate && endDate.toDateString() !== d.toDateString() && endDate.getTime() > d.getTime() ? endDate : null,
      // 진동 전용이어도 선택은 남겨 둔다(울릴 때 voiceUriOf가 걸러 준다) — 소리 모드로 되돌리면 그대로 살아난다
      voiceAlarm: voiceAlarm && hasVoiceSource,
      append: editAppendMode && extraText.trim()
        ? {
            content: extraText.trim(),
            transcript: extraCapture?.transcript ?? extraText.trim(),
            uri: extraCapture?.uri ?? '',
            durationSec: extraCapture?.durationSec ?? 0,
            segments: extraCapture && extraText.trim() === extraCapture.transcript.trim() ? extraCapture.segments : undefined,
          }
        : undefined,
      capture: !record && appendCapture
        ? { uri: appendCapture.uri, durationSec: appendCapture.durationSec, transcript: appendCapture.transcript, segments: matches ? appendCapture.segments : undefined }
        : undefined,
    });
  };

  const handleDelete = () => {
    if (!record) return;
    Alert.alert(t('일정 삭제'), t('이 일정을 삭제할까요?'), [
      { text: t('취소'), style: 'cancel' },
      { text: t('삭제'), style: 'destructive', onPress: () => onDelete(record.id) },
    ]);
  };

  // 5분 단위 목록에 없는 분(말로 "3시 37분")이면 그 값을 끼워 넣는다 — 없으면 휠이 엉뚱한 칸에 멈춘다
  const minuteItems = useMemo(
    () => (extraMinute == null || MINUTES.includes(extraMinute) ? MINUTES : [...MINUTES, extraMinute].sort((a, b) => a - b)),
    [extraMinute],
  );

  const labelHour  = useCallback((v: number) => v.toString().padStart(2, '0'), []);
  const labelMin   = useCallback((v: number) => v.toString().padStart(2, '0'), []);

  const meridiem = t(hour < 12 ? '오전' : '오후');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const timeStr = `${h12}:${minute.toString().padStart(2, '0')}`;

  // [VOICE_ALARM] 보류된 기능 (lib/voiceAlarm.ts 스위치로 꺼짐)
  // 내 목소리 알람 칩: 들려줄 녹음이 있고(기존 녹음 또는 방금 한 녹음), 소리가 나는 모드일 때만 보인다
  const hasVoiceSource = record ? !!record.uri : !!appendCapture?.uri;
  const showVoiceChip = !appendMode && voiceAlarmSupported() && hasVoiceSource && alarmMode !== 'vibe';

  // 기존 일정의 녹음(없으면 글 읽어 주기)을 수정 화면에서 듣기
  const listenable = !!record && !appendMode && (!!record.uri || !!recordSpeechText(record));
  const listening = !!record && player.playingId === record.id;
  // 말하기가 진행 중인가(녹음 캡처 또는 글만 받아 적기)
  const voiceActive = captureMode ? appendRecording : editAppendMode ? extraRecording : sttOn;

  const navTitle = t(appendMode ? '내용 추가' : record ? '일정 수정' : '새 일정');

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
            {record && !appendMode && (
              <TouchableOpacity style={styles.navIconBtn} onPress={handleDelete} accessibilityRole="button" accessibilityLabel={t('일정 삭제')}>
                <Text style={styles.navDeleteIcon}>🗑</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.navBtn} onPress={handleSave}>
              <Text style={styles.navSaveText}>{t('저장')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {appendMode ? (kbOpen ? null :
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
        ) : kbOpen ? null : (
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.label}>{t('날짜')}</Text>
              {/* 빠른 선택 — 날짜 없이 녹음한 일정을 고칠 때 한 번에 끝나도록 */}
              <View style={styles.quickRow}>
                {[0, 1, 2].map((offset) => {
                  const n = new Date();
                  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + offset);
                  const on = d.toDateString() === date.toDateString();
                  return (
                    <TouchableOpacity
                      key={offset}
                      style={[styles.quickChip, on && styles.quickChipOn]}
                      onPress={() => { timeTouchedRef.current = true; setDate(d); setShowCal(false); }}
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.quickChipText, on && styles.quickChipTextOn]}>{t(['오늘', '내일', '모레'][offset])}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowCal((s) => !s)}>
                <Text style={styles.dateBtnText}>{formatDayHeader(date)}</Text>
                <Text style={styles.dateBtnChevron}>{showCal ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showCal && (
                <View style={styles.calBox}>
                  <Calendar
                    selectedDate={date}
                    onSelectDate={(d) => { timeTouchedRef.current = true; setDate(d); setShowCal(false); }}
                    markedDays={markedDays}
                  />
                </View>
              )}

              {/* 기간 일정(휴가·출장·여행): 끝나는 날. 알람은 시작하는 날에만 울린다 */}
              {endDate ? (
                <View style={styles.endRow}>
                  <TouchableOpacity style={[styles.dateBtn, { flex: 1 }]} onPress={() => setShowEndCal((v) => !v)} accessibilityRole="button" accessibilityLabel={`${t('끝나는 날')}, ${formatDayHeader(endDate)}`}>
                    <Text style={styles.dateBtnText}>~ {formatDayHeader(endDate)}</Text>
                    <Text style={styles.dateBtnChevron}>{showEndCal ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.endClear} onPress={() => { setEndDate(null); setShowEndCal(false); }} accessibilityRole="button" accessibilityLabel={t('기간 지우기')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.endClearText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.endAdd}
                  onPress={() => {
                    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
                    setEndDate(d);
                    setShowEndCal(true);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.endAddText}>{t('＋ 기간 (끝나는 날)')}</Text>
                </TouchableOpacity>
              )}
              {endDate && showEndCal && (
                <View style={styles.calBox}>
                  <Calendar
                    selectedDate={endDate}
                    onSelectDate={(d) => {
                      // 시작일과 같거나 앞이면 기간이 아니다
                      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
                      if (d.getTime() <= start) { setEndDate(null); setShowEndCal(false); return; }
                      setEndDate(d);
                      setShowEndCal(false);
                    }}
                    markedDays={markedDays}
                  />
                </View>
              )}

              <Text style={styles.label}>{t('시간')}</Text>
              <View style={styles.pickerRow}>
                <View style={styles.timePickerGroup}>
                  <ScrollPicker value={hour}   items={HOURS24} onChange={(v) => { timeTouchedRef.current = true; setHour(v); }}   label={labelHour} />
                  <Text style={styles.colon}>:</Text>
                  <ScrollPicker value={minute} items={minuteItems} onChange={(v) => { timeTouchedRef.current = true; setMinute(v); }} label={labelMin}  />
                </View>
                <View style={styles.alarmSide}>
                  <View style={styles.alarmTextCol}>
                    <Text style={styles.meridiemText}>{meridiem}</Text>
                    <Text style={styles.timePreview}>{timeStr}</Text>
                  </View>
                  <View style={styles.alarmIconCol}>
                    <TouchableOpacity
                      style={[styles.modeIconBtn, alarmMode === 'both' && styles.modeIconBtnOn]}
                      onPress={() => setAlarmMode('both')}
                    >
                      <Text style={styles.modeIconBell}>🔔</Text>
                      <Image source={require('../assets/vibrate_icon.png')} style={styles.modeIconVibe} />
                    </TouchableOpacity>
                    <View style={styles.modeIconGroup}>
                      <TouchableOpacity
                        style={[styles.modeIconBtn, alarmMode === 'sound' && styles.modeIconBtnOn]}
                        onPress={() => setAlarmMode('sound')}
                      >
                        <Text style={styles.modeIconBell}>🔔</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeIconBtn, alarmMode === 'vibe' && styles.modeIconBtnOn]}
                        onPress={() => setAlarmMode('vibe')}
                      >
                        <Image source={require('../assets/vibrate_icon.png')} style={styles.modeIconVibe} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {!appendMode && !kbOpen && (
          <View style={styles.section}>
            <Text style={styles.label}>{t('알림')}</Text>
            <View style={styles.remindRow}>
              {REMIND_OPTIONS.map((m) => {
                const on = remindBefore.includes(m);
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.quickChip, on && styles.quickChipOn]}
                    onPress={() => toggleRemind(m)}
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t('미리 알림 {label}', { label: t(remindLabel(m)) })}
                  >
                    <Text style={[styles.quickChipText, on && styles.quickChipTextOn]}>{t(remindLabel(m))}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.quickChip, exactAlarm && styles.quickChipOn]}
                onPress={() => setExactAlarm((v) => !v)}
                accessibilityState={{ selected: exactAlarm }}
                accessibilityLabel={t('정각 알림')}
              >
                <Text style={[styles.quickChipText, exactAlarm && styles.quickChipTextOn]}>{t('정각')}</Text>
              </TouchableOpacity>
              {/* [VOICE_ALARM] 보류된 기능 — 상용에서는 보이지 않는다 */}
              {showVoiceChip && (
                <TouchableOpacity
                  style={[styles.quickChip, voiceAlarm && styles.quickChipOn]}
                  onPress={() => setVoiceAlarm((v) => !v)}
                  accessibilityState={{ selected: voiceAlarm }}
                  accessibilityLabel={t('알람 소리 내 목소리')}
                >
                  <Text style={[styles.quickChipText, voiceAlarm && styles.quickChipTextOn]}>{t('🎙 내 목소리')}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.remindHint}>
              {remindBefore.length
                ? t('{list}에 한 번씩 미리 알려요', { list: remindBefore.map((m) => t(remindLabel(m))).join(' · ') }) + (exactAlarm ? t(', 정각에도 울려요') : '')
                : exactAlarm ? t('정각에만 울려요 (못 들으면 1분·2분 뒤 다시)') : t('알림 없음')}
            </Text>
          </View>
        )}

        {/* 내용 입력 — 남은 공간 전부 차지 */}
        <View style={styles.contentArea}>
          <View style={styles.contentLabelRow}>
            <Text style={styles.label}>{t(appendMode ? '추가할 내용' : '내용')}</Text>
            {/* 수정 화면에서도 원래 녹음을 들을 수 있게 — 날짜 없이 녹음한 것을 "정하기"로 열었을 때
                무슨 내용이었는지 들어 봐야 날짜를 정할 수 있다(2026-10-14 폰 피드백) */}
            {listenable && !voiceActive && (
              <TouchableOpacity
                style={styles.listenBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  if (record!.uri) player.toggle(record!.id, record!.uri);
                  else player.speak(record!.id, recordSpeechText(record!));
                }}
                accessibilityRole="button"
                accessibilityLabel={t(listening ? '⏸ 멈춤' : record!.uri ? '▶ 녹음 듣기' : '▶ 읽어 주기')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.listenBtnText}>{t(listening ? '⏸ 멈춤' : record!.uri ? '▶ 녹음 듣기' : '▶ 읽어 주기')}</Text>
              </TouchableOpacity>
            )}
            {sttOn && <Text style={styles.sttHint}>{t('🎤 듣는 중… 탭하면 중지')}</Text>}
            {(appendRecording || extraRecording) && (
              <Text style={styles.sttHint} accessibilityLiveRegion="polite">
                {appendVoice.listening
                  ? `${t('🎙 지금 말씀하세요')} · ${formatDuration(Math.floor((appendVoice.recorderState.durationMillis ?? 0) / 1000))}`
                  : appendVoice.sttBlocked ? t(sttBlockedNotice(Platform.OS)) : t('준비 중…')}
              </Text>
            )}
            {kbOpen && !sttOn && !appendRecording && (
              <TouchableOpacity style={styles.kbDoneBtn} onPress={() => Keyboard.dismiss()} accessibilityRole="button">
                <Text style={styles.kbDoneText}>{t('입력 완료')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* 말하기 막대 — 예전엔 입력 칸 구석의 작은 마이크라 잘 안 보였다(2026-10-14 피드백).
              누르기 전: 화면 폭 전체의 빨간 "눌러서 말하기" / 녹음 중: 같은 자리에 파형 + "■ 완료" */}
          {!(kbOpen && !voiceActive) && (
            <TouchableOpacity
              style={[styles.voiceBar, voiceActive && styles.voiceBarOn]}
              testID="editor-mic"
              accessibilityRole="button"
              accessibilityLabel={t(voiceActive ? '완료' : editAppendMode ? '＋ 말로 덧붙이기' : '눌러서 말하기')}
              onPress={captureMode ? toggleAppendVoice : editAppendMode ? toggleExtra : toggleStt}
              activeOpacity={0.8}
            >
              {voiceActive ? (
                <>
                  <View style={styles.voiceBarWave}>
                    {appendRecording || extraRecording
                      ? <Waveform compact metering={appendVoice.recorderState.metering} isRecording={appendVoice.recorderState.isRecording} />
                      : <Animated.View style={[styles.recDot, { transform: [{ scale: micAnim }] }]} />}
                  </View>
                  <Text style={styles.voiceBarStop}>{t('■ 완료')}</Text>
                </>
              ) : (
                <>
                  <MicIcon size={22} color={C.onAccent} />
                  <Text style={styles.voiceBarText}>{t(editAppendMode ? '＋ 말로 덧붙이기' : '눌러서 말하기')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {captureMode && appendCapture?.uri && !appendRecording && (
            <Text style={styles.appendCaptureHint}>
              {t('녹음 저장됨 ({sec}초) · 내용을 고치면 구간재생은 빠지고 녹음은 그대로 남아요', { sec: appendCapture.durationSec })}
            </Text>
          )}
          {captureMode && appendCapture && !appendCapture.uri && !appendRecording && (
            <Text style={styles.appendCaptureHint}>{t(NO_FILE_NOTICE)}</Text>
          )}
          <View style={styles.contentInputWrap}>
            <TextInput
              style={[styles.contentInput, { fontSize: 17 * fontScale, lineHeight: 24 * fontScale }]}
              value={appendRecording && appendVoice.liveText
                ? (content ? content.trimEnd() + ' ' : '') + appendVoice.liveText
                : content}
              editable={!appendRecording}
              onChangeText={(t) => {
                if (sttOn) baseContentRef.current = t;
                setContent(t);
              }}
              placeholder={t(appendRecording ? '말씀하시면 여기에 바로 적혀요' : appendMode ? '이어붙일 내용을 말하거나 입력하세요' : '할 일을 입력하세요')}
              placeholderTextColor={C.textDim}
              multiline
              textAlignVertical="top"
            />
          </View>
          {editAppendMode && (extraRecording || extraText || extraCapture) ? (
            <View style={styles.extraBox}>
              <View style={styles.extraHead}>
                <Text style={styles.extraLabel}>{t('덧붙일 내용 · 저장하면 추가돼요')}</Text>
                {!extraRecording && (
                  <TouchableOpacity onPress={discardExtra} accessibilityRole="button" accessibilityLabel={t('덧붙일 내용 지우기')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.extraClose}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[styles.extraInput, { fontSize: 16 * fontScale, lineHeight: 22 * fontScale }]}
                value={extraRecording ? appendVoice.liveText : extraText}
                editable={!extraRecording}
                onChangeText={setExtraText}
                placeholder={t('말씀하시면 여기에 바로 적혀요')}
                placeholderTextColor={C.textDim}
                multiline
              />
              {extraCapture && !extraCapture.uri && !extraRecording ? (
                <Text style={styles.appendCaptureHint}>{t(NO_FILE_NOTICE)}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}


const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

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
  navIconBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  navDeleteIcon: { fontSize: 18 },

  section: { paddingHorizontal: 20, paddingBottom: 8 },
  label: { color: C.accent, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },

  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  quickChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  quickChipText: { color: C.textSub, fontSize: 13, fontWeight: '700' },
  quickChipTextOn: { color: C.onAccent },
  remindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remindHint: { color: C.textSub, fontSize: 12, marginTop: 8 },
  dateBtn: {
    backgroundColor: C.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: C.border,
  },
  dateBtnText:    { color: C.text, fontSize: 16, fontWeight: '500' },
  dateBtnChevron: { color: C.accent, fontSize: 12 },
  calBox:         { borderRadius: 12, marginTop: 8 },
  endRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  endClear:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  endClearText:   { color: C.textSub, fontSize: 14, fontWeight: '700' },
  endAdd:         { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  endAddText:     { color: C.accent, fontSize: 13, fontWeight: '700' },

  // 왼쪽 휠(시:분)은 flex로 줄어들고, 오른쪽 알람 영역은 내용 크기만큼만 차지해 박스 밖으로 나가지 않게 한다
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: C.surface, borderRadius: 16, paddingLeft: 8, paddingRight: 10,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  timePickerGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  colon:       { color: C.text, fontSize: 20, fontWeight: '700', paddingHorizontal: 2 },

  alarmSide:    { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingVertical: 10 },
  alarmTextCol: { alignItems: 'center', gap: 2, minWidth: 44 },
  alarmIconCol: { alignItems: 'center', gap: 6 },
  meridiemText: { color: C.textSub, fontSize: 15, fontWeight: '700' },
  timePreview:  { color: C.text, fontSize: 17, fontWeight: '700' },
  modeIconGroup: { flexDirection: 'row', gap: 6 },
  modeIconBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 9, backgroundColor: C.surfaceHigh },
  modeIconBtnOn: { backgroundColor: C.red },
  modeIconBell: { fontSize: 14 },
  modeIconVibe: { width: 16, height: 16, resizeMode: 'contain' },

  appendInfoRow: { paddingHorizontal: 20, paddingTop: 14 },
  appendInfoText: { color: C.textSub, fontSize: 13, fontWeight: '600' },
  lockedBox: {
    marginHorizontal: 20, marginTop: 8, maxHeight: 140,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
  },
  lockedText: { color: C.textSub, fontSize: 15, lineHeight: 22 },

  // 글자를 아주 크게 써도 내용 칸이 한 줄로 찌그러지지 않게 최소 높이를 지키고, 위쪽 칸들이 대신 스크롤된다
  contentArea: { flex: 1, minHeight: 170, paddingHorizontal: 20, paddingBottom: 20 },
  contentLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sttHint: { color: C.red, fontSize: 13, fontWeight: '700', marginTop: 14 },
  kbDoneBtn: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.accent },
  kbDoneText: { color: C.onAccent, fontSize: 13, fontWeight: '700' },
  appendCaptureHint: { color: C.accent, fontSize: 12, marginBottom: 8, lineHeight: 16 },
  contentInputWrap: { flex: 1, position: 'relative' },
  contentInput: {
    flex: 1,
    backgroundColor: C.surface, borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    color: C.text, fontSize: 17, lineHeight: 24,
    borderWidth: 1, borderColor: C.border,
  },
  micBtn: {
    position: 'absolute', right: 12, bottom: 12,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  recDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.red },
  extraBox: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.accent, backgroundColor: C.surface },
  extraHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  extraLabel: { color: C.accent, fontSize: 13, fontWeight: '800' },
  extraClose: { color: C.textSub, fontSize: 16, fontWeight: '700' },
  extraInput: { color: C.text, maxHeight: 120, padding: 0 },
  listenBtn: { marginTop: 10, marginLeft: 'auto', marginRight: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.surfaceHigh },
  listenBtnText: { color: C.accent, fontSize: 13, fontWeight: '800' },
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
