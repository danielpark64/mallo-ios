import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  SafeAreaView,
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

import { parseSchedule } from './lib/parseSchedule';
import {
  deleteAudio,
  loadRecords,
  persistAudio,
  saveRecords,
  type ScheduleRecord,
} from './lib/storage';

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 파형 컴포넌트 ────────────────────────────────────────────────────────────
const BAR_COUNT = 30;

function Waveform({ metering, isRecording }: { metering: number | undefined; isRecording: boolean }) {
  const barsRef = useRef<number[]>(Array(BAR_COUNT).fill(0.15));
  const animValues = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15))
  ).current;

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      const meteringLevel =
        metering !== undefined ? Math.max(0, Math.min(1, (metering + 60) / 60)) : 0;
      const idle = 0.15 + Math.random() * 0.15;
      const level = Math.min(1, meteringLevel + idle);
      barsRef.current = [...barsRef.current.slice(1), level];
      barsRef.current.forEach((v, i) => {
        Animated.spring(animValues[i], {
          toValue: v,
          useNativeDriver: true,
          speed: 50,
          bounciness: 0,
        }).start();
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
              transform: [
                {
                  scaleY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.1, 1],
                  }),
                },
              ],
              opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── 일정 아이템 ──────────────────────────────────────────────────────────────
function ScheduleItem({
  item,
  onDelete,
}: {
  item: ScheduleRecord;
  onDelete: (id: string) => void;
}) {
  const player = useAudioPlayer(item.uri);
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
    if (player.currentTime > 0 && player.currentTime >= player.duration - 0.1) {
      setPlaying(false);
    }
  }, [player.currentTime]);

  const title = item.content || item.transcript || '(내용 없음)';

  return (
    <View style={styles.item}>
      <View style={styles.itemInfo}>
        {item.scheduleDisplay ? (
          <Text style={styles.itemSchedule}>📅 {item.scheduleDisplay}</Text>
        ) : (
          <Text style={styles.itemNoSchedule}>날짜·시간 없음</Text>
        )}
        <Text style={styles.itemTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.itemMeta}>
          {formatDuration(item.durationSec)} ·{' '}
          {new Date(item.createdAt).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      <TouchableOpacity style={styles.playBtn} onPress={toggle}>
        <Text style={styles.playBtnText}>{playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item.id)}>
        <Text style={styles.deleteBtnText}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 메인 앱 ──────────────────────────────────────────────────────────────────
export default function App() {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 50);
  const [records, setRecords] = useState<ScheduleRecord[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [liveText, setLiveText] = useState('');
  const countRef = useRef(1);
  const liveTextRef = useRef('');

  // ── 초기화: 권한 + 저장된 일정 로드 ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const audio = await AudioModule.requestRecordingPermissionsAsync();
      const speech = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setPermissionGranted(audio.granted && speech.granted);
      if (!audio.granted || !speech.granted) {
        Alert.alert('권한 필요', '마이크 및 음성 인식 권한이 모두 필요합니다.');
      }
    })();
    setRecords(loadRecords());
  }, []);

  // ── 실시간 파싱 (말하는 중 날짜·시간/내용 추출) ──────────────────────────────
  const liveParsed = useMemo(() => parseSchedule(liveText), [liveText]);

  // ── STT 이벤트 ────────────────────────────────────────────────────────────
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
          try {
            ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
          } catch {}
        }
      }, 200);
    }
  });

  // ── 녹음 시작 ─────────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (!permissionGranted) {
      Alert.alert('권한 없음', '마이크 및 음성 인식 권한을 허용해주세요.');
      return;
    }
    setLiveText('');
    liveTextRef.current = '';

    await recorder.prepareToRecordAsync();
    recorder.record();

    try {
      ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
    } catch {}
  };

  // ── 녹음 중지 + 파싱 + 저장 ─────────────────────────────────────────────────
  const stopRecording = async () => {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    await recorder.stop();

    const uri = recorder.uri;
    if (!uri) return;

    const transcript = liveTextRef.current.trim();
    const durationSec = Math.round((recorderState.durationMillis ?? 0) / 1000);
    const parsed = parseSchedule(transcript);

    // 날짜·시간이 전혀 없으면 저장하지 않고 경고
    if (transcript && !parsed.hasDate && !parsed.hasTime) {
      Alert.alert(
        '언제인지 알 수 없어요',
        `"${transcript}"\n\n날짜나 시간이 빠졌어요. "내일 오후 3시"처럼 시점을 포함해서 다시 말씀해주세요.`,
        [{ text: '다시 녹음', style: 'destructive' }]
      );
      return;
    }
    // STT가 아무것도 못 잡은 경우
    if (!transcript) {
      Alert.alert('인식 실패', '음성이 인식되지 않았어요. 다시 시도해주세요.');
      return;
    }

    const id = Date.now().toString();
    let savedUri = uri;
    try {
      savedUri = persistAudio(uri, id);
    } catch (e) {
      console.warn('오디오 저장 실패:', e);
    }

    const record: ScheduleRecord = {
      id,
      uri: savedUri,
      durationSec,
      transcript,
      content: parsed.content,
      scheduleAt: parsed.date ? parsed.date.getTime() : null,
      scheduleDisplay: parsed.display,
      hasDate: parsed.hasDate,
      hasTime: parsed.hasTime,
      createdAt: Date.now(),
    };

    setRecords((prev) => {
      const next = [record, ...prev];
      saveRecords(next);
      return next;
    });
    countRef.current += 1;
    setLiveText('');
    liveTextRef.current = '';
  };

  const deleteRecord = (id: string) => {
    setRecords((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) deleteAudio(target.uri);
      const next = prev.filter((r) => r.id !== id);
      saveRecords(next);
      return next;
    });
  };

  // 일정 시각 순 정렬 (날짜 있는 것 먼저, 가까운 순)
  const sorted = useMemo(() => {
    return [...records].sort((a, b) => {
      if (a.scheduleAt && b.scheduleAt) return a.scheduleAt - b.scheduleAt;
      if (a.scheduleAt) return -1;
      if (b.scheduleAt) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [records]);

  const isRecording = recorderState.isRecording;
  const elapsedSec = Math.floor((recorderState.durationMillis ?? 0) / 1000);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>말로</Text>
      <Text style={styles.subtitle}>음성으로 기록하다</Text>

      {/* ── 녹음 섹션 ── */}
      <View style={styles.recordSection}>
        {isRecording && (
          <Waveform metering={recorderState.metering} isRecording={isRecording} />
        )}

        {/* 실시간 STT 텍스트 + 파싱 결과 */}
        {isRecording && (
          <View style={styles.transcriptBox}>
            {liveText ? (
              <Text style={styles.transcriptText} numberOfLines={4}>
                {liveText}
              </Text>
            ) : (
              <Text style={styles.transcriptPlaceholder}>
                말씀해보세요…{'\n'}예: "내일 오후 3시에 회의"
              </Text>
            )}

            {/* 날짜·시간 인식 실시간 배지 */}
            {liveText ? (
              liveParsed.hasDate || liveParsed.hasTime ? (
                <View style={styles.detectRow}>
                  <Text style={styles.detectOk}>✓ {liveParsed.display}</Text>
                  {liveParsed.content ? (
                    <Text style={styles.detectContent}>“{liveParsed.content}”</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.detectWait}>⏳ 날짜·시간을 기다리는 중…</Text>
              )
            ) : null}
          </View>
        )}

        {isRecording && <Text style={styles.timer}>{formatDuration(elapsedSec)}</Text>}

        <TouchableOpacity
          style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <Text style={styles.recordBtnIcon}>{isRecording ? '⏹' : '🎙'}</Text>
          <Text style={styles.recordBtnLabel}>{isRecording ? '녹음 중지' : '녹음 시작'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── 일정 목록 ── */}
      <View style={styles.listSection}>
        <Text style={styles.listTitle}>
          일정{records.length > 0 ? ` (${records.length})` : ''}
        </Text>
        {records.length === 0 ? (
          <Text style={styles.empty}>아직 기록된 일정이 없습니다</Text>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ScheduleItem item={item} onDelete={deleteRecord} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b1c' },
  title: { color: '#fff', fontSize: 32, fontWeight: '700', textAlign: 'center', marginTop: 24 },
  subtitle: { color: '#666680', fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 24 },

  recordSection: { alignItems: 'center', paddingHorizontal: 20, marginBottom: 28 },

  waveform: { flexDirection: 'row', alignItems: 'center', height: 60, gap: 3, marginBottom: 12 },
  bar: { width: 4, height: 50, borderRadius: 2, backgroundColor: '#e05c5c' },

  transcriptBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    minHeight: 96,
    marginBottom: 12,
    justifyContent: 'center',
  },
  transcriptText: { color: '#f0f0ff', fontSize: 20, fontWeight: '500', lineHeight: 28 },
  transcriptPlaceholder: { color: '#55557a', fontSize: 16, lineHeight: 24 },
  detectRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#2a2a40', paddingTop: 10 },
  detectOk: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  detectContent: { color: '#aaaacc', fontSize: 14, marginTop: 4 },
  detectWait: { color: '#888', fontSize: 13, marginTop: 12 },

  timer: { color: '#e05c5c', fontSize: 28, fontWeight: '300', letterSpacing: 3, marginBottom: 16 },

  recordBtn: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1e1e36',
    borderWidth: 2,
    borderColor: '#3a3a60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnActive: { borderColor: '#e05c5c', backgroundColor: '#2a1520' },
  recordBtnIcon: { fontSize: 34, marginBottom: 4 },
  recordBtnLabel: { color: '#aaaacc', fontSize: 12 },

  listSection: { flex: 1, paddingHorizontal: 20 },
  listTitle: {
    color: '#666680',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  empty: { color: '#444460', fontSize: 14, textAlign: 'center', marginTop: 40 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemInfo: { flex: 1 },
  itemSchedule: { color: '#7dd3fc', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  itemNoSchedule: { color: '#888', fontSize: 12, marginBottom: 4 },
  itemTitle: { color: '#f0f0ff', fontSize: 16, fontWeight: '500' },
  itemMeta: { color: '#666680', fontSize: 12, marginTop: 4 },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a4a',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  playBtnText: { fontSize: 16 },
  deleteBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  deleteBtnText: { fontSize: 18 },
});
