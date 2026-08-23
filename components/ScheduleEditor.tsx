import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from './ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { MonthCalendar } from './calendar/MonthCalendar';
import { formatDayHeader } from '../lib/dateUtils';
import { useStyles, useTheme, type Theme } from '../lib/theme';
import type { ScheduleRecord, TranscriptSegment } from '../lib/storage';
import { useVoiceRecorder } from '../lib/useVoiceRecorder';

export type AlarmMode = 'both' | 'sound' | 'vibe';

export type EditorResult = {
  id?: string;
  content: string;
  date: Date;
  hasTime: boolean;
  alarmMode: AlarmMode;
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
const PICK_H = 42;
// 항목 수가 적은 피커(시 등)도 양방향 스크롤 버퍼가 충분하도록
// midOffset(중앙까지의 행 수)이 대략 같아지게 loopCount를 동적으로 계산
const TARGET_MID_OFFSET = 48;

const HOURS24     = Array.from({ length: 24 }, (_, i) => i); // 0~23
const MINUTES     = [0,5,10,15,20,25,30,35,40,45,50,55];

function ScrollPicker({
  value, items, onChange, label,
}: {
  value: number;
  items: number[];
  onChange: (v: number) => void;
  label: (v: number) => string;
}) {
  const pick           = useStyles(makePick);
  const flatRef        = useRef<FlatList>(null);
  const isScrolling    = useRef(false);
  const skipEffect     = useRef(false);
  const [laid, setLaid] = useState(false);

  const loopCount = useMemo(
    () => 2 * Math.ceil(TARGET_MID_OFFSET / items.length) + 1,
    [items]
  );
  const looped   = useMemo(() => Array.from({ length: loopCount }, () => items).flat(), [items, loopCount]);
  const total    = looped.length;
  const midOff   = Math.floor(loopCount / 2) * items.length;

  const targetY = useCallback(
    (v: number) => (midOff + items.indexOf(v)) * PICK_H,
    [items, midOff]
  );

  // initialScrollIndex: item n-1 을 뷰포트 상단에 → item n 이 중앙 하이라이트에 위치
  const initScrollIndex = Math.max(0, midOff + items.indexOf(value) - 1);

  // 초기 스크롤 — onLayout 후 200ms + 500ms 2단계로 확실하게 실행
  useEffect(() => {
    if (!laid) return;
    const t1 = setTimeout(() => {
      flatRef.current?.scrollToOffset({ offset: targetY(value), animated: false });
    }, 200);
    const t2 = setTimeout(() => {
      flatRef.current?.scrollToOffset({ offset: targetY(value), animated: false });
    }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laid]);

  useEffect(() => {
    if (!laid) return;
    if (skipEffect.current) { skipEffect.current = false; return; }
    if (isScrolling.current) return;
    flatRef.current?.scrollToOffset({ offset: targetY(value), animated: true });
  }, [value, laid, targetY]);

  const handleEnd = useCallback((y: number) => {
    isScrolling.current = false;
    const idx    = Math.round(y / PICK_H);
    const clipped = Math.max(0, Math.min(total - 1, idx));
    const newVal  = looped[clipped];
    if (newVal !== value) {
      skipEffect.current = true;
      onChange(newVal);
    }
    // 끝 근처면 가운데로 순간이동
    const localIdx = items.indexOf(newVal);
    const tgt = (midOff + localIdx) * PICK_H;
    if (Math.abs(clipped - (midOff + localIdx)) > items.length * 2) {
      setTimeout(() => {
        flatRef.current?.scrollToOffset({ offset: tgt, animated: false });
      }, 50);
    }
  }, [value, looped, total, items, midOff, onChange]);

  const getItemLayout = useCallback((_: any, i: number) => ({
    length: PICK_H, offset: PICK_H * (i + 1), index: i,
  }), []);

  const renderItem = useCallback(({ item }: { item: number }) => (
    <TouchableOpacity style={pick.item} onPress={() => onChange(item)} activeOpacity={0.6}>
      <Text style={item === value ? pick.sel : pick.dim}>{label(item)}</Text>
    </TouchableOpacity>
  ), [value, onChange, label]);

  return (
    <View style={pick.wrap} onLayout={() => setLaid(true)}>
      <View style={pick.highlight} pointerEvents="none" />
      <FlatList
        ref={flatRef}
        data={looped}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialScrollIndex={initScrollIndex}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICK_H}
        decelerationRate="fast"
        windowSize={3}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: PICK_H }}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onMomentumScrollEnd={(e: any) => {
          if (!isScrolling.current) return;
          handleEnd(e.nativeEvent.contentOffset.y);
        }}
        onScrollEndDrag={(e: any) => {
          if (!isScrolling.current) return;
          const vy = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(vy) < 0.01) handleEnd(e.nativeEvent.contentOffset.y);
        }}
      />
    </View>
  );
}

