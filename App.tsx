import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  LogBox,
  Modal,
  SafeAreaView,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

LogBox.ignoreLogs(['VirtualizedLists should never be nested']);
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
  type TranscriptSegment,
} from './lib/storage';
import * as Notifications from 'expo-notifications';
import {
  cancelAlarm,
  cancelAlarmByRecordId,
  registerNotificationCategories,
  requestNotificationPermission,
  resyncAlarms,
  scheduleAlarm,
} from './lib/notifications';
import { C } from './lib/colors';
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

// ─── 일정 카드 ─────────────────────────────────────────────────────────────────
// 동시 재생 방지: 새 카드가 재생을 시작하면 이전 카드를 멈춤
let activeCardStopper: (() => void) | null = null;

function ScheduleCard({
  item,
  onPress,
  onAppend,
  showDate = false,
}: {
  item: ScheduleRecord;
  onPress: (r: ScheduleRecord) => void;
  onAppend: (r: ScheduleRecord) => void;
  showDate?: boolean;
}) {
  const player = useAudioPlayer(item.uri || undefined, { updateInterval: 100 });
  const [playing, setPlaying] = useState(false);
  const segEndRef = useRef<number | null>(null);

  // 범위선택 모드
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);

  const stopSelfRef = useRef<() => void>(() => {});
  stopSelfRef.current = () => {
    try { player.pause(); } catch {}
    segEndRef.current = null;
    setPlaying(false);
  };
  const stableStop = useRef(() => stopSelfRef.current()).current;

  const claimPlayback = () => {
    if (activeCardStopper && activeCardStopper !== stableStop) activeCardStopper();
    activeCardStopper = stableStop;
  };

  useEffect(() => () => {
    if (activeCardStopper === stableStop) activeCardStopper = null;
  }, []);

  const toggle = () => {
    segEndRef.current = null;
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      claimPlayback();
      // 일시정지 중이면 이어서, 처음/끝이면 처음부터
      const atEnd = player.duration > 0 && player.currentTime >= player.duration - 0.1;
      if (player.currentTime <= 0 || atEnd || !(player.duration > 0)) {
        player.seekTo(0);
      }
      player.play();
      setPlaying(true);
    }
  };

  const playSegment = (startMs: number, endMs: number) => {
    claimPlayback();
    segEndRef.current = endMs / 1000;
    player.seekTo(startMs / 1000);
    player.play();
    setPlaying(true);
  };

  useEffect(() => {
    if (segEndRef.current != null && player.currentTime >= segEndRef.current) {
      player.pause();
      segEndRef.current = null;
      setPlaying(false);
    } else if (player.duration > 0 && player.currentTime > 0 && player.currentTime >= player.duration - 0.1) {
      setPlaying(false);
    }
  }, [player.currentTime]);

  const onWordPress = (idx: number) => {
    if (!item.segments) return;
    if (rangeMode) {
      if (rangeAnchor === null) {
        setRangeAnchor(idx);
      } else {
        const startIdx = Math.min(rangeAnchor, idx);
        const endIdx = Math.max(rangeAnchor, idx);
        playSegment(item.segments[startIdx].startTimeMillis, item.segments[endIdx].endTimeMillis);
        setRangeAnchor(null);
        setRangeMode(false);
      }
    } else {
      playSegment(item.segments[idx].startTimeMillis, item.segments[idx].endTimeMillis);
    }
  };

  const onWordLongPress = (idx: number) => {
    if (!item.segments) return;
    setRangeMode(true);
    setRangeAnchor(idx);
  };

  const toggleRangeMode = () => {
    setRangeMode((m) => !m);
    setRangeAnchor(null);
  };

  const timeLabel = item.hasTime && item.scheduleAt ? formatTime(new Date(item.scheduleAt)) : '시간 미정';
  const title = item.content || item.transcript || '(내용 없음)';
  // 메모는 아래 별도 줄로 표시하므로 제목에서는 본문만 (중복 표시 방지)
  const mainTitle = title.split('\n• ')[0];
  const mode = (item as any).alarmMode as 'sound' | 'vibe' | 'both' | undefined;
  const isPast = item.scheduleAt != null && item.scheduleAt < Date.now();
  const hasSegments = !!(item.segments && item.segments.length > 0);
  const appendedNotes = (item.content || '').includes('\n• ')
    ? (item.content || '').split('\n• ').slice(1)
    : [];

  // 현재 재생 위치와 일치하는 단어(구간) 하이라이트
  const currentMs = player.currentTime * 1000;
  const activeSegIdx =
    hasSegments && playing
      ? item.segments!.findIndex((s) => currentMs >= s.startTimeMillis && currentMs < s.endTimeMillis)
      : -1;

  // 파형(고정 패턴, 재생 진행률에 따라 하이라이트)
  const WAVE_BARS = 28;
  const barHeights = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < item.id.length; i++) seed += item.id.charCodeAt(i);
    return Array.from({ length: WAVE_BARS }, (_, i) => {
      const v = Math.sin(seed + i * 12.9898) * 43758.5453;
      const frac = Math.abs(v - Math.floor(v));
      return 0.3 + frac * 0.7;
    });
  }, [item.id]);
  const progress = player.duration > 0 ? player.currentTime / player.duration : 0;

  const accentColor = mode === 'vibe' ? C.textSub : mode === 'both' ? C.accent : C.red;

  return (
    <TouchableOpacity
      style={[styles.card, isPast && styles.cardPast]}
      onPress={() => onPress(item)}
      activeOpacity={0.72}
    >
      <View style={styles.cardTimeCol}>
        <Text style={[styles.cardTime, isPast ? styles.cardTimePast : { color: accentColor }]}>
          {timeLabel}
        </Text>
        {showDate && item.scheduleAt ? (
          <Text style={styles.cardDateSub}>
            {new Date(item.scheduleAt).getMonth() + 1}월 {new Date(item.scheduleAt).getDate()}일
          </Text>
        ) : null}
      </View>

      <View style={[styles.cardDivider, { backgroundColor: accentColor }]} />

      <View style={styles.cardBody}>
        {hasSegments ? (
          <Text style={[styles.cardTitle, isPast && styles.cardTitlePast]}>
            {item.segments!.map((seg, idx) => (
              <Text
                key={idx}
                onPress={() => onWordPress(idx)}
                onLongPress={() => onWordLongPress(idx)}
                style={
                  rangeMode && rangeAnchor === idx
                    ? styles.wordHighlight
                    : idx === activeSegIdx
                    ? styles.wordPlaying
                    : undefined
                }
              >
                {seg.segment}{' '}
              </Text>
            ))}
          </Text>
        ) : (
          <Text style={[styles.cardTitle, isPast && styles.cardTitlePast]}>{mainTitle}</Text>
        )}
        {appendedNotes.map((note, i) => (
          <Text key={i} style={styles.cardAppendedNote}>+ {note}</Text>
        ))}

        {item.uri ? (
          <View style={styles.cardWaveform}>
            {barHeights.map((h, i) => {
              const filled = i / WAVE_BARS <= progress;
              return (
                <View
                  key={i}
                  style={[
                    styles.cardWaveBar,
                    { height: 4 + h * 18 },
                    filled && { backgroundColor: accentColor },
                  ]}
                />
              );
            })}
          </View>
        ) : null}

        {item.uri ? (
          <View style={styles.segControlRow}>
            {hasSegments ? (
              <TouchableOpacity
                style={[styles.rangeToggleBtn, rangeMode && styles.rangeToggleBtnOn]}
                onPress={toggleRangeMode}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.rangeToggleText, rangeMode && styles.rangeToggleTextOn]}>
                  {rangeMode ? (rangeAnchor === null ? '시작 단어 탭' : '끝 단어 탭') : '범위선택'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.segUnsupportedText}>
                이 기기는 OS 버전으로 인해 부분별 녹음 재생을 사용할 수 없습니다
              </Text>
            )}
          </View>
        ) : null}

        <View style={styles.cardBottomRow}>
          {mode ? (
            <View style={styles.cardBadgeRow}>
              {mode !== 'vibe' && <Text style={styles.cardBadgeIcon}>🔔</Text>}
              {mode !== 'sound' && (
                <Image
                  source={require('./assets/vibrate_icon.png')}
                  style={styles.cardBadgeVibe}
                />
              )}
            </View>
          ) : <View />}
          <TouchableOpacity
            style={styles.cardAppendBtn}
            onPress={() => onAppend(item)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.cardAppendBtnText}>＋ 추가</Text>
          </TouchableOpacity>
        </View>
      </View>

      {item.uri ? (
        <TouchableOpacity
          style={styles.cardPlayBtn}
          onPress={toggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.cardPlayIcon}>{playing ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── 전체 일정 탭 ──────────────────────────────────────────────────────────────
function AllSchedulesList({
  records,
  onPress,
  onAppend,
}: {
  records: ScheduleRecord[];
  onPress: (r: ScheduleRecord) => void;
  onAppend: (r: ScheduleRecord) => void;
}) {
  type Section = { title: string; date: Date; data: ScheduleRecord[] };

  const [searchOpen, setSearchOpen] = useState(false);
  const [yearStr, setYearStr] = useState('');
  const [monthStr, setMonthStr] = useState('');
  const [dayStr, setDayStr] = useState('');
  const [keyword, setKeyword] = useState('');
  const [combine, setCombine] = useState<'AND' | 'OR'>('AND');

  const activeFilters = useMemo(() => {
    const list: Array<(r: ScheduleRecord) => boolean> = [];
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const d = parseInt(dayStr, 10);
    const kw = keyword.trim();
    if (!isNaN(y)) list.push((r) => r.scheduleAt != null && new Date(r.scheduleAt).getFullYear() === y);
    if (!isNaN(m)) list.push((r) => r.scheduleAt != null && new Date(r.scheduleAt).getMonth() + 1 === m);
    if (!isNaN(d)) list.push((r) => r.scheduleAt != null && new Date(r.scheduleAt).getDate() === d);
    if (kw) list.push((r) => (r.content || r.transcript || '').includes(kw));
    return list;
  }, [yearStr, monthStr, dayStr, keyword]);

  const filteredRecords = useMemo(() => {
    if (activeFilters.length === 0) return records;
    return records.filter((r) =>
      combine === 'AND' ? activeFilters.every((f) => f(r)) : activeFilters.some((f) => f(r))
    );
  }, [records, activeFilters, combine]);

  const resetFilters = () => {
    setYearStr(''); setMonthStr(''); setDayStr(''); setKeyword('');
  };

  const sections: Section[] = useMemo(() => {
    const withDate = [...filteredRecords]
      .filter((r) => r.scheduleAt != null)
      .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));

    const groups = new Map<string, { date: Date; items: ScheduleRecord[] }>();
    for (const r of withDate) {
      const d = new Date(r.scheduleAt!);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups.has(key))
        groups.set(key, {
          date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          items: [],
        });
      groups.get(key)!.items.push(r);
    }

    const result: Section[] = Array.from(groups.values()).map(({ date, items }) => ({
      title: formatDayHeader(date),
      date,
      data: items,
    }));

    const undated = filteredRecords.filter((r) => r.scheduleAt == null);
    if (undated.length > 0) {
      result.push({ title: '날짜 미정', date: new Date(0), data: undated });
    }
    return result;
  }, [filteredRecords]);

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const hasActiveFilters = activeFilters.length > 0;

  const searchPanel = (
    <View style={styles.searchWrap}>
      <TouchableOpacity
        style={styles.searchToggle}
        onPress={() => setSearchOpen((s) => !s)}
        activeOpacity={0.75}
      >
        <Text style={styles.searchToggleText}>
          🔍 조회{hasActiveFilters ? ` · 조건 ${activeFilters.length}개` : ''}
        </Text>
        <Text style={styles.searchToggleChevron}>{searchOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {searchOpen && (
        <View style={styles.searchPanel}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInputSmall}
              value={yearStr}
              onChangeText={(t) => setYearStr(t.replace(/[^0-9]/g, ''))}
              placeholder="년(예: 2026)"
              placeholderTextColor={C.textDim}
              keyboardType="number-pad"
              maxLength={4}
            />
            <TextInput
              style={styles.searchInputTiny}
              value={monthStr}
              onChangeText={(t) => setMonthStr(t.replace(/[^0-9]/g, ''))}
              placeholder="월"
              placeholderTextColor={C.textDim}
              keyboardType="number-pad"
              maxLength={2}
            />
            <TextInput
              style={styles.searchInputTiny}
              value={dayStr}
              onChangeText={(t) => setDayStr(t.replace(/[^0-9]/g, ''))}
              placeholder="일"
              placeholderTextColor={C.textDim}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <TextInput
            style={styles.searchInputKeyword}
            value={keyword}
            onChangeText={setKeyword}
            placeholder="키워드 검색"
            placeholderTextColor={C.textDim}
          />
          <View style={styles.searchBottomRow}>
            {activeFilters.length >= 2 ? (
              <View style={styles.combineToggle}>
                <TouchableOpacity
                  style={[styles.combineBtn, combine === 'AND' && styles.combineBtnOn]}
                  onPress={() => setCombine('AND')}
                >
                  <Text style={[styles.combineBtnText, combine === 'AND' && styles.combineBtnTextOn]}>AND</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.combineBtn, combine === 'OR' && styles.combineBtnOn]}
                  onPress={() => setCombine('OR')}
                >
                  <Text style={[styles.combineBtnText, combine === 'OR' && styles.combineBtnTextOn]}>OR</Text>
                </TouchableOpacity>
              </View>
            ) : <View />}
            <TouchableOpacity onPress={resetFilters}>
              <Text style={styles.searchResetText}>초기화</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  if (sections.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        {searchPanel}
        <View style={styles.emptyAll}>
          <Text style={styles.emptyAllIcon}>📅</Text>
          <Text style={styles.emptyAllText}>
            {hasActiveFilters ? '조건에 맞는 일정이 없어요' : '등록된 일정이 없어요'}
          </Text>
          {!hasActiveFilters && (
            <Text style={styles.emptyAllSub}>🎙 버튼으로 음성으로 바로 추가해보세요</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {searchPanel}
      <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.allListContent}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => {
        const isToday = isSameDay(section.date, today);
        const isPast = section.date.getTime() < todayMidnight;
        return (
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionHeaderText,
                isToday && styles.sectionHeaderToday,
                isPast && styles.sectionHeaderPast,
              ]}
            >
              {section.title}
            </Text>
            {isToday && (
              <View style={styles.todayChip}>
                <Text style={styles.todayChipText}>오늘</Text>
              </View>
            )}
          </View>
        );
      }}
      renderItem={({ item }) => <ScheduleCard item={item} onPress={onPress} onAppend={onAppend} />}
      SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
      />
    </View>
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

  const [showRecorder, setShowRecorder] = useState(false);
  const [liveText, setLiveText] = useState('');
  const liveTextRef = useRef('');
  const liveSegmentsRef = useRef<TranscriptSegment[]>([]);
  // iOS STT는 중간에 세션이 끊겨 재시작됨 → 이전 세션 결과를 베이스로 누적
  const sttBaseTextRef = useRef('');
  const sttBaseSegsRef = useRef<TranscriptSegment[]>([]);
  const recordStartAtRef = useRef<number>(0);
  const sttOffsetMsRef = useRef<number>(0); // 현재 STT 세션 시작 시점의 녹음 경과(ms)
  const sttActiveRef = useRef(false);

  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleRecord | null>(null);
  const [appendMode, setAppendMode] = useState(false);
  const [calTapped, setCalTapped] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'all'>('calendar');

  // 알림 응답 핸들러가 최신 records를 참조할 수 있도록 ref 유지
  const recordsRef = useRef<ScheduleRecord[]>([]);
  useEffect(() => { recordsRef.current = records; }, [records]);

  // ── 초기화 ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const recs = loadRecords();
    recordsRef.current = recs;
    setRecords(recs);
    (async () => {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      const audio = await AudioModule.requestRecordingPermissionsAsync();
      const speech = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      await requestNotificationPermission();
      await registerNotificationCategories();
      // 삭제된 일정의 잔여 알림 정리 + iOS 64개 제한 대응 재등록
      await resyncAlarms(recs);
      setPermissionGranted(audio.granted && speech.granted);
      if (!audio.granted || !speech.granted) {
        Alert.alert('권한 필요', '마이크 및 음성 인식 권한이 모두 필요합니다.');
      }
    })();
  }, []);

  useEffect(() => {
    const handleResponse = async (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as any;
      const recordId: string | undefined = data?.recordId;
      if (!recordId) return;
      if (response.actionIdentifier === 'snooze') {
        // 스누즈: 남은 슬롯 취소 후 5분 뒤로 다시 예약
        await cancelAlarmByRecordId(recordId).catch(() => {});
        const rec = recordsRef.current.find((r) => r.id === recordId);
        const body = rec?.content || rec?.transcript || response.notification.request.content.body || '알람';
        await scheduleAlarm(recordId, body, new Date(Date.now() + 5 * 60 * 1000), rec?.alarmMode ?? 'both');
      } else {
        // 알람 끄기 버튼 / 알림 탭 / 스와이프 닫기 → 남은 재알림(+1/+2분) 취소
        cancelAlarmByRecordId(recordId).catch(() => {});
      }
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    // 앱이 종료된 상태에서 알림 버튼으로 실행된 경우의 응답 처리
    Notifications.getLastNotificationResponseAsync()
      .then((r) => { if (r) handleResponse(r); })
      .catch(() => {});
    return () => sub.remove();
  }, []);

  const liveParsed = useMemo(() => parseSchedule(liveText), [liveText]);
  const marked = useMemo(() => daysWithSchedules(records), [records]);
  const dayList = useMemo(() => {
    const all = schedulesOn(records, selectedDate);
    if (calTapped || !isSameDay(selectedDate, new Date())) return all;
    const now = Date.now();
    return all.filter((r) => !r.hasTime || (r.scheduleAt ?? 0) >= now);
  }, [records, selectedDate, calTapped, currentTime]);

  const nextSchedule = useMemo(() => {
    const now = Date.now();
    return records
      .filter((r) => r.hasTime && r.scheduleAt != null && r.scheduleAt >= now)
      .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0))[0] ?? null;
  }, [records, currentTime]);

  // ── STT ─────────────────────────────────────────────────────────────────────
  useSpeechRecognitionEvent('result', (e) => {
    // 편집기 STT 사용 중엔 메인 녹음 상태를 오염시키지 않도록 차단
    if (!sttActiveRef.current) return;
    const text = e.results[0]?.transcript ?? '';
    // 이전 세션 텍스트 + 현재 세션 텍스트 누적
    const combined = sttBaseTextRef.current
      ? sttBaseTextRef.current.trimEnd() + ' ' + text
      : text;
    setLiveText(combined);
    liveTextRef.current = combined;
    const segs = e.results[0]?.segments;
    if (segs && segs.length) {
      // 세션별 타임스탬프는 0부터 시작 → 녹음 기준 오프셋을 즉시 반영해 누적
      liveSegmentsRef.current = [
        ...sttBaseSegsRef.current,
        ...segs.map((s) => ({
          segment: s.segment,
          startTimeMillis: s.startTimeMillis + sttOffsetMsRef.current,
          endTimeMillis: s.endTimeMillis + sttOffsetMsRef.current,
        })),
      ];
    }
  });
  useSpeechRecognitionEvent('error', (e) => {
    const ignored = ['aborted', 'no-speech', 'audio-capture', 'network'];
    if (ignored.includes(e.error)) return;
    console.warn('STT 에러:', e.error, e.message);
  });
  useSpeechRecognitionEvent('end', () => {
    if (!sttActiveRef.current) return;
    // 세션 종료 → 지금까지 결과를 베이스로 확정하고 재시작
    sttBaseTextRef.current = liveTextRef.current;
    sttBaseSegsRef.current = liveSegmentsRef.current;
    setTimeout(() => {
      if (!sttActiveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
        sttOffsetMsRef.current = Date.now() - recordStartAtRef.current;
      } catch {}
    }, 200);
  });

  // ── 저장 헬퍼 ─────────────────────────────────────────────────────────────────
  const commit = (next: ScheduleRecord[]) => {
    setRecords(next);
    saveRecords(next);
  };

  // ── 녹음 ─────────────────────────────────────────────────────────────────────
  const startSTT = () => {
    sttActiveRef.current = true;
    const attempt = (n: number) => {
      if (!sttActiveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
        // STT 타임스탬프는 이 시점부터 0으로 시작 → 녹음 시작 시점과의 차이를 보정값으로 저장
        sttOffsetMsRef.current = Date.now() - recordStartAtRef.current;
      } catch {
        if (n < 3) setTimeout(() => attempt(n + 1), 400);
      }
    };
    setTimeout(() => attempt(0), 300);
  };

  const startRecording = async () => {
    if (!permissionGranted) {
      Alert.alert('권한 없음', '마이크 및 음성 인식 권한을 허용해주세요.');
      return;
    }
    setLiveText('');
    liveTextRef.current = '';
    liveSegmentsRef.current = [];
    sttBaseTextRef.current = '';
    sttBaseSegsRef.current = [];
    sttOffsetMsRef.current = 0;
    setShowRecorder(true);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordStartAtRef.current = Date.now();
    startSTT();
  };

  const cancelRecording = async () => {
    sttActiveRef.current = false;
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
    try { await recorder.stop(); } catch {}
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    setLiveText('');
    liveTextRef.current = '';
    setShowRecorder(false);
  };

  const stopRecording = async () => {
    sttActiveRef.current = false;
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    const uri = recorder.uri;
    const transcript = liveTextRef.current.trim();
    const durationSec = Math.round((recorderState.durationMillis ?? 0) / 1000);
    const parsed = parseSchedule(transcript);
    const recordedDate = (() => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    })();
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
        notifIds,
        // 세그먼트 타임스탬프는 result 핸들러에서 이미 녹음 기준으로 보정됨
        segments: liveSegmentsRef.current.length ? [...liveSegmentsRef.current] : undefined,
        alarmMode: 'both',
        createdAt: Date.now(),
      };
      commit([record, ...records]);
      setSelectedDate(recordedDate);
    };

    // 문장 끝의 명령형만 삭제 의도로 판단 ("…삭제해줘", "…지워 줘")
    // — "파일 삭제하기" 같은 일정 내용의 단어는 오탐하지 않도록
    const isDeleteIntent = /(삭제|지워|없애|제거)\s*(해\s*)?(줘|주세요|버려|해)?\s*$/.test(transcript);
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
            setSelectedDate(recordedDate);
          }},
        ]
      );
      return;
    }

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
            { text: '메모 추가', onPress: async () => {
              const appended = existing.content + (parsed.content ? '\n• ' + parsed.content : '');
              // 미래 알람이 있으면 알림 내용도 갱신
              let notifIds = existing.notifIds;
              if (existing.hasTime && existing.scheduleAt && existing.scheduleAt > Date.now()) {
                if (existing.notifIds?.length) await cancelAlarm(existing.notifIds);
                const ids = await scheduleAlarm(existing.id, appended, new Date(existing.scheduleAt), existing.alarmMode ?? 'both');
                notifIds = ids.length ? ids : undefined;
              }
              commit(records.map((r) =>
                r.id === existing.id ? { ...r, content: appended, notifIds } : r
              ));
              setSelectedDate(recordedDate);
            }},
            { text: '새 일정', onPress: saveAsNew },
          ]
        );
        return;
      }
    }

    await saveAsNew();
  };

  // ── 편집기 ────────────────────────────────────────────────────────────────────
  const openNew = () => { setEditing(null); setAppendMode(false); setEditorOpen(true); };
  const openEdit = (r: ScheduleRecord) => { setEditing(r); setAppendMode(false); setEditorOpen(true); };
  const openAppend = (r: ScheduleRecord) => { setEditing(r); setAppendMode(true); setEditorOpen(true); };

  const handleEditorSave = async (res: EditorResult) => {
    const display = formatDisplay(res.date, true, res.hasTime);
    const notifAt = res.hasTime && res.date.getTime() > Date.now() ? res.date : null;
    if (res.id) {
      const old = records.find((r) => r.id === res.id);
      if (old?.notifIds?.length) await cancelAlarm(old.notifIds);
      const newIds = notifAt ? await scheduleAlarm(res.id, res.content, notifAt, res.alarmMode) : [];
      const notifIds = newIds.length ? newIds : undefined;
      const next = records.map((r) =>
        r.id === res.id
          ? {
              ...r,
              content: res.content,
              scheduleAt: res.date.getTime(),
              scheduleDisplay: display,
              hasDate: true,
              hasTime: res.hasTime,
              notifIds,
              alarmMode: res.alarmMode,
              // 내용이 바뀌면 기존 단어별 타임스탬프는 무효 → 카드 표시도 새 내용으로
              segments: res.content.trim() !== (r.content ?? '').trim() ? undefined : r.segments,
            }
          : r
      );
      commit(next);
    } else {
      const id = Date.now().toString();
      const newIds = notifAt ? await scheduleAlarm(id, res.content, notifAt, res.alarmMode) : [];
      const notifIds = newIds.length ? newIds : undefined;
      const rec: ScheduleRecord = {
        id, uri: '', durationSec: 0, transcript: '',
        content: res.content, scheduleAt: res.date.getTime(), scheduleDisplay: display,
        hasDate: true, hasTime: res.hasTime, notifIds, alarmMode: res.alarmMode, createdAt: Date.now(),
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

  const handleEditorAppend = async (id: string, appendedText: string) => {
    const target = records.find((r) => r.id === id);
    if (!target) { setEditorOpen(false); return; }
    const newContent = (target.content ? target.content.trimEnd() + '\n• ' : '') + appendedText;
    // 미래 알람이 있으면 알림 내용도 갱신
    let notifIds = target.notifIds;
    if (target.hasTime && target.scheduleAt && target.scheduleAt > Date.now()) {
      if (target.notifIds?.length) await cancelAlarm(target.notifIds);
      const ids = await scheduleAlarm(id, newContent, new Date(target.scheduleAt), target.alarmMode ?? 'both');
      notifIds = ids.length ? ids : undefined;
    }
    commit(records.map((r) => (r.id === id ? { ...r, content: newContent, notifIds } : r)));
    setEditorOpen(false);
  };

  const elapsedSec = Math.floor((recorderState.durationMillis ?? 0) / 1000);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>말로</Text>
          {nextSchedule?.scheduleAt ? (
            <Text style={styles.nextLabel} numberOfLines={1}>
              다음 ·{' '}
              {formatDayHeader(new Date(nextSchedule.scheduleAt))}{' '}
              {formatTime(new Date(nextSchedule.scheduleAt))}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.clockText}>{formatTime(currentTime)}</Text>
          <TouchableOpacity style={styles.addCircleBtn} onPress={openNew} activeOpacity={0.75}>
            <Text style={styles.addCircleBtnText}>＋</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 탭 세그먼트 ── */}
      <View style={styles.segmentWrap}>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segTab, activeTab === 'calendar' && styles.segTabActive]}
            onPress={() => setActiveTab('calendar')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segTabText, activeTab === 'calendar' && styles.segTabTextActive]}>
              달력
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segTab, activeTab === 'all' && styles.segTabActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segTabText, activeTab === 'all' && styles.segTabTextActive]}>
              전체 일정
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 컨텐츠 ── */}
      {activeTab === 'calendar' ? (
        <>
          <Calendar
            selectedDate={selectedDate}
            onSelectDate={(d) => { setSelectedDate(d); setCalTapped(true); }}
            markedDays={marked}
          />

          <View style={styles.dayHeader}>
            <Text style={styles.dayHeaderText}>{formatDayHeader(selectedDate)}</Text>
            <Text style={styles.dayCount}>
              {dayList.length > 0 ? `${dayList.length}건` : ''}
            </Text>
          </View>

          <ScrollView
            style={styles.dayList}
            contentContainerStyle={styles.dayListContent}
            showsVerticalScrollIndicator={false}
          >
            {dayList.length === 0 ? (
              <View style={styles.emptyDay}>
                <Text style={styles.emptyDayText}>이 날은 일정이 없어요</Text>
              </View>
            ) : (
              dayList.map((item) => (
                <ScheduleCard key={item.id} item={item} onPress={openEdit} onAppend={openAppend} />
              ))
            )}
          </ScrollView>
        </>
      ) : (
        <View style={styles.allWrap}>
          <AllSchedulesList records={records} onPress={openEdit} onAppend={openAppend} />
        </View>
      )}

      {/* ── 녹음 FAB ── */}
      <View style={styles.fabWrap}>
        <TouchableOpacity style={styles.fab} onPress={startRecording} activeOpacity={0.85}>
          <Text style={styles.fabIcon}>🎙</Text>
        </TouchableOpacity>
      </View>

      {/* ── 편집기 ── */}
      <ScheduleEditor
        visible={editorOpen}
        record={editing}
        defaultDate={selectedDate}
        markedDays={marked}
        appendMode={appendMode}
        onSave={handleEditorSave}
        onAppend={handleEditorAppend}
        onDelete={handleEditorDelete}
        onClose={() => setEditorOpen(false)}
      />

      {/* ── 녹음 오버레이 ── */}
      <Modal visible={showRecorder} animationType="slide" transparent onRequestClose={cancelRecording}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>듣고 있어요</Text>
            <Waveform metering={recorderState.metering} isRecording={recorderState.isRecording} />
            <View style={styles.transcriptBox}>
              {liveText ? (
                <Text style={styles.transcriptText} numberOfLines={4}>{liveText}</Text>
              ) : (
                <Text style={styles.transcriptPlaceholder}>
                  말씀해보세요…{'\n'}예: "내일 오후 3시에 회의"
                </Text>
              )}
              {liveText ? (
                liveParsed.hasDate || liveParsed.hasTime ? (
                  <View style={styles.detectRow}>
                    <Text style={styles.detectOk}>✓ {liveParsed.display}</Text>
                    {liveParsed.content ? (
                      <Text style={styles.detectContent}>"{liveParsed.content}"</Text>
                    ) : null}
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
  container: { flex: 1, backgroundColor: C.bg },

  // 헤더
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10,
  },
  appName: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  nextLabel: { color: C.accent, fontSize: 12, fontWeight: '500', marginTop: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clockText: { color: C.textSub, fontSize: 18, fontWeight: '300', letterSpacing: 0.5 },
  addCircleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  addCircleBtnText: { color: C.text, fontSize: 22, fontWeight: '300', lineHeight: 26 },

  // 탭 세그먼트
  segmentWrap: { paddingHorizontal: 20, paddingBottom: 10 },
  segment: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 12, padding: 4,
  },
  segTab: {
    flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center',
  },
  segTabActive: { backgroundColor: C.surfaceHigh },
  segTabText: { color: C.textSub, fontSize: 14, fontWeight: '600' },
  segTabTextActive: { color: C.text },

  // 달력 탭
  dayHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8,
  },
  dayHeaderText: { color: C.text, fontSize: 17, fontWeight: '700' },
  dayCount: { color: C.textSub, fontSize: 13, fontWeight: '500' },
  dayList: { flex: 1 },
  dayListContent: { paddingHorizontal: 16, paddingBottom: 120 },
  emptyDay: { paddingTop: 48, alignItems: 'center' },
  emptyDayText: { color: C.textDim, fontSize: 15 },

  // 전체 일정 탭
  allWrap: { flex: 1 },
  allListContent: { paddingHorizontal: 16, paddingBottom: 120 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 20, paddingBottom: 8,
  },
  sectionHeaderText: { color: C.textSub, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  sectionHeaderToday: { color: C.text, fontSize: 14 },
  sectionHeaderPast: { color: C.textDim },
  todayChip: {
    backgroundColor: C.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  todayChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyAll: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyAllIcon: { fontSize: 40, marginBottom: 16 },
  emptyAllText: { color: C.textSub, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  emptyAllSub: { color: C.textDim, fontSize: 14, textAlign: 'center' },

  // 조회 패널
  searchWrap: { marginBottom: 4, paddingHorizontal: 16, paddingTop: 4 },
  searchToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: C.border,
  },
  searchToggleText: { color: C.text, fontSize: 14, fontWeight: '600' },
  searchToggleChevron: { color: C.textSub, fontSize: 11 },
  searchPanel: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14, marginTop: 6,
    borderWidth: 1, borderColor: C.border, gap: 10,
  },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInputSmall: {
    flex: 2, backgroundColor: C.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15,
  },
  searchInputTiny: {
    flex: 1, backgroundColor: C.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15, textAlign: 'center',
  },
  searchInputKeyword: {
    backgroundColor: C.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15,
  },
  searchBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  combineToggle: { flexDirection: 'row', backgroundColor: C.surfaceHigh, borderRadius: 8, padding: 3 },
  combineBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  combineBtnOn: { backgroundColor: C.accent },
  combineBtnText: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  combineBtnTextOn: { color: '#fff' },
  searchResetText: { color: C.textSub, fontSize: 13, fontWeight: '600' },

  // 일정 카드
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  cardPast: { opacity: 0.5 },
  cardTimeCol: { width: 68, justifyContent: 'center' },
  cardTime: { fontSize: 14, fontWeight: '700' },
  cardTimePast: { color: C.textSub },
  cardDateSub: { color: C.textSub, fontSize: 11, marginTop: 2 },
  cardDivider: { width: 3, height: 36, borderRadius: 2, marginRight: 14 },
  cardBody: { flex: 1 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '500', lineHeight: 22 },
  cardTitlePast: { color: C.textSub },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  cardBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardBadgeIcon: { fontSize: 12 },
  cardBadgeVibe: { width: 14, height: 14, resizeMode: 'contain', opacity: 0.75 },
  cardAppendBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, backgroundColor: C.surfaceHigh,
  },
  cardAppendBtnText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  cardAppendedNote: { color: C.textSub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  wordHighlight: { backgroundColor: C.accent, color: '#fff', borderRadius: 4 },
  wordPlaying: { backgroundColor: C.red, color: '#fff', borderRadius: 4 },
  cardWaveform: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 2,
    height: 24, marginTop: 8,
  },
  cardWaveBar: { width: 3, borderRadius: 1.5, backgroundColor: C.surfaceHigh },
  segControlRow: { marginTop: 8 },
  rangeToggleBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, backgroundColor: C.surfaceHigh,
  },
  rangeToggleBtnOn: { backgroundColor: C.accent },
  rangeToggleText: { color: C.textSub, fontSize: 11, fontWeight: '700' },
  rangeToggleTextOn: { color: '#fff' },
  segUnsupportedText: { color: C.textDim, fontSize: 11, lineHeight: 15 },
  cardPlayBtn: {
    width: 36, height: 36, marginLeft: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surfaceHigh, borderRadius: 18,
  },
  cardPlayIcon: { fontSize: 14, color: C.textSub },

  // FAB
  fabWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', paddingBottom: 36, pointerEvents: 'box-none',
  },
  fab: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.red, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  fabIcon: { fontSize: 28 },

  // 녹음 오버레이
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#13131F', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 44, alignItems: 'center',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 18 },
  sheetTitle: { color: C.red, fontSize: 15, fontWeight: '600', marginBottom: 16 },
  waveform: { flexDirection: 'row', alignItems: 'center', height: 56, gap: 3, marginBottom: 16 },
  bar: { width: 4, height: 48, borderRadius: 2, backgroundColor: C.red },
  transcriptBox: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, width: '100%',
    minHeight: 100, marginBottom: 16, justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  transcriptText: { color: C.text, fontSize: 20, fontWeight: '500', lineHeight: 28 },
  transcriptPlaceholder: { color: C.textDim, fontSize: 16, lineHeight: 24 },
  detectRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  detectOk: { color: C.green, fontSize: 15, fontWeight: '700' },
  detectContent: { color: C.textSub, fontSize: 14, marginTop: 4 },
  detectWait: { color: C.textSub, fontSize: 13, marginTop: 12 },
  timer: { color: C.red, fontSize: 26, fontWeight: '300', letterSpacing: 3, marginBottom: 20 },
  sheetBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1, height: 56, borderRadius: 16,
    backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  stopBtn: {
    flex: 2, height: 56, borderRadius: 16,
    backgroundColor: C.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  stopBtnIcon: { fontSize: 18 },
  stopBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
