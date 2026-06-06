import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { StatusBar } from 'expo-status-bar';

import { parseSchedule, formatDisplay } from './lib/parseSchedule';
import {
  daysWithSchedules,
  formatDayHeader,
  formatTime,
  isSameDay,
  schedulesOn,
} from './lib/dateUtils';
import {
  deleteAudio,
  loadRecords,
  persistAudio,
  saveRecords,
  type ScheduleRecord,
} from './lib/storage';
import * as Notifications from 'expo-notifications';
import {
  cancelAlarm,
  cancelAlarmByRecordId,
  registerNotificationCategories,
  requestNotificationPermission,
  scheduleAlarm,
} from './lib/notifications';
import { Calendar } from './components/Calendar';
import { ScheduleEditor, type EditorResult } from './components/ScheduleEditor';

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 파형 ─────────────────────────────────────────────────────────────────────
const BAR_COUNT = 30;
function Waveform({ metering, isRecording }: { metering: number | undefined; isRecording: boolean }) {
  const animValues = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15))
  ).current;
  const barsRef = useRef<number[]>(Array(BAR_COUNT).fill(0.15));

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      const meteringLevel =
        metering !== undefined ? Math.max(0, Math.min(1, (metering + 60) / 60)) : 0;
      const level = Math.min(1, meteringLevel + 0.15 + Math.random() * 0.15);
      barsRef.current = [...barsRef.current.slice(1), level];
      barsRef.current.forEach((v, i) => {
        Animated.spring(animValues[i], { toValue: v, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
      });
    }, 80);
    return () => clearInterval(timer);
  }, [isRecording, metering]);

  return (
    <View style={styles.waveform}>
      {animValues.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              transform: [{ scaleY: anim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }) }],
              opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── 하루 일정 행 (탭하면 편집) ───────────────────────────────────────────────