// ─── 편집기 (전체화면) ─────────────────────────────────────────────────────────
export function ScheduleEditor({
  visible, record, defaultDate, markedDays, appendMode = false,
  onSave, onAppend, onDelete, onClose,
}: {
  visible: boolean;
  record: ScheduleRecord | null;
  defaultDate: Date;
  markedDays: Set<string>;
  appendMode?: boolean;
  onSave: (r: EditorResult) => void;
  onAppend: (id: string, entry: AppendResult) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState('');
  const [date, setDate]       = useState(new Date());
  const [hour, setHour]       = useState(9);   // 0~23
  const [minute, setMinute]   = useState(0);
  const [alarmMode, setAlarmMode] = useState<AlarmMode>('both');
  const [showCal, setShowCal]     = useState(false);

  // ── 내용 입력 STT (일반 수정/생성 — 텍스트만, 오디오 저장 없음) ──────────────────
  const [sttOn, setSttOn]         = useState(false);
  const sttRef                    = useRef(false);
  const baseContentRef            = useRef(''); // STT 시작 전 기존 내용
  const micAnim                   = useRef(new Animated.Value(1)).current;

  // ── 추가 모드 녹음 — 메인과 동일하게 오디오+전사+구간타임스탬프를 실제로 캡처 ─────────
  const appendVoice = useVoiceRecorder();
  const [appendRecording, setAppendRecording] = useState(false);
  const [appendCapture, setAppendCapture] = useState<AppendResult | null>(null);

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
      ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: false });
    }, 150);
  });

  useSpeechRecognitionEvent('error', () => {
    if (!sttRef.current) return;
    setTimeout(() => {
      if (!sttRef.current) return;
      ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: false });
    }, 300);
  });

  const startStt = () => {
    baseContentRef.current = content; // 현재 내용 보존
    sttRef.current = true;
    setSttOn(true);
    setTimeout(() => {
      ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: false });
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

  // 추가 모드: 마이크를 누르면 실제 오디오 녹음 + STT를 동시에 캡처
  const toggleAppendVoice = async () => {
    if (appendRecording) {
      const res = await appendVoice.stop();
      setAppendRecording(false);
      if (res.uri && res.transcript) {
        const capture: AppendResult = {
          content: res.transcript,
          transcript: res.transcript,
          uri: res.uri,
          durationSec: res.durationSec,
          segments: res.segments.length ? res.segments : undefined,
        };
        setAppendCapture(capture);
        setContent((c) => (c ? c.trimEnd() + ' ' + res.transcript : res.transcript));
      }
    } else {
      setAppendCapture(null);
      await appendVoice.start();
      setAppendRecording(true);
    }
  };

  // 에디터 닫힐 때 STT/추가녹음 정리
  useEffect(() => {
    if (!visible) {
      stopStt();
      if (appendRecording) { appendVoice.cancel(); setAppendRecording(false); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setAppendCapture(null);
    if (record) {
      setContent(appendMode ? '' : (record.content || record.transcript || ''));
      const d = record.scheduleAt ? new Date(record.scheduleAt) : new Date(defaultDate);
      setDate(d);
      // 시간 미정 일정은 저장 시각(0시)이 아니라 9시를 기본으로 (자정 알람 방지)
      setHour(record.hasTime ? d.getHours() : 9);
      setMinute(record.hasTime ? d.getMinutes() : 0);
      setAlarmMode((record.alarmMode as AlarmMode) ?? 'both');
    } else {
      setContent('');
      setDate(new Date(defaultDate));
      setHour(9);
      setMinute(0);
      setAlarmMode('both');
    }
    setShowCal(false);
  }, [visible, record, appendMode]);

  const handleSave = () => {
    if (appendMode && appendRecording) {
      Alert.alert('녹음 중이에요', '마이크를 다시 눌러 녹음을 마친 뒤 저장해주세요.');
      return;
    }
    if (!content.trim()) { Alert.alert('내용을 입력해주세요'); return; }
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
    onSave({ id: record?.id, content: content.trim(), date: d, hasTime: true, alarmMode });
  };

  const handleDelete = () => {
    if (!record) return;
    Alert.alert('일정 삭제', '이 일정을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(record.id) },
    ]);
  };

  const labelHour  = useCallback((v: number) => v.toString().padStart(2, '0'), []);
  const labelMin   = useCallback((v: number) => v.toString().padStart(2, '0'), []);

  const meridiem = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const timeStr = `${h12}:${minute.toString().padStart(2, '0')}`;

  const navTitle = appendMode ? '내용 추가' : record ? '일정 수정' : '새 일정';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
        <StatusBar style="auto" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* 상단 네비게이션 — Modal 안에서는 SafeAreaView의 top 자동 인셋이 가끔 안 먹어서
            insets.top을 직접 적용한다 */}
        <View style={[styles.navBar, { paddingTop: insets.top }]}>
          <TouchableOpacity style={styles.navBtn} onPress={onClose}>
            <Text style={styles.navCancelText}>취소</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>{navTitle}</Text>
          <View style={styles.navRight}>
            {record && !appendMode && (
              <TouchableOpacity style={styles.navIconBtn} onPress={handleDelete}>
                <Text style={styles.navDeleteIcon}>🗑</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.navBtn} onPress={handleSave}>
              <Text style={styles.navSaveText}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>

        {appendMode ? (
          <>
            {/* 추가 모드: 기존 내용 잠금 표시 */}
            <View style={styles.appendInfoRow}>
              <Text style={styles.appendInfoText}>
                {record ? formatDayHeader(new Date(record.scheduleAt ?? Date.now())) : ''}
                {record?.hasTime && record.scheduleAt ? ` · ${timeStr}` : ''}
              </Text>
            </View>
            <ScrollView style={styles.lockedBox} contentContainerStyle={{ padding: 14 }}>
              <Text style={styles.lockedText}>{record?.content || record?.transcript}</Text>
            </ScrollView>
          </>
        ) : (
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.label}>날짜</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowCal((s) => !s)}>
                <Text style={styles.dateBtnText}>{formatDayHeader(date)}</Text>
                <Text style={styles.dateBtnChevron}>{showCal ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showCal && (
                <View style={styles.calBox}>
                  <MonthCalendar
                    selectedDate={date}
                    onSelectDate={(d) => { setDate(d); setShowCal(false); }}
                    markedDays={markedDays}
                  />
                </View>
              )}

              <Text style={styles.label}>시간</Text>
              <View style={styles.pickerRow}>
                <View style={styles.timePickerGroup}>
                  <ScrollPicker value={hour}   items={HOURS24} onChange={setHour}   label={labelHour} />
                  <Text style={styles.colon}>:</Text>
                  <ScrollPicker value={minute} items={MINUTES} onChange={setMinute} label={labelMin}  />
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

        {/* 내용 입력 — 남은 공간 전부 차지 */}
        <View style={styles.contentArea}>
          <View style={styles.contentLabelRow}>
            <Text style={styles.label}>{appendMode ? '추가할 내용' : '내용'}</Text>
            {sttOn && <Text style={styles.sttHint}>🎤 듣는 중… 탭하면 중지</Text>}
            {appendRecording && <Text style={styles.sttHint}>🎤 녹음 중… 탭하면 완료</Text>}
          </View>
          {appendMode && appendCapture?.uri && !appendRecording && (
            <Text style={styles.appendCaptureHint}>
              🎙 녹음 저장됨 ({appendCapture.durationSec}초) · 내용을 고치면 구간재생은 빠지고 녹음은 그대로 남아요
            </Text>
          )}
          <View style={styles.contentInputWrap}>
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={(t) => {
                if (sttOn) baseContentRef.current = t;
                setContent(t);
              }}
              placeholder={appendMode ? '이어붙일 내용을 말하거나 입력하세요' : '할 일을 입력하세요'}
              placeholderTextColor={t.c.textDim}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={styles.micBtn}
              onPress={appendMode ? toggleAppendVoice : toggleStt}
              activeOpacity={0.7}
            >
              <Animated.Text style={[styles.micIcon, { transform: [{ scale: micAnim }] }]}>
                {(appendMode ? appendRecording : sttOn) ? '🔴' : '🎙️'}
              </Animated.Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const makePick = (t: Theme) => StyleSheet.create({
  wrap:      { flex: 1, height: PICK_H * 3, overflow: 'hidden', position: 'relative' },
  highlight: { position: 'absolute', top: PICK_H, left: 4, right: 4, height: PICK_H, backgroundColor: t.c.surfaceAlt, borderRadius: 10 },
  item:      { height: PICK_H, justifyContent: 'center', alignItems: 'center' },
  sel:       { fontSize: 24, color: t.c.text, fontWeight: '700' },
  dim:       { fontSize: 15, color: t.c.textDim, fontWeight: '400' },
});

const makeStyles = (t: Theme) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.c.bg },

  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, minHeight: 52,
    borderBottomWidth: 1, borderBottomColor: t.c.border,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  navCancelText: { color: t.c.textSub, fontSize: 16, fontWeight: '600' },
  navSaveText: { color: t.c.red, fontSize: 16, fontWeight: '700' },
  navTitle: { position: 'absolute', left: 60, right: 60, textAlign: 'center', color: t.c.text, fontSize: 16, fontWeight: '700' },
  navRight: { flexDirection: 'row', alignItems: 'center' },
  navIconBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  navDeleteIcon: { fontSize: 18 },

  section: { paddingHorizontal: 20, paddingBottom: 8 },
  label: { color: t.c.accent, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },

  dateBtn: {
    backgroundColor: t.c.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: t.c.border,
  },
  dateBtnText:    { color: t.c.text, fontSize: 16, fontWeight: '500' },
  dateBtnChevron: { color: t.c.accent, fontSize: 12 },
  calBox:         { borderRadius: 12, marginTop: 8 },

  pickerRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: t.c.surface, borderRadius: 16, paddingHorizontal: 8,
    borderWidth: 1, borderColor: t.c.border,
  },
  timePickerGroup: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  colon:       { color: t.c.text, fontSize: 20, fontWeight: '700', paddingHorizontal: 2 },

  alarmSide:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 12, paddingVertical: 10, width: 130 },
  alarmTextCol: { alignItems: 'center', gap: 4 },
  alarmIconCol: { alignItems: 'center', gap: 6 },
  meridiemText: { color: t.c.textSub, fontSize: 18, fontWeight: '700' },
  timePreview:  { color: t.c.text, fontSize: 18, fontWeight: '700' },
  modeIconGroup: { flexDirection: 'row', gap: 6 },
  modeIconBtn:  { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, backgroundColor: t.c.surfaceAlt },
  modeIconBtnOn: { backgroundColor: t.c.red },
  modeIconBell: { fontSize: 14 },
  modeIconVibe: { width: 16, height: 16, resizeMode: 'contain' },

  appendInfoRow: { paddingHorizontal: 20, paddingTop: 14 },
  appendInfoText: { color: t.c.textSub, fontSize: 13, fontWeight: '600' },
  lockedBox: {
    marginHorizontal: 20, marginTop: 8, maxHeight: 140,
    backgroundColor: t.c.surface, borderRadius: 14,
    borderWidth: 1, borderColor: t.c.border,
  },
  lockedText: { color: t.c.textSub, fontSize: 15, lineHeight: 22 },

  contentArea: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },
  contentLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sttHint: { color: t.c.red, fontSize: 12, marginTop: 14 },
  appendCaptureHint: { color: t.c.accent, fontSize: 12, marginBottom: 8, lineHeight: 16 },
  contentInputWrap: { flex: 1, position: 'relative' },
  contentInput: {
    flex: 1,
    backgroundColor: t.c.surface, borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 56,
    color: t.c.text, fontSize: 17, lineHeight: 24,
    borderWidth: 1, borderColor: t.c.border,
  },
  micBtn: {
    position: 'absolute', right: 12, bottom: 12,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: t.c.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  micIcon: { fontSize: 20 },
});
