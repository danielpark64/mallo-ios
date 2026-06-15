import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { Calendar } from './Calendar';
import { formatDayHeader, formatTime } from '../lib/dateUtils';
import type { ScheduleRecord } from '../lib/storage';

export type AlarmMode = 'both' | 'sound' | 'vibe';

export type EditorResult = {
  id?: string;
  content: string;
  date: Date;
  hasTime: boolean;
  alarmMode: AlarmMode;
};

// ─── 무한궤도 스크롤 피커 ─────────────────────────────────────────────────────
const PICK_H = 54;
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

// ─── 편집기 모달 ──────────────────────────────────────────────────────────────
export function ScheduleEditor({
  visible, record, defaultDate, markedDays, onSave, onDelete, onClose,
}: {
  visible: boolean;
  record: ScheduleRecord | null;
  defaultDate: Date;
  markedDays: Set<string>;
  onSave: (r: EditorResult) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [date, setDate]       = useState(new Date());
  const [hour, setHour]       = useState(9);   // 0~23
  const [minute, setMinute]   = useState(0);
  const [alarmMode, setAlarmMode] = useState<AlarmMode>('both');
  const [showCal, setShowCal]     = useState(false);

  // ── 내용 입력 STT ─────────────────────────────────────────────────────────
  const [sttOn, setSttOn]         = useState(false);
  const sttRef                    = useRef(false);
  const baseContentRef            = useRef(''); // STT 시작 전 기존 내용
  const micAnim                   = useRef(new Animated.Value(1)).current;

  // 마이크 pulse 애니메이션
  useEffect(() => {
    if (sttOn) {
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
  }, [sttOn]);

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

  // 에디터 닫힐 때 STT 정리
  useEffect(() => {
    if (!visible) {
      stopStt();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (record) {
      setContent(record.content || record.transcript || '');
      const d = record.scheduleAt ? new Date(record.scheduleAt) : new Date(defaultDate);
      setDate(d);
      setHour(d.getHours());
      setMinute(d.getMinutes());
      setAlarmMode((record.alarmMode as AlarmMode) ?? 'both');
    } else {
      setContent('');
      setDate(new Date(defaultDate));
      setHour(9);
      setMinute(0);
      setAlarmMode('both');
    }
    setShowCal(false);
  }, [visible, record]);

  const handleSave = () => {
    if (!content.trim()) { Alert.alert('내용을 입력해주세요'); return; }
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{record ? '일정 수정' : '새 일정'}</Text>

          {/* 내용 + 날짜 — ScrollView 안에 (FlatList 없음) */}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>내용</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={content}
                onChangeText={(t) => {
                  // 직접 타이핑하면 현재 텍스트를 base로 업데이트
                  if (sttOn) baseContentRef.current = t;
                  setContent(t);
                }}
                placeholder="할 일을 입력하세요"
                placeholderTextColor="#55557a"
                multiline
              />
              <TouchableOpacity style={styles.micBtn} onPress={toggleStt} activeOpacity={0.7}>
                <Animated.Text style={[styles.micIcon, { transform: [{ scale: micAnim }] }]}>
                  {sttOn ? '🔴' : '🎙️'}
                </Animated.Text>
              </TouchableOpacity>
            </View>
            {sttOn && (
              <Text style={styles.sttHint}>🎤 듣는 중… 탭하면 중지</Text>
            )}

            <Text style={styles.label}>날짜</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowCal((s) => !s)}>
              <Text style={styles.dateBtnText}>{formatDayHeader(date)}</Text>
              <Text style={styles.dateBtnChevron}>{showCal ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showCal && (
              <View style={styles.calBox}>
                <Calendar
                  selectedDate={date}
                  onSelectDate={(d) => { setDate(d); setShowCal(false); }}
                  markedDays={markedDays}
                />
              </View>
            )}
          </ScrollView>

          {/* 시간 피커 — ScrollView 밖 (FlatList 중첩 경고 방지) */}
          <Text style={[styles.label, { alignSelf: 'flex-start' }]}>시간</Text>
          <View style={styles.pickerRow}>
            <ScrollPicker value={hour}   items={HOURS24} onChange={setHour}   label={labelHour} />
            <Text style={styles.colon}>:</Text>
            <ScrollPicker value={minute} items={MINUTES} onChange={setMinute} label={labelMin}  />
            <Text style={styles.timePreview}>
              {formatTime(new Date(2000, 0, 1, hour, minute))}
            </Text>
          </View>

          {/* 알람 방식 */}
          <Text style={[styles.label, { alignSelf: 'flex-start' }]}>🔔 알람</Text>
          <View style={styles.alarmModeRow}>
            {([
              { id: 'both',  label: '소리+진동' },
              { id: 'sound', label: '소리만' },
              { id: 'vibe',  label: '진동만' },
            ] as { id: AlarmMode; label: string }[]).map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.modePill, alarmMode === opt.id && styles.modePillOn]}
                onPress={() => setAlarmMode(opt.id)}
              >
                <Text style={[styles.modePillText, alarmMode === opt.id && styles.modePillTextOn]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 버튼 */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            {record && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteText}>삭제</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const pick = StyleSheet.create({
  wrap:      { flex: 1, height: PICK_H * 3, overflow: 'hidden', position: 'relative' },
  highlight: { position: 'absolute', top: PICK_H, left: 4, right: 4, height: PICK_H, backgroundColor: '#26263f', borderRadius: 10 },
  item:      { height: PICK_H, justifyContent: 'center', alignItems: 'center' },
  sel:       { fontSize: 28, color: '#f0f0ff', fontWeight: '700' },
  dim:       { fontSize: 18, color: '#44446a', fontWeight: '400' },
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#14142a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '90%',
    alignItems: 'center',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#33334a', marginBottom: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },

  label: { color: '#9bdcff', fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#1d1d38', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    color: '#f0f0ff', fontSize: 16, minHeight: 48,
  },
  micBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#1d1d38',
    alignItems: 'center', justifyContent: 'center',
  },
  micIcon: { fontSize: 22 },
  sttHint: { color: '#e05c5c', fontSize: 12, marginTop: 6, textAlign: 'center' },

  dateBtn: {
    backgroundColor: '#1d1d38', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dateBtnText:    { color: '#f0f0ff', fontSize: 16, fontWeight: '500' },
  dateBtnChevron: { color: '#9bdcff', fontSize: 12 },
  calBox:         { borderRadius: 12, marginTop: 8 },

  timeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  timeToggle:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  timeToggleLabel: { color: '#aaaacc', fontSize: 13 },

  pickerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a30', borderRadius: 16, paddingHorizontal: 8, marginTop: 6 },
  colon:       { color: '#f0f0ff', fontSize: 26, fontWeight: '700', paddingHorizontal: 2 },
  timePreview: { color: '#666680', fontSize: 11, marginLeft: 6, minWidth: 44 },

  alarmRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 14, paddingHorizontal: 4 },
  alarmLabel:   { color: '#f0f0ff', fontSize: 15, fontWeight: '600' },
  alarmModeRow: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 10 },
  modePill:     { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1d1d38', alignItems: 'center' },
  modePillOn:   { backgroundColor: '#e05c5c' },
  modePillText: { color: '#666680', fontSize: 13, fontWeight: '600' },
  modePillTextOn: { color: '#fff' },

  btnRow:    { flexDirection: 'row', gap: 10, width: '100%', marginTop: 18 },
  cancelBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: '#26263f', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#aaaacc', fontSize: 15, fontWeight: '600' },
  deleteBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: '#3a1620', alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#e06c6c', fontSize: 15, fontWeight: '600' },
  saveBtn:   { flex: 1.4, height: 52, borderRadius: 14, backgroundColor: '#e05c5c', alignItems: 'center', justifyContent: 'center' },
  saveText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});
