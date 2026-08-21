import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Keyboard,
  LogBox,
  Modal,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from './components/ui/Text';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

LogBox.ignoreLogs(['VirtualizedLists should never be nested']);
import {
  AudioModule,
  setAudioModeAsync,
  useAudioPlayer,
} from 'expo-audio';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
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
  type AppendEntry,
  type ScheduleRecord,
} from './lib/storage';
import { useVoiceRecorder } from './lib/useVoiceRecorder';
import * as Notifications from 'expo-notifications';
import {
  cancelAlarm,
  cancelAlarmByRecordId,
  registerNotificationCategories,
  requestNotificationPermission,
  resyncAlarms,
  scheduleAlarm,
} from './lib/notifications';
import { ThemeProvider, useStyles, useTheme, type Theme } from './lib/theme';
import { copyRecords, exportRecordsPdf, exportRecordsTxt } from './lib/exportUtils';
import { Calendar } from './components/Calendar';
import { ScheduleDetail } from './components/ScheduleDetail';
import { ScheduleEditor, type AppendResult, type EditorResult } from './components/ScheduleEditor';
import { SegmentedControl } from './components/ui/SegmentedControl';

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 파형 ─────────────────────────────────────────────────────────────────────
const BAR_COUNT = 30;
function Waveform({ metering, isRecording }: { metering: number | undefined; isRecording: boolean }) {
  const styles = useStyles(makeStyles);
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
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const player = useAudioPlayer(item.uri || undefined, { updateInterval: 100 });
  const [playing, setPlaying] = useState(false);

  const stopSelfRef = useRef<() => void>(() => {});
  stopSelfRef.current = () => {
    try { player.pause(); } catch {}
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

  useEffect(() => {
    if (player.duration > 0 && player.currentTime > 0 && player.currentTime >= player.duration - 0.1) {
      setPlaying(false);
    }
  }, [player.currentTime]);

  const timeLabel = item.hasTime && item.scheduleAt ? formatTime(new Date(item.scheduleAt)) : '시간 미정';
  const title = item.content || item.transcript || '(내용 없음)';
  // 메모는 아래 별도 줄로 표시하므로 제목에서는 본문만 (중복 표시 방지)
  const mainTitle = title.split('\n• ')[0];
  const mode = (item as any).alarmMode as 'sound' | 'vibe' | 'both' | undefined;
  const isPast = item.scheduleAt != null && item.scheduleAt < Date.now();
  // 구버전 데이터 호환용 — 새 데이터는 appends[]를 사용
  const appendedNotes = (item.content || '').includes('\n• ')
    ? (item.content || '').split('\n• ').slice(1)
    : [];

  const accentColor = mode === 'vibe' ? t.c.textSub : mode === 'both' ? t.c.accent : t.c.red;

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
        <Text style={[styles.cardTitle, isPast && styles.cardTitlePast]}>{mainTitle}</Text>
        {appendedNotes.map((note, i) => (
          <Text key={i} style={styles.cardAppendedNote}>+ {note}</Text>
        ))}
        {item.appends && item.appends.length > 0 && (
          <Text style={styles.cardAppendedNote}>🎙 추가 {item.appends.length}건</Text>
        )}

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

  const styles = useStyles(makeStyles);
  const t = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [yearStr, setYearStr] = useState('');
  const [monthStr, setMonthStr] = useState('');
  const [dayStr, setDayStr] = useState('');
  const [keyword, setKeyword] = useState('');
  const [combine, setCombine] = useState<'AND' | 'OR'>('AND');
  // 조회 버튼을 눌렀을 때만 실제 필터로 반영
  const [applied, setApplied] = useState<{
    y: number | null; m: number | null; d: number | null; kw: string; combine: 'AND' | 'OR';
  } | null>(null);

  const activeFilters = useMemo(() => {
    const list: Array<(r: ScheduleRecord) => boolean> = [];
    if (!applied) return list;
    if (applied.y != null) list.push((r) => r.scheduleAt != null && new Date(r.scheduleAt).getFullYear() === applied.y);
    if (applied.m != null) list.push((r) => r.scheduleAt != null && new Date(r.scheduleAt).getMonth() + 1 === applied.m);
    if (applied.d != null) list.push((r) => r.scheduleAt != null && new Date(r.scheduleAt).getDate() === applied.d);
    if (applied.kw) list.push((r) => (r.content || r.transcript || '').includes(applied.kw));
    return list;
  }, [applied]);

  const filteredRecords = useMemo(() => {
    if (activeFilters.length === 0) return records;
    const mode = applied?.combine ?? 'AND';
    return records.filter((r) =>
      mode === 'AND' ? activeFilters.every((f) => f(r)) : activeFilters.some((f) => f(r))
    );
  }, [records, activeFilters, applied]);

  const runSearch = () => {
    Keyboard.dismiss();
    const yRaw = parseInt(yearStr, 10);
    // 2자리 연도(예: 26) → 2026
    const y = isNaN(yRaw) ? null : yRaw < 100 ? 2000 + yRaw : yRaw;
    const mRaw = parseInt(monthStr, 10);
    const m = isNaN(mRaw) || mRaw < 1 || mRaw > 12 ? null : mRaw;
    const dRaw = parseInt(dayStr, 10);
    const d = isNaN(dRaw) || dRaw < 1 || dRaw > 31 ? null : dRaw;
    const kw = keyword.trim();
    // 조건이 하나도 없으면 전체 보기
    if (y == null && m == null && d == null && !kw) {
      setApplied(null);
      return;
    }
    setApplied({ y, m, d, kw, combine });
  };

  const resetFilters = () => {
    setYearStr(''); setMonthStr(''); setDayStr(''); setKeyword('');
    setApplied(null);
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
          🔍 조회{hasActiveFilters ? ` · 결과 ${filteredRecords.length}건` : ''}
        </Text>
        <Text style={styles.searchToggleChevron}>{searchOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {searchOpen && (
        <View style={styles.searchPanel}>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <Text style={styles.searchFieldLabel}>년</Text>
              <TextInput
                style={styles.searchInput}
                value={yearStr}
                onChangeText={(t) => setYearStr(t.replace(/[^0-9]/g, ''))}
                placeholder="26"
                placeholderTextColor={t.c.textDim}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={styles.searchField}>
              <Text style={styles.searchFieldLabel}>월</Text>
              <TextInput
                style={styles.searchInput}
                value={monthStr}
                onChangeText={(t) => setMonthStr(t.replace(/[^0-9]/g, ''))}
                placeholder="7"
                placeholderTextColor={t.c.textDim}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={styles.searchField}>
              <Text style={styles.searchFieldLabel}>일</Text>
              <TextInput
                style={styles.searchInput}
                value={dayStr}
                onChangeText={(t) => setDayStr(t.replace(/[^0-9]/g, ''))}
                placeholder="15"
                placeholderTextColor={t.c.textDim}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
          </View>
          <TextInput
            style={styles.searchInputKeyword}
            value={keyword}
            onChangeText={setKeyword}
            placeholder="키워드 (예: 회의)"
            placeholderTextColor={t.c.textDim}
            returnKeyType="search"
            onSubmitEditing={runSearch}
          />
          <View style={styles.searchBottomRow}>
            <View style={styles.combineToggle}>
              <TouchableOpacity
                style={[styles.combineBtn, combine === 'AND' && styles.combineBtnOn]}
                onPress={() => setCombine('AND')}
              >
                <Text style={[styles.combineBtnText, combine === 'AND' && styles.combineBtnTextOn]}>모두 만족</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.combineBtn, combine === 'OR' && styles.combineBtnOn]}
                onPress={() => setCombine('OR')}
              >
                <Text style={[styles.combineBtnText, combine === 'OR' && styles.combineBtnTextOn]}>하나라도</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={resetFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.searchResetText}>초기화</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.searchRunBtn} onPress={runSearch} activeOpacity={0.85}>
            <Text style={styles.searchRunBtnText}>조회하기</Text>
          </TouchableOpacity>
          {/* 결과 내보내기 */}
          <View style={styles.searchExportRow}>
            <Text style={styles.searchExportLabel}>결과 {filteredRecords.length}건:</Text>
            <TouchableOpacity style={styles.searchExportBtn} onPress={() => copyRecords(filteredRecords)}>
              <Text style={styles.searchExportBtnText}>복사</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.searchExportBtn} onPress={() => exportRecordsTxt(filteredRecords)}>
              <Text style={styles.searchExportBtnText}>텍스트</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.searchExportBtn} onPress={() => exportRecordsPdf(filteredRecords)}>
              <Text style={styles.searchExportBtnText}>PDF</Text>
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
// useSafeAreaInsets()는 SafeAreaProvider의 자손 컴포넌트에서만 호출 가능하므로,
// Provider와 실제 컨텐츠를 분리한다.
// GestureHandlerRootView는 최상단에 있어야 제스처가 동작한다.
// ⚠️ RN Modal은 별도 뷰 계층이라 이 컨텍스트를 상속받지 못한다 —
//    Modal 안에서 제스처를 쓰려면 그 Modal 내부에도 따로 감싸야 한다.
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppInner />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppInner() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const voice = useVoiceRecorder();

  const [records, setRecords] = useState<ScheduleRecord[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  });

  const [showRecorder, setShowRecorder] = useState(false);

  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleRecord | null>(null);
  const [appendMode, setAppendMode] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
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

  const liveParsed = useMemo(() => parseSchedule(voice.liveText), [voice.liveText]);
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
    setShowRecorder(true);
    await voice.start();
  };

  const cancelRecording = async () => {
    await voice.cancel();
    setShowRecorder(false);
  };

  const stopRecording = async () => {
    const res = await voice.stop();
    setShowRecorder(false);
    const { uri, transcript, durationSec, segments: capturedSegments } = res;
    const parsed = parseSchedule(transcript);
    const recordedDate = (() => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    })();

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
        segments: capturedSegments.length ? [...capturedSegments] : undefined,
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
            for (const a of target.appends ?? []) if (a.uri) deleteAudio(a.uri);
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
            { text: '추가로 붙이기', onPress: async () => {
              // 메모가 아니라 메인과 동등한 독립 엔트리로 추가 — 자기 녹음/전사/구간재생을 그대로 보존
              const appendId = Date.now().toString();
              let savedUri = uri;
              try { savedUri = persistAudio(uri, `${existing.id}_a${appendId}`); }
              catch (e) { console.warn('추가 오디오 저장 실패:', e); }
              const newAppend: AppendEntry = {
                id: appendId, uri: savedUri, durationSec,
                transcript, content: parsed.content || transcript,
                segments: capturedSegments.length ? [...capturedSegments] : undefined,
                createdAt: Date.now(),
              };
              commit(records.map((r) =>
                r.id === existing.id ? { ...r, appends: [...(r.appends ?? []), newAppend] } : r
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

  // ── 상세/편집기 ───────────────────────────────────────────────────────────────
  // 카드 탭 → 상세 보기. 상세에서 수정/추가를 누르면 상세를 닫고 편집기로 전환
  // (iOS는 Modal을 동시에 두 개 띄울 수 없어 닫힘 애니메이션 후 열어야 함)
  const detailRecord = useMemo(
    () => records.find((r) => r.id === detailId) ?? null,
    [records, detailId]
  );
  const openDetail = (r: ScheduleRecord) => setDetailId(r.id);

  const openNew = () => { setEditing(null); setAppendMode(false); setEditorOpen(true); };
  const openEdit = (r: ScheduleRecord) => { setEditing(r); setAppendMode(false); setEditorOpen(true); };
  const openAppend = (r: ScheduleRecord) => { setEditing(r); setAppendMode(true); setEditorOpen(true); };

  const openEditFromDetail = (r: ScheduleRecord) => {
    setDetailId(null);
    setTimeout(() => openEdit(r), 450);
  };
  const openAppendFromDetail = (r: ScheduleRecord) => {
    setDetailId(null);
    setTimeout(() => openAppend(r), 450);
  };

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
    for (const a of target?.appends ?? []) if (a.uri) deleteAudio(a.uri);
    if (target?.notifIds?.length) await cancelAlarm(target.notifIds);
    commit(records.filter((r) => r.id !== id));
    setEditorOpen(false);
  };

  // "추가"는 메모가 아니라 메인과 동등한 독립 엔트리 — 자기 녹음/전사/구간재생을 갖고
  // appends[]에 쌓여 메인과 한 일정 아래 함께 표시·내보내기된다.
  const handleEditorAppend = (id: string, entry: AppendResult) => {
    const target = records.find((r) => r.id === id);
    if (!target) { setEditorOpen(false); return; }
    const appendId = Date.now().toString();
    let savedUri = entry.uri;
    if (entry.uri) {
      try { savedUri = persistAudio(entry.uri, `${id}_a${appendId}`); }
      catch (e) { console.warn('추가 오디오 저장 실패:', e); }
    }
    const newAppend: AppendEntry = {
      id: appendId, uri: savedUri, durationSec: entry.durationSec,
      transcript: entry.transcript, content: entry.content,
      segments: entry.segments, createdAt: Date.now(),
    };
    commit(records.map((r) =>
      r.id === id ? { ...r, appends: [...(r.appends ?? []), newAppend] } : r
    ));
    setEditorOpen(false);
  };

  const elapsedSec = Math.floor((voice.recorderState.durationMillis ?? 0) / 1000);
  const insets = useSafeAreaInsets();

  return (
    // 하단은 SafeAreaView에 맡기지 않고 FAB에서 직접 insets.bottom을 더함 —
    // absolute 포지션 FAB가 SafeAreaView의 padding 안에서 이중으로 계산되어
    // 기기별로 안전영역을 못 미치게 잡히는 경우가 있어 명시적으로 처리
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />

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
        <SegmentedControl
          options={[
            { value: 'calendar', label: '달력' },
            { value: 'all', label: '전체 일정' },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
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
                <ScheduleCard key={item.id} item={item} onPress={openDetail} onAppend={openAppend} />
              ))
            )}
          </ScrollView>
        </>
      ) : (
        <View style={styles.allWrap}>
          <AllSchedulesList records={records} onPress={openDetail} onAppend={openAppend} />
        </View>
      )}

      {/* ── 녹음 FAB ── */}
      <View style={[styles.fabWrap, { paddingBottom: 36 + insets.bottom }]}>
        <TouchableOpacity style={styles.fab} onPress={startRecording} activeOpacity={0.85}>
          <Text style={styles.fabIcon}>🎙</Text>
        </TouchableOpacity>
      </View>

      {/* ── 상세 보기 ── */}
      <ScheduleDetail
        visible={detailId != null}
        record={detailRecord}
        onClose={() => setDetailId(null)}
        onEdit={openEditFromDetail}
        onAppend={openAppendFromDetail}
      />

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
        <StatusBar style="light" />
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: 44 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>듣고 있어요</Text>
            <Waveform metering={voice.recorderState.metering} isRecording={voice.recorderState.isRecording} />
            <View style={styles.transcriptBox}>
              {voice.liveText ? (
                <Text style={styles.transcriptText} numberOfLines={4}>{voice.liveText}</Text>
              ) : (
                <Text style={styles.transcriptPlaceholder}>
                  말씀해보세요…{'\n'}예: "내일 오후 3시에 회의"
                </Text>
              )}
              {voice.liveText ? (
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

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.c.bg },

  // 헤더
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10,
  },
  appName: { color: t.c.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  nextLabel: { color: t.c.accent, fontSize: 12, fontWeight: '500', marginTop: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clockText: { color: t.c.textSub, fontSize: 18, fontWeight: '300', letterSpacing: 0.5 },
  addCircleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: t.c.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  addCircleBtnText: { color: t.c.text, fontSize: 22, fontWeight: '300', lineHeight: 26 },

  // 탭 세그먼트
  segmentWrap: { paddingHorizontal: 20, paddingBottom: 10 },
  // 달력 탭
  dayHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8,
  },
  dayHeaderText: { color: t.c.text, fontSize: 17, fontWeight: '700' },
  dayCount: { color: t.c.textSub, fontSize: 13, fontWeight: '500' },
  dayList: { flex: 1 },
  dayListContent: { paddingHorizontal: 16, paddingBottom: 120 },
  emptyDay: { paddingTop: 48, alignItems: 'center' },
  emptyDayText: { color: t.c.textDim, fontSize: 15 },

  // 전체 일정 탭
  allWrap: { flex: 1 },
  allListContent: { paddingHorizontal: 16, paddingBottom: 120 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 20, paddingBottom: 8,
  },
  sectionHeaderText: { color: t.c.textSub, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  sectionHeaderToday: { color: t.c.text, fontSize: 14 },
  sectionHeaderPast: { color: t.c.textDim },
  todayChip: {
    backgroundColor: t.c.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  todayChipText: { color: t.c.onAccent, fontSize: 11, fontWeight: '700' },
  emptyAll: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyAllIcon: { fontSize: 40, marginBottom: 16 },
  emptyAllText: { color: t.c.textSub, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  emptyAllSub: { color: t.c.textDim, fontSize: 14, textAlign: 'center' },

  // 조회 패널
  searchWrap: { marginBottom: 4, paddingHorizontal: 16, paddingTop: 4 },
  searchToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: t.c.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: t.c.border,
  },
  searchToggleText: { color: t.c.text, fontSize: 14, fontWeight: '600' },
  searchToggleChevron: { color: t.c.textSub, fontSize: 11 },
  searchPanel: {
    backgroundColor: t.c.surface, borderRadius: 12, padding: 14, marginTop: 6,
    borderWidth: 1, borderColor: t.c.border, gap: 10,
  },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchField: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: t.c.surfaceAlt, borderRadius: 10, paddingHorizontal: 10,
  },
  searchFieldLabel: { color: t.c.textSub, fontSize: 14, fontWeight: '600', marginRight: 6 },
  searchInput: {
    flex: 1, paddingVertical: 12, color: t.c.text, fontSize: 17, fontWeight: '600', textAlign: 'center',
  },
  searchInputKeyword: {
    backgroundColor: t.c.surfaceAlt, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, color: t.c.text, fontSize: 16,
  },
  searchBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  combineToggle: { flexDirection: 'row', backgroundColor: t.c.surfaceAlt, borderRadius: 8, padding: 3 },
  combineBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  combineBtnOn: { backgroundColor: t.c.accent },
  combineBtnText: { color: t.c.textSub, fontSize: 13, fontWeight: '700' },
  combineBtnTextOn: { color: t.c.onAccent },
  searchResetText: { color: t.c.textSub, fontSize: 14, fontWeight: '600' },
  searchRunBtn: {
    backgroundColor: t.c.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 2,
  },
  searchRunBtnText: { color: t.c.onAccent, fontSize: 16, fontWeight: '700' },
  searchExportRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  searchExportLabel: { color: t.c.textSub, fontSize: 13, fontWeight: '600', marginRight: 2 },
  searchExportBtn: {
    flex: 1, backgroundColor: t.c.surfaceAlt, borderRadius: 9,
    paddingVertical: 9, alignItems: 'center',
  },
  searchExportBtnText: { color: t.c.text, fontSize: 13, fontWeight: '600' },

  // 일정 카드
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: t.c.surface,
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1, borderColor: t.c.border,
  },
  cardPast: { opacity: 0.5 },
  cardTimeCol: { width: 68, justifyContent: 'center' },
  cardTime: { fontSize: 14, fontWeight: '700' },
  cardTimePast: { color: t.c.textSub },
  cardDateSub: { color: t.c.textSub, fontSize: 11, marginTop: 2 },
  cardDivider: { width: 3, height: 36, borderRadius: 2, marginRight: 14 },
  cardBody: { flex: 1 },
  cardTitle: { color: t.c.text, fontSize: 16, fontWeight: '500', lineHeight: 22 },
  cardTitlePast: { color: t.c.textSub },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  cardBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardBadgeIcon: { fontSize: 12 },
  cardBadgeVibe: { width: 14, height: 14, resizeMode: 'contain', opacity: 0.75 },
  cardAppendBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, backgroundColor: t.c.surfaceAlt,
  },
  cardAppendBtnText: { color: t.c.accent, fontSize: 12, fontWeight: '700' },
  cardAppendedNote: { color: t.c.textSub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardPlayBtn: {
    width: 36, height: 36, marginLeft: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.c.surfaceAlt, borderRadius: 18,
  },
  cardPlayIcon: { fontSize: 14, color: t.c.textSub },

  // FAB
  fabWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', paddingBottom: 36, pointerEvents: 'box-none',
  },
  fab: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: t.c.red,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: t.c.red, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  fabIcon: { fontSize: 28 },

  // 녹음 오버레이
  overlay: { flex: 1, backgroundColor: t.c.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: t.c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 44, alignItems: 'center',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: t.c.border, marginBottom: 18 },
  sheetTitle: { color: t.c.red, fontSize: 15, fontWeight: '600', marginBottom: 16 },
  waveform: { flexDirection: 'row', alignItems: 'center', height: 56, gap: 3, marginBottom: 16 },
  bar: { width: 4, height: 48, borderRadius: 2, backgroundColor: t.c.red },
  transcriptBox: {
    backgroundColor: t.c.surface, borderRadius: 16, padding: 16, width: '100%',
    minHeight: 100, marginBottom: 16, justifyContent: 'center',
    borderWidth: 1, borderColor: t.c.border,
  },
  transcriptText: { color: t.c.text, fontSize: 20, fontWeight: '500', lineHeight: 28 },
  transcriptPlaceholder: { color: t.c.textDim, fontSize: 16, lineHeight: 24 },
  detectRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: t.c.border, paddingTop: 10 },
  detectOk: { color: t.c.green, fontSize: 15, fontWeight: '700' },
  detectContent: { color: t.c.textSub, fontSize: 14, marginTop: 4 },
  detectWait: { color: t.c.textSub, fontSize: 13, marginTop: 12 },
  timer: { color: t.c.red, fontSize: 26, fontWeight: '300', letterSpacing: 3, marginBottom: 20 },
  sheetBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1, height: 56, borderRadius: 16,
    backgroundColor: t.c.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: t.c.textSub, fontSize: 16, fontWeight: '600' },
  stopBtn: {
    flex: 2, height: 56, borderRadius: 16,
    backgroundColor: t.c.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  stopBtnIcon: { fontSize: 18 },
  stopBtnText: { color: t.c.onAccent, fontSize: 16, fontWeight: '700' },
});