function DayRow({
  item,
  onPress,
}: {
  item: ScheduleRecord;
  onPress: (r: ScheduleRecord) => void;
}) {
  const player = useAudioPlayer(item.uri || undefined);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.seekTo(0);
      player.play();
      setPlaying(true);
    }
  };
  useEffect(() => {
    if (player.currentTime > 0 && player.currentTime >= player.duration - 0.1) setPlaying(false);
  }, [player.currentTime]);

  const timeLabel = item.hasTime && item.scheduleAt ? formatTime(new Date(item.scheduleAt)) : '시간 미정';
  const title = item.content || item.transcript || '(내용 없음)';

  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.timeCol}>
        <Text style={styles.rowTime}>{timeLabel}</Text>
      </View>
      <View style={styles.rowBar} />
      <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
      {item.uri ? (
        <TouchableOpacity style={styles.iconBtn} onPress={toggle}>
          <Text style={styles.iconBtnText}>{playing ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function App() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 50);

  const [records, setRecords] = useState<ScheduleRecord[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  });

  // 녹음 오버레이
  const [showRecorder, setShowRecorder] = useState(false);
  const [liveText, setLiveText] = useState('');
  const liveTextRef = useRef('');

  // 현재 시각 (매분 갱신)
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // 편집기
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleRecord | null>(null);
  // 달력 탭 여부 (탭하면 오늘 과거 일정도 표시)
  const [calTapped, setCalTapped] = useState(false);

  // ── 초기화 ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const audio = await AudioModule.requestRecordingPermissionsAsync();
      const speech = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      await requestNotificationPermission();
      await registerNotificationCategories();
      setPermissionGranted(audio.granted && speech.granted);
      if (!audio.granted || !speech.granted) {
        Alert.alert('권한 필요', '마이크 및 음성 인식 권한이 모두 필요합니다.');
      }
    })();
    setRecords(loadRecords());
  }, []);

  // 알림 액션(알람 끄기) 응답 → 나머지 슬롯 취소
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      const recordId: string | undefined = data?.recordId;
      if (recordId) cancelAlarmByRecordId(recordId).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const liveParsed = useMemo(() => parseSchedule(liveText), [liveText]);
  const marked = useMemo(() => daysWithSchedules(records), [records]);
  const dayList = useMemo(() => {
    const all = schedulesOn(records, selectedDate);
    // 오늘이 자동 선택(앱 실행)된 상태에서만 과거 일정 숨김
    // 달력에서 직접 탭하면(calTapped) 오늘이라도 전체 표시
    if (calTapped || !isSameDay(selectedDate, new Date())) return all;
    const now = Date.now();
    return all.filter((r) => !r.hasTime || (r.scheduleAt ?? 0) >= now);
  }, [records, selectedDate, calTapped]);

  // 다음 예정 일정 (헤더 표시용)
  const nextSchedule = useMemo(() => {
    const now = Date.now();
    return records
      .filter((r) => r.hasTime && r.scheduleAt != null && r.scheduleAt >= now)
      .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0))[0] ?? null;
  }, [records]);

  // ── STT ─────────────────────────────────────────────────────────────────────
  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results[0]?.transcript ?? '';
    setLiveText(text);
    liveTextRef.current = text;
  });
  useSpeechRecognitionEvent('error', (e) => {
    const ignored = ['aborted', 'no-speech', 'audio-capture', 'network'];
    if (ignored.includes(e.error)) return;
    console.warn('STT 에러:', e.error, e.message);
  });
  useSpeechRecognitionEvent('end', () => {
    if (recorderState.isRecording) {
      setTimeout(() => {
        if (recorderState.isRecording) {
          try { ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true }); } catch {}
        }
      }, 200);
    }
  });

  // ── 저장 헬퍼 ─────────────────────────────────────────────────────────────────
  const commit = (next: ScheduleRecord[]) => {
    setRecords(next);
    saveRecords(next);
  };

  // ── 녹음 ─────────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (!permissionGranted) {
      Alert.alert('권한 없음', '마이크 및 음성 인식 권한을 허용해주세요.');
      return;
    }
    setLiveText('');
    liveTextRef.current = '';
    setShowRecorder(true);
    await recorder.prepareToRecordAsync();
    recorder.record();
    try { ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true }); } catch {}
  };

  const cancelRecording = async () => {
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
    try { await recorder.stop(); } catch {}
    setLiveText('');
    liveTextRef.current = '';
    setShowRecorder(false);
  };

  const stopRecording = async () => {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    await recorder.stop();
    const uri = recorder.uri;
    const transcript = liveTextRef.current.trim();
    const durationSec = Math.round((recorderState.durationMillis ?? 0) / 1000);
    const parsed = parseSchedule(transcript);
    setShowRecorder(false);
    setLiveText('');
    liveTextRef.current = '';

    if (!uri) return;
    if (!transcript) {
      Alert.alert('인식 실패', '음성이 인식되지 않았어요. 다시 시도해주세요.');
      return;
    }
    if (!parsed.hasDate && !parsed.hasTime) {
      Alert.alert(
        '언제인지 알 수 없어요',
        `"${transcript}"\n\n날짜나 시간이 빠졌어요. "내일 오후 3시"처럼 시점을 포함해서 다시 말씀해주세요.`,
        [{ text: '확인' }]
      );
      return;
    }

    // B: 알림 등록 + 새 레코드 저장
    const saveAsNew = async () => {
      const id = Date.now().toString();
      let savedUri = uri!;
      try { savedUri = persistAudio(uri!, id); } catch (e) { console.warn('오디오 저장 실패:', e); }
      let notifIds: string[] | undefined;
      if (parsed.date && parsed.hasTime) {
        const ids = await scheduleAlarm(id, parsed.content || transcript, parsed.date);
        if (ids.length) notifIds = ids;
      }
      const record: ScheduleRecord = {
        id, uri: savedUri, durationSec, transcript,
        content: parsed.content,
        scheduleAt: parsed.date ? parsed.date.getTime() : null,
        scheduleDisplay: parsed.display,
        hasDate: parsed.hasDate, hasTime: parsed.hasTime,
        notifIds, createdAt: Date.now(),
      };
      commit([record, ...records]);
      if (parsed.date) {
        setSelectedDate(new Date(parsed.date.getFullYear(), parsed.date.getMonth(), parsed.date.getDate()));
      }
    };

    // A1: 삭제 의도 감지
    const DELETE_WORDS = ['삭제', '지워', '없애', '제거'];
    const isDeleteIntent = DELETE_WORDS.some((k) => transcript.includes(k));
    if (isDeleteIntent && parsed.date) {
      const targets = records.filter(
        (r) => r.scheduleAt != null && isSameDay(new Date(r.scheduleAt), parsed.date!)
      );
      if (targets.length === 0) {
        Alert.alert('삭제할 일정 없음', `${formatDayHeader(parsed.date)}에 일정이 없어요.`);
        return;
      }
      const target = parsed.hasTime
        ? targets.reduce((a, b) =>
            Math.abs((a.scheduleAt ?? 0) - parsed.date!.getTime()) <=
            Math.abs((b.scheduleAt ?? 0) - parsed.date!.getTime())
              ? a : b)
        : targets[0];
      const extras = targets.filter((r) => r.id !== target.id);
      const extrasStr = extras.length > 0
        ? '\n\n같은 날 다른 일정:\n' + extras.map((r) => `• ${r.content}`).join('\n')
        : '';
      Alert.alert(
        '일정 삭제',
        `삭제할 일정:\n"${target.content}"\n${target.scheduleDisplay}${extrasStr}`,
        [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => {
            if (target.uri) deleteAudio(target.uri);
            if (target.notifIds?.length) await cancelAlarm(target.notifIds);
            commit(records.filter((r) => r.id !== target.id));
            setSelectedDate(new Date(parsed.date!.getFullYear(), parsed.date!.getMonth(), parsed.date!.getDate()));
          }},
        ]
      );
      return;
    }

    // A2: 같은 시각(±5분) 기존 일정 → 메모 추가 / 새 일정 선택
    if (parsed.date && parsed.hasTime) {
      const MARGIN_MS = 5 * 60 * 1000;
      const existing = records.find(
        (r) => r.scheduleAt != null && Math.abs(r.scheduleAt - parsed.date!.getTime()) <= MARGIN_MS
      );
      if (existing) {
        Alert.alert(
          '비슷한 시간 일정이 있어요',
          `기존: "${existing.content}"\n${existing.scheduleDisplay}\n\n새로 인식:\n"${parsed.content}"`,
          [
            { text: '취소', style: 'cancel' },
            { text: '메모 추가', onPress: () => {
              const appended = existing.content + (parsed.content ? '\n• ' + parsed.content : '');
              const next = records.map((r) =>
                r.id === existing.id ? { ...r, content: appended } : r
              );
              commit(next);
              setSelectedDate(new Date(existing.scheduleAt!));
            }},
            { text: '새 일정', onPress: saveAsNew },
          ]
        );
        return;
      }
    }

    await saveAsNew();
  };

  // ── 편집기 저장/삭제 ──────────────────────────────────────────────────────────
  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (r: ScheduleRecord) => { setEditing(r); setEditorOpen(true); };

  const handleEditorSave = async (res: EditorResult) => {
    const display = formatDisplay(res.date, true, res.hasTime);
    const notifAt = res.hasTime && res.date.getTime() > Date.now() ? res.date : null;
    if (res.id) {
      // 수정: 기존 알림 취소 후 새로 등록
      const old = records.find((r) => r.id === res.id);
      if (old?.notifIds?.length) await cancelAlarm(old.notifIds);
      const newIds = notifAt ? await scheduleAlarm(res.id, res.content, notifAt) : [];
      const notifIds = newIds.length ? newIds : undefined;
      const next = records.map((r) =>
        r.id === res.id
          ? { ...r, content: res.content, scheduleAt: res.date.getTime(), scheduleDisplay: display, hasDate: true, hasTime: res.hasTime, notifIds }
          : r
      );
      commit(next);
    } else {
      // 수동 추가 (녹음 없음)
      const id = Date.now().toString();
      const newIds = notifAt ? await scheduleAlarm(id, res.content, notifAt) : [];
      const notifIds = newIds.length ? newIds : undefined;
      const rec: ScheduleRecord = {
        id, uri: '', durationSec: 0, transcript: '',
        content: res.content, scheduleAt: res.date.getTime(), scheduleDisplay: display,
        hasDate: true, hasTime: res.hasTime, notifIds, createdAt: Date.now(),
      };
      commit([rec, ...records]);
    }
    setSelectedDate(new Date(res.date.getFullYear(), res.date.getMonth(), res.date.getDate()));
    setEditorOpen(false);
  };

  const handleEditorDelete = async (id: string) => {
    const target = records.find((r) => r.id === id);
    if (target?.uri) deleteAudio(target.uri);
    if (target?.notifIds?.length) await cancelAlarm(target.notifIds);
    commit(records.filter((r) => r.id !== id));
    setEditorOpen(false);
  };

  const elapsedSec = Math.floor((recorderState.durationMillis ?? 0) / 1000);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>말로</Text>
          {nextSchedule?.scheduleAt ? (
            <Text style={styles.nextLabel} numberOfLines={1}>
              예정: {formatDayHeader(new Date(nextSchedule.scheduleAt))} {formatTime(new Date(nextSchedule.scheduleAt))}
            </Text>
          ) : null}
        </View>
        <Text style={styles.clockLabel}>{formatTime(currentTime)}</Text>
      </View>

      {/* 달력 */}
      <Calendar
        selectedDate={selectedDate}
        onSelectDate={(d) => { setSelectedDate(d); setCalTapped(true); }}
        markedDays={marked}
      />

      {/* 선택일 헤더 + 추가 */}
      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderText}>{formatDayHeader(selectedDate)}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>＋ 추가</Text>
        </TouchableOpacity>
      </View>

      {/* 선택일 일정 목록 */}
      <ScrollView style={styles.dayList} contentContainerStyle={{ paddingBottom: 120 }}>
        {dayList.length === 0 ? (
          <Text style={styles.empty}>이 날은 일정이 없어요</Text>
        ) : (
          dayList.map((item) => <DayRow key={item.id} item={item} onPress={openEdit} />)
        )}
      </ScrollView>

      {/* 녹음 FAB */}
      <TouchableOpacity style={styles.fab} onPress={startRecording} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>🎙</Text>
      </TouchableOpacity>

      {/* 편집기 */}
      <ScheduleEditor
        visible={editorOpen}
        record={editing}
        defaultDate={selectedDate}
        markedDays={marked}
        onSave={handleEditorSave}
        onDelete={handleEditorDelete}
        onClose={() => setEditorOpen(false)}
      />

      {/* 녹음 오버레이 */}
      <Modal visible={showRecorder} animationType="slide" transparent onRequestClose={cancelRecording}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>듣고 있어요</Text>
            <Waveform metering={recorderState.metering} isRecording={recorderState.isRecording} />
            <View style={styles.transcriptBox}>
              {liveText ? (
                <Text style={styles.transcriptText} numberOfLines={4}>{liveText}</Text>
              ) : (
                <Text style={styles.transcriptPlaceholder}>말씀해보세요…{'\n'}예: "내일 오후 3시에 회의"</Text>
              )}
              {liveText ? (
                liveParsed.hasDate || liveParsed.hasTime ? (
                  <View style={styles.detectRow}>
                    <Text style={styles.detectOk}>✓ {liveParsed.display}</Text>
                    {liveParsed.content ? <Text style={styles.detectContent}>“{liveParsed.content}”</Text> : null}
                  </View>
                ) : (
                  <Text style={styles.detectWait}>⏳ 날짜·시간을 기다리는 중…</Text>
                )
              ) : null}
            </View>
            <Text style={styles.timer}>{formatDuration(elapsedSec)}</Text>
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelRecording}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                <Text style={styles.stopBtnIcon}>⏹</Text>
                <Text style={styles.stopBtnText}>완료</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b1c' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 6,
  },
  headerLeft: { flex: 1, gap: 2 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  nextLabel: { color: '#9bdcff', fontSize: 12, fontWeight: '500' },
  clockLabel: { color: '#f0f0ff', fontSize: 22, fontWeight: '300', letterSpacing: 1 },

  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, marginTop: 6, marginBottom: 6,
  },
  dayHeaderText: { color: '#f0f0ff', fontSize: 17, fontWeight: '700' },
  addBtn: { backgroundColor: '#1d1d38', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText: { color: '#9bdcff', fontSize: 14, fontWeight: '600' },

  dayList: { flex: 1, paddingHorizontal: 20, marginTop: 4 },
  empty: { color: '#444460', fontSize: 14, textAlign: 'center', marginTop: 30 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#15152a', borderRadius: 14, padding: 14, marginBottom: 8,
  },
  timeCol: { width: 76 },
  rowTime: { color: '#9bdcff', fontSize: 14, fontWeight: '600' },
  rowBar: { width: 3, height: 32, borderRadius: 2, backgroundColor: '#e05c5c', marginRight: 12 },
  rowTitle: { flex: 1, color: '#f0f0ff', fontSize: 16, fontWeight: '500', lineHeight: 22 },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  iconBtnText: { fontSize: 16 },

  fab: {
    position: 'absolute', right: 24, bottom: 32,
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#e05c5c',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabIcon: { fontSize: 28 },

  // 녹음 오버레이
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#14142a', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40, alignItems: 'center',
  },
  sheetTitle: { color: '#e05c5c', fontSize: 15, fontWeight: '600', marginBottom: 16 },
  waveform: { flexDirection: 'row', alignItems: 'center', height: 56, gap: 3, marginBottom: 16 },
  bar: { width: 4, height: 48, borderRadius: 2, backgroundColor: '#e05c5c' },
  transcriptBox: {
    backgroundColor: '#1d1d38', borderRadius: 14, padding: 16, width: '100%',
    minHeight: 100, marginBottom: 16, justifyContent: 'center',
  },
  transcriptText: { color: '#f0f0ff', fontSize: 20, fontWeight: '500', lineHeight: 28 },
  transcriptPlaceholder: { color: '#55557a', fontSize: 16, lineHeight: 24 },
  detectRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#2a2a45', paddingTop: 10 },
  detectOk: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  detectContent: { color: '#aaaacc', fontSize: 14, marginTop: 4 },
  detectWait: { color: '#888', fontSize: 13, marginTop: 12 },
  timer: { color: '#e05c5c', fontSize: 26, fontWeight: '300', letterSpacing: 3, marginBottom: 20 },
  sheetBtns: { flexDirection: 'row', gap: 14, width: '100%' },
  cancelBtn: { flex: 1, height: 56, borderRadius: 16, backgroundColor: '#26263f', alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: '#aaaacc', fontSize: 16, fontWeight: '600' },
  stopBtn: { flex: 2, height: 56, borderRadius: 16, backgroundColor: '#e05c5c', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  stopBtnIcon: { fontSize: 18 },
  stopBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
