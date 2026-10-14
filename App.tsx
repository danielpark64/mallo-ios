import { installCrashLogger } from './lib/crashLog';
installCrashLogger();
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Keyboard, LogBox, Modal, ScrollView, SectionList, StyleSheet, TextInput, TouchableOpacity, View, AppState } from 'react-native';
import { Text } from './components/AppText';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

LogBox.ignoreLogs(['VirtualizedLists should never be nested']);
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { StatusBar } from 'expo-status-bar';

import { parseSchedule, formatDisplay } from './lib/parseSchedule';
import { recordedAtStamp } from './lib/autoDate';
import {
  dayKey,
  daysWithSchedules,
  endOfMonth,
  endOfWeek,
  formatDayHeader,
  formatMonthLabel,
  formatTime,
  formatWeekLabel,
  groupByDay,
  isSameDay,
  schedulesBetween,
  startOfMonth,
  startOfWeek,
  type DaySection,
  daysWithPreAlarms, isPreAlarmItem, mergePreAlarms, preAlarmItems, collapsePast, PAST_PAGE,
  type DayListItem, type DayListSection,
} from './lib/dateUtils';
import { loadPrefs, savePrefs, type CalendarMode } from './lib/prefs';
import { normalizeRemind, parsePreRecordId } from './lib/reminders';
import { setNativeAlarmLabels } from './lib/nativeAlarm';
import { LanguageProvider, useT } from './lib/i18n';
import {
  EMPTY_FILTER,
  describePeriod,
  filterRecords,
  isFilterActive,
  type PeriodPreset,
  type RecordFilter,
} from './lib/filterRecords';
import {
  deleteAudio,
  loadRecords,
  persistAudio,
  saveRecords,
  type AppendEntry,
  type ScheduleRecord,
} from './lib/storage';
import { useVoiceRecorder } from './lib/useVoiceRecorder';
import { NO_FILE_NOTICE } from './lib/voiceCapture';
import * as Notifications from 'expo-notifications';
import {
  cancelAlarm, cancelAlarmGroup,
  cancelAlarmByRecordId,
  registerAndroidChannels,
  registerNotificationCategories,
  requestNotificationPermission,
  resyncAlarms,
  scheduleAlarm,
} from './lib/notifications';
import { SharedPlayerProvider, useSharedPlayer } from './lib/sharedPlayer';
import { removeVoiceAlarm, setVoiceAlarmDefault, voiceAlarmOn, voiceAlarmToStore, voiceUriOf } from './lib/voiceAlarm';
import { ThemeProvider, useFontScale, useResolvedTheme, useTheme, type Palette } from './lib/theme';
import { copyRecords } from './lib/exportUtils';
import { Calendar, type DateRange } from './components/Calendar';
import { ExportPreview, type ExportKind } from './components/ExportPreview';
import { FilterSheet } from './components/FilterSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { MicIcon } from './components/MicIcon';
import { PromoBanner } from './components/PromoBanner';
import { Waveform, formatDuration } from './components/Waveform';
import { ScheduleCard } from './components/ScheduleCard';
import { PreAlarmRow } from './components/PreAlarmRow';
import { ScheduleDetail } from './components/ScheduleDetail';
import { ScheduleEditor, type AppendResult, type EditorResult } from './components/ScheduleEditor';



// ─── 전체 일정 탭 ──────────────────────────────────────────────────────────────
// 검색창 + 기간 칩(전체/오늘/이번 주/이번 달/직접 선택)으로 바로 걸러진다. "조회하기" 버튼 없음.
function AllSchedulesList({
  records,
  onPress,
  onAppend,
  onFixDate,
  onLongPress,
}: {
  records: ScheduleRecord[];
  onPress: (r: ScheduleRecord) => void;
  onAppend: (r: ScheduleRecord) => void;
  onFixDate: (r: ScheduleRecord) => void;
  onLongPress?: (r: ScheduleRecord) => void;
}) {
  const C = useTheme();
  const { t, lang } = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { scale: fontScale } = useFontScale();
  const [filter, setFilter] = useState<RecordFilter>(EMPTY_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preview, setPreview] = useState<ExportKind | null>(null);

  const filtered = useMemo(() => filterRecords(records, filter), [records, filter]);
  const allSections = useMemo(() => groupByDay(filtered), [filtered, lang]);
  // 검색·기간 조건이 없을 때는 지난 일정을 접어 다음 일정이 맨 위에 오게 한다
  // 지난 일정은 30건씩 최근 것부터 연다 (수천 건을 한 번에 펼치지 않는다)
  const [pastShown, setPastShown] = useState(0);
  const collapsed = useMemo(() => collapsePast(allSections, Date.now(), pastShown), [allSections, pastShown]);
  const collapsing = !isFilterActive(filter) && collapsed.hiddenCount > 0;
  const sections = isFilterActive(filter) ? allSections : collapsed.sections;
  // 복사/내보내기는 화면과 같은 순서(날짜순, 날짜 미정은 맨 뒤)로
  const exportList = useMemo(() => allSections.flatMap((sec) => sec.data), [allSections]);
  const active = isFilterActive(filter);

  // 직접 선택 휠의 연도 후보: 일정이 있는 해 ± 1년 (올해 포함)
  const yearChoices = useMemo(() => {
    const now = new Date().getFullYear();
    const ys = records.filter((r) => r.scheduleAt != null).map((r) => new Date(r.scheduleAt!).getFullYear());
    const min = Math.min(now, ...ys) - 1;
    const max = Math.max(now, ...ys) + 1;
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }, [records]);

  const choosePreset = (p: PeriodPreset) => {
    Keyboard.dismiss();
    if (p === 'custom') { setSheetOpen(true); return; }
    setFilter((f) => ({ ...f, preset: p }));
  };

  const chips: { key: PeriodPreset; label: string }[] = [
    { key: 'all', label: t('전체') },
    { key: 'today', label: t('오늘') },
    { key: 'week', label: t('이번 주') },
    { key: 'month', label: t('이번 달') },
    { key: 'custom', label: filter.preset === 'custom' ? `${describePeriod(filter)} ▾` : t('기간 선택 ▾') },
  ];

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const header = (
    <View style={styles.filterWrap}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { fontSize: 16 * fontScale }]}
          value={filter.keyword}
          onChangeText={(t) => setFilter((f) => ({ ...f, keyword: t }))}
          placeholder={t('내용으로 찾기')}
          placeholderTextColor={C.textDim}
          returnKeyType="search"
          accessibilityLabel={t('일정 검색')}
        />
        {filter.keyword ? (
          <TouchableOpacity
            onPress={() => setFilter((f) => ({ ...f, keyword: '' }))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('검색어 지우기')}
          >
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {chips.map((c) => {
          const on = filter.preset === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => choosePreset(c.key)}
              activeOpacity={0.8}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.resultRow}>
        <Text style={styles.resultText}>{active ? t('결과 {n}건', { n: filtered.length }) : t('전체 {n}건', { n: filtered.length })}</Text>
        <View style={styles.resultActions}>
          {active && (
            <TouchableOpacity onPress={() => setFilter(EMPTY_FILTER)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.resultReset}>{t('초기화')}</Text>
            </TouchableOpacity>
          )}
          {filtered.length > 0 && (
            <>
              <TouchableOpacity style={styles.resultBtn} onPress={() => copyRecords(exportList)}>
                <Text style={styles.resultBtnText}>{t('복사')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resultBtn} onPress={() => setPreview('txt')}>
                <Text style={styles.resultBtnText}>{t('텍스트')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resultBtn} onPress={() => setPreview('pdf')}>
                <Text style={styles.resultBtnText}>PDF</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.allListContent}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {header}
            {!isFilterActive(filter) && collapsed.pastCount > 0 && (
              <View style={styles.pastToggleRow}>
                {collapsed.hiddenCount > 0 && (
                  <TouchableOpacity style={[styles.pastToggle, { flex: 1 }]} onPress={() => setPastShown((n) => n + PAST_PAGE)} activeOpacity={0.7} accessibilityLabel={t('지난 일정 보기')}>
                    <Text style={styles.pastToggleText}>
                      {pastShown === 0
                        ? t('지난 일정 {n}건 보기 ▾', { n: collapsed.pastCount })
                        : t('더 이전 일정 보기 ({n}건 남음) ▾', { n: collapsed.hiddenCount })}
                    </Text>
                  </TouchableOpacity>
                )}
                {pastShown > 0 && (
                  <TouchableOpacity style={[styles.pastToggle, { flex: 1 }]} onPress={() => setPastShown(0)} activeOpacity={0.7} accessibilityLabel={t('지난 일정 접기')}>
                    <Text style={styles.pastToggleText}>{t('지난 일정 접기 ▴')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyAll}>
            <Text style={styles.emptyAllIcon}>📅</Text>
            <Text style={styles.emptyAllText}>{active ? t('조건에 맞는 일정이 없어요') : collapsing ? t('앞으로 올 일정이 없어요') : t('등록된 일정이 없어요')}</Text>
            {!active && <Text style={styles.emptyAllSub}>{t('아래 마이크 버튼으로 말해서 바로 추가해보세요')}</Text>}
          </View>
        }
        renderSectionHeader={({ section }) => {
          const isToday = isSameDay(section.date, today);
          const isPast = section.date.getTime() < todayMidnight;
          return (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeaderText, isToday && styles.sectionHeaderToday, isPast && styles.sectionHeaderPast]}>
                {section.title}
              </Text>
              {isToday && (
                <View style={styles.todayChip}>
                  <Text style={styles.todayChipText}>{t('오늘')}</Text>
                </View>
              )}
            </View>
          );
        }}
        renderItem={({ item }) => <ScheduleCard item={item} onPress={onPress} onAppend={onAppend} onFixDate={onFixDate} onLongPress={onLongPress} />}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListFooterComponent={<PromoBanner />}
      />

      <FilterSheet
        visible={sheetOpen}
        value={filter}
        yearChoices={yearChoices}
        onApply={(v) => {
          const anySet = v.year != null || v.month != null || v.day != null;
          setFilter((f) => ({ ...f, ...v, preset: anySet ? 'custom' : 'all' }));
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
      <ExportPreview visible={preview != null} kind={preview ?? 'txt'} records={exportList} onClose={() => setPreview(null)} />
    </View>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
// useSafeAreaInsets()는 SafeAreaProvider의 자손 컴포넌트에서만 호출 가능하므로,
// Provider와 실제 컨텐츠를 분리한다.
export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <SharedPlayerProvider>
          <SafeAreaProvider>
            <AppInner />
          </SafeAreaProvider>
        </SharedPlayerProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

function AppInner() {
  const C = useTheme();
  const { t, lang } = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const resolvedTheme = useResolvedTheme();
  // 앱 언어가 정해지거나 바뀌면 알림 버튼(워치 포함)·Android 채널 이름·네이티브 울림 화면 글자를 그 언어로 맞춘다
  useEffect(() => {
    registerNotificationCategories().catch(() => {});
    registerAndroidChannels().catch(() => {});
    setNativeAlarmLabels({ stop: t('알람 끄기'), snooze: t('5분 후 다시'), ringing: t('알람이 울리는 중'), app: t('세이람') });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  const { scale: fontScale } = useFontScale();
  const bigText = fontScale >= 1.3;
  // 헤더 시계 자리: 제목·시계·버튼의 실제 폭을 재서 한 줄에 들어가면 오른쪽에, 모자라면 제목 아래로 자동 이동
  const [headerW, setHeaderW] = useState(0);
  const [titleW, setTitleW] = useState(0);
  const [clockW, setClockW] = useState(0);
  const [btnsW, setBtnsW] = useState(0);
  const [nextW, setNextW] = useState(0); // "다음 · …" 줄의 자연 폭 — 시계에 밀려 잘리지 않게 같이 본다
  const HEADER_GAPS = 12 + 8 + 12; // 시계-버튼 간격, 왼쪽 블록 여백, 여유
  const leftW = Math.max(titleW, nextW);
  const clockBelow = headerW > 0 && leftW > 0 && clockW > 0 && btnsW > 0
    && leftW + clockW + btnsW + HEADER_GAPS > headerW;
  const voice = useVoiceRecorder();

  const [records, setRecords] = useState<ScheduleRecord[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  });

  const [showRecorder, setShowRecorder] = useState(false);
  const sharedPlayer = useSharedPlayer();

  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    // 앱이 앞에 있을 때만, 분이 바뀌는 순간에 맞춰 1분에 한 번 갱신
    // (Android는 백그라운드에서도 JS 타이머가 돌아 배터리를 쓴다 / 고정 60초 간격이면 최대 59초 늦게 바뀐다)
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      setCurrentTime(new Date());
      timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    };
    const start = () => { if (!timer) timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50); };
    const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
    start();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') { setCurrentTime(new Date()); start(); } else stop();
    });
    return () => { stop(); sub.remove(); };
  }, []);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleRecord | null>(null);
  const [appendMode, setAppendMode] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'all'>('calendar');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 달력 보기(월/주)는 사용자가 고른 값을 저장해 다음 실행에도 유지
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(() => loadPrefs().calendarMode);
  // 첫 렌더부터 목록이 채워지도록 초기 기간을 미리 계산 (Calendar가 곧 같은 값을 통지한다)
  const [visibleRange, setVisibleRange] = useState<DateRange>(() => {
    const n = new Date();
    const t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return loadPrefs().calendarMode === 'week'
      ? { start: startOfWeek(t), end: endOfWeek(t) }
      : { start: startOfMonth(t), end: endOfMonth(t) };
  });
  const periodListRef = useRef<SectionList<DayListItem, DayListSection>>(null);
  // scrollToLocation이 아직 렌더 안 된 섹션 때문에 실패하면 대략 위치로 옮긴 뒤 한 번 더 시도
  const pendingScrollRef = useRef<number | null>(null);

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
      await registerAndroidChannels(); // Android 전용(모드별 소리/진동 채널), iOS는 no-op
      await registerNotificationCategories();
      // 삭제된 일정의 잔여 알림 정리 + iOS 64개 제한 대응 재등록
      await resyncAlarms(recs);
      setPermissionGranted(audio.granted && speech.granted);
      if (!audio.granted || !speech.granted) {
        Alert.alert(t('권한 필요'), t('마이크 및 음성 인식 권한이 모두 필요합니다.'));
      }
    })();
  }, []);

  useEffect(() => {
    const handleResponse = async (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as any;
      const recordId: string | undefined = data?.recordId;
      if (!recordId) return;
      const pre = parsePreRecordId(recordId);
      if (pre) {
        // 미리 알림(한 번짜리): 끄기/닫기는 할 일 없음, 5분 뒤 다시는 같은 문구로 한 번만
        await cancelAlarmByRecordId(recordId).catch(() => {});
        if (response.actionIdentifier === 'snooze') {
          const rec = recordsRef.current.find((r) => r.id === pre.recordId);
          const body = response.notification.request.content.body || rec?.content || t('미리 알림');
          await scheduleAlarm(recordId, body, new Date(Date.now() + 5 * 60 * 1000), rec?.alarmMode ?? 'both', { single: true, voiceUri: voiceUriOf(rec) });
        }
        return;
      }
      if (response.actionIdentifier === 'snooze') {
        // 스누즈: 남은 슬롯 취소 후 5분 뒤로 다시 예약
        await cancelAlarmByRecordId(recordId).catch(() => {});
        const rec = recordsRef.current.find((r) => r.id === recordId);
        const body = rec?.content || rec?.transcript || response.notification.request.content.body || t('알람');
        await scheduleAlarm(recordId, body, new Date(Date.now() + 5 * 60 * 1000), rec?.alarmMode ?? 'both', { voiceUri: voiceUriOf(rec) });
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
  // 달력에 보이는 달/주의 일정 전부를 날짜별로 묶어 아래 목록에 보여준다
  const preMarked = useMemo(() => daysWithPreAlarms(records), [records]);
  const periodSections = useMemo(
    () => mergePreAlarms(
      groupByDay(schedulesBetween(records, visibleRange.start, visibleRange.end)),
      preAlarmItems(records, visibleRange.start, visibleRange.end),
    ),
    [records, visibleRange, lang],
  );
  const periodCount = periodSections.reduce((n, sec) => n + sec.data.filter((x) => !isPreAlarmItem(x)).length, 0);
  const [showPastPeriod, setShowPastPeriod] = useState(false);
  const periodCollapsed = useMemo(() => collapsePast(periodSections), [periodSections]);
  const periodListSections = showPastPeriod || periodCollapsed.pastCount === 0 ? periodSections : periodCollapsed.sections;
  const periodLabel =
    calendarMode === 'week'
      ? formatWeekLabel(visibleRange.start)
      : formatMonthLabel(visibleRange.start.getFullYear(), visibleRange.start.getMonth());

  const handleCalendarMode = (m: CalendarMode) => {
    setCalendarMode(m);
    savePrefs({ calendarMode: m });
  };
  // 새 일정의 기본 미리 알림(설정). 일정에는 저장 시점 값이 확정돼 들어간다
  const [defaultRemind, setDefaultRemind] = useState<number[]>(() => loadPrefs().defaultRemind);
  const handleDefaultRemind = (list: number[]) => {
    const next = normalizeRemind(list);
    setDefaultRemind(next);
    savePrefs({ defaultRemind: next });
  };
  // [VOICE_ALARM] 보류된 기능 (lib/voiceAlarm.ts 스위치로 꺼짐)
  // 새 일정의 알람 소리 기본값(설정): 꺼짐 = 기본 알람음, 켜짐 = 내 목소리
  const [defaultVoice, setDefaultVoice] = useState<boolean>(() => { const on = loadPrefs().voiceAlarm; setVoiceAlarmDefault(on); return on; });
  const handleDefaultVoice = (on: boolean) => {
    setVoiceAlarmDefault(on);
    setDefaultVoice(on);
    savePrefs({ voiceAlarm: on });
    // 설정은 모든 일정에 적용된다(일정마다 따로 정한 것 제외) → 이미 걸린 알람도 새 소리로 다시 건다
    resyncAlarms(recordsRef.current).catch(() => {});
  };

  const scrollToSection = useCallback((idx: number) => {
    pendingScrollRef.current = idx;
    try {
      periodListRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewOffset: 8, animated: true });
    } catch {}
  }, []);

  // 달력에서 날짜를 누르면 그 날짜(없으면 그 다음 날짜)의 묶음으로 목록을 스크롤.
  // 보이는 기간 밖 날짜("오늘로" 등)는 기간이 바뀌며 목록이 통째로 교체되므로 맨 위로만 올린다.
  const handleSelectDate = useCallback((d: Date) => {
    setSelectedDate(d);
    const t = d.getTime();
    if (t < visibleRange.start.getTime() || t > visibleRange.end.getTime() + 86_400_000) {
      pendingScrollRef.current = null;
      try { periodListRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewOffset: 9999, animated: false }); } catch {}
      return;
    }
    const key = dayKey(d);
    let idx = periodListSections.findIndex((sec) => sec.key === key);
    if (idx < 0) idx = periodListSections.findIndex((sec) => sec.date.getTime() >= t);
    if (idx < 0) return;
    scrollToSection(idx);
  }, [periodListSections, visibleRange, scrollToSection]);

  const nextSchedule = useMemo(() => {
    const now = Date.now();
    return records
      .filter((r) => !r.needsDate && r.hasTime && r.scheduleAt != null && r.scheduleAt >= now)
      .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0))[0] ?? null;
  }, [records, currentTime]);

  // ── 저장 헬퍼 ─────────────────────────────────────────────────────────────────
  const commit = (next: ScheduleRecord[]) => {
    setRecords(next);
    saveRecords(next);
  };

  // ── 녹음 ─────────────────────────────────────────────────────────────────────
  const recordStartedAtRef = useRef<Date>(new Date());
  const startRecording = async () => {
    if (!permissionGranted) {
      Alert.alert(t('권한 없음'), t('마이크 및 음성 인식 권한을 허용해주세요.'));
      return;
    }
    sharedPlayer.stop(); // 카드 재생 소리가 녹음에 섞이지 않게
    recordStartedAtRef.current = new Date(); // 날짜를 말하지 않았을 때 이 시각으로 저장한다
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

    if (!uri && voice.fileRecording) {
      Alert.alert(t('녹음 실패'), t('녹음 파일이 만들어지지 않았어요. 다시 시도해주세요.'));
      return;
    }
    // Android 12 이하는 녹음 파일 없이 글만 저장(uri '') — lib/voiceCapture.ts
    const keepAudio = (key: string): string => {
      if (!uri) return '';
      try { return persistAudio(uri, key); } catch (e) { console.warn('오디오 저장 실패:', e); return uri; }
    };
    if (!transcript) {
      Alert.alert(t('인식 실패'), t('음성이 인식되지 않았어요. 다시 시도해주세요.'));
      return;
    }
    // 날짜·시간을 한마디도 안 했으면 녹음을 버리지 않고 녹음 시작 시각으로 저장 + "정하기" 꼬리표(알람 없음).
    // 다시 녹음시키면 방금 말한 내용이 사라지고, 현재 시각으로 알람을 걸면 말한 적 없는 알람이 울린다.
    // 삭제 의도("…지워줘")는 날짜가 필요하므로 아래 삭제 분기 전에 여기서 걸러지지 않게 둔다.
    const isDeleteIntentEarly = /(삭제|지워|없애|제거)\s*(해\s*)?(줘|주세요|버려|해)?\s*$/.test(transcript);
    if (!parsed.hasDate && !parsed.hasTime && !isDeleteIntentEarly) {
      // 자정을 넘겨 멈췄으면 오늘 날짜로(어제로 저장되면 곧바로 지난 일정으로 접혀 사라진 것처럼 보인다)
      const started = recordStartedAtRef.current;
      const auto = recordedAtStamp(isSameDay(started, new Date()) ? started : new Date());
      const id = Date.now().toString();
      const uri = keepAudio(id);
      const record: ScheduleRecord = {
        id, uri, durationSec, transcript,
        content: parsed.content || transcript,
        scheduleAt: auto.date.getTime(), scheduleDisplay: auto.display,
        hasDate: auto.hasDate, hasTime: auto.hasTime, needsDate: true,
        segments: capturedSegments.length ? [...capturedSegments] : undefined,
        alarmMode: 'both', createdAt: Date.now(),
      };
      commit([record, ...records]);
      setSelectedDate(recordedDate);
      return;
    }
    if (!parsed.hasDate && !parsed.hasTime) {
      Alert.alert(t('삭제할 일정을 못 찾았어요'), t('"{text}"\n\n어느 날 일정을 지울지 날짜를 함께 말씀해주세요.', { text: transcript }), [{ text: t('확인') }]);
      return;
    }

    const saveAsNew = async () => {
      const id = Date.now().toString();
      const savedUri = keepAudio(id);
      let notifIds: string[] | undefined;
      const remindBefore = normalizeRemind(parsed.remindBefore ?? defaultRemind);
      if (parsed.date && parsed.hasTime) {
        const ids = await scheduleAlarm(id, parsed.content || transcript, parsed.date, 'both', { remindBefore, voiceUri: voiceUriOf({ uri: savedUri, alarmMode: 'both' }) });
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
        remindBefore,
        exactAlarm: true,
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
        Alert.alert(t('삭제할 일정 없음'), t('{day}에 일정이 없어요.', { day: formatDayHeader(parsed.date) }));
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
        ? '\n\n' + t('같은 날 다른 일정:') + '\n' + extras.map((r) => `• ${r.content}`).join('\n')
        : '';
      Alert.alert(
        t('일정 삭제'),
        t('삭제할 일정:\n"{content}"\n{when}', { content: target.content, when: target.scheduleDisplay }) + extrasStr,
        [
          { text: t('취소'), style: 'cancel' },
          { text: t('삭제'), style: 'destructive', onPress: async () => {
            sharedPlayer.stop();
            removeVoiceAlarm(target.id);
            if (target.uri) deleteAudio(target.uri);
            for (const a of target.appends ?? []) if (a.uri) deleteAudio(a.uri);
            await cancelAlarmGroup(target.id, target.notifIds);
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
        // 날짜를 안 정한 녹음(녹음 시각으로 저장)은 비교 대상이 아니다 — 거기 붙이면 새 알람이 안 걸린다
        (r) => !r.needsDate && r.scheduleAt != null && Math.abs(r.scheduleAt - parsed.date!.getTime()) <= MARGIN_MS
      );
      if (existing) {
        Alert.alert(
          t('비슷한 시간 일정이 있어요'),
          t('기존: "{old}"\n{when}\n\n새로 인식:\n"{new}"', { old: existing.content, when: existing.scheduleDisplay, new: parsed.content }),
          [
            { text: t('취소'), style: 'cancel' },
            { text: t('추가로 붙이기'), onPress: async () => {
              // 메모가 아니라 메인과 동등한 독립 엔트리로 추가 — 자기 녹음/전사/구간재생을 그대로 보존
              const appendId = Date.now().toString();
              const newAppend: AppendEntry = {
                id: appendId, uri: keepAudio(`${existing.id}_a${appendId}`), durationSec,
                transcript, content: parsed.content || transcript,
                segments: capturedSegments.length ? [...capturedSegments] : undefined,
                createdAt: Date.now(),
              };
              commit(records.map((r) =>
                r.id === existing.id ? { ...r, appends: [...(r.appends ?? []), newAppend] } : r
              ));
              setSelectedDate(recordedDate);
            }},
            { text: t('새 일정'), onPress: saveAsNew },
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
  // 상세의 "＋ 내용 추가"도 고치기·덧붙이기·알림을 한 번에 하는 수정 화면으로 연다(덧붙이기는 그 화면의 말하기 막대)
  const openAppendFromDetail = (r: ScheduleRecord) => {
    setDetailId(null);
    setTimeout(() => openEdit(r), 450);
  };

  // 상세 화면의 알림 칩: 즉시 저장하고 두 경로(네이티브·Expo) 알람을 다시 건다
  const handleAlarmChange = async (rec: ScheduleRecord, remindBefore: number[], exactAlarm: boolean, voiceOn: boolean = voiceAlarmOn(rec)) => {
    const voiceAlarm = voiceAlarmToStore(voiceOn);
    await cancelAlarmGroup(rec.id, rec.notifIds);
    const at = rec.scheduleAt != null && rec.hasTime ? new Date(rec.scheduleAt) : null;
    const ids = at && at.getTime() > Date.now()
      ? await scheduleAlarm(rec.id, rec.content || rec.transcript, at, rec.alarmMode ?? 'both', { remindBefore, exactAlarm, voiceUri: voiceUriOf({ ...rec, voiceAlarm }) })
      : [];
    commit(recordsRef.current.map((r) =>
      r.id === rec.id ? { ...r, remindBefore, exactAlarm, voiceAlarm, notifIds: ids.length ? ids : undefined } : r
    ));
  };

  const handleEditorSave = async (res: EditorResult) => {
    const display = formatDisplay(res.date, true, res.hasTime);
    const notifAt = res.hasTime && res.date.getTime() > Date.now() ? res.date : null;
    if (res.id) {
      const old = records.find((r) => r.id === res.id);
      if (old) await cancelAlarmGroup(old.id, old.notifIds);
      const newIds = notifAt
        ? await scheduleAlarm(res.id, res.content, notifAt, res.alarmMode, {
            remindBefore: res.remindBefore, exactAlarm: res.exactAlarm,
            voiceUri: voiceUriOf({ uri: old?.uri, voiceAlarm: !!res.voiceAlarm, alarmMode: res.alarmMode }),
          })
        : [];
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
              needsDate: false, // 사용자가 날짜·시간을 정했으니 꼬리표 해제
              notifIds,
              alarmMode: res.alarmMode,
              remindBefore: res.remindBefore,
              exactAlarm: res.exactAlarm,
              voiceAlarm: r.uri ? voiceAlarmToStore(!!res.voiceAlarm) : r.voiceAlarm,
              appends: res.append ? [...(r.appends ?? []), makeAppendEntry(r.id, res.append)] : r.appends,
              // 내용이 바뀌면 기존 단어별 타임스탬프는 무효 → 카드 표시도 새 내용으로
              segments: res.content.trim() !== (r.content ?? '').trim() ? undefined : r.segments,
            }
          : r
      );
      commit(next);
    } else {
      const id = Date.now().toString();
      // 새 일정 화면의 마이크로 말했다면 그 녹음을 메인 녹음으로 남긴다 (마이크 FAB로 만든 일정과 같게)
      let uri = '';
      if (res.capture?.uri) {
        try { uri = persistAudio(res.capture.uri, id); }
        catch (e) { console.warn('오디오 저장 실패:', e); }
      }
      const voiceOn = !!res.voiceAlarm && !!uri;
      const voiceAlarm = uri ? voiceAlarmToStore(!!res.voiceAlarm) : undefined;
      const newIds = notifAt
        ? await scheduleAlarm(id, res.content, notifAt, res.alarmMode, {
            remindBefore: res.remindBefore, exactAlarm: res.exactAlarm,
            voiceUri: voiceUriOf({ uri, voiceAlarm: voiceOn, alarmMode: res.alarmMode }),
          })
        : [];
      const notifIds = newIds.length ? newIds : undefined;
      const rec: ScheduleRecord = {
        id, uri, durationSec: uri ? res.capture!.durationSec : 0, transcript: res.capture?.transcript ?? '',
        segments: uri ? res.capture!.segments : undefined,
        content: res.content, scheduleAt: res.date.getTime(), scheduleDisplay: display,
        hasDate: true, hasTime: res.hasTime, notifIds, alarmMode: res.alarmMode,
        remindBefore: res.remindBefore, exactAlarm: res.exactAlarm, voiceAlarm, createdAt: Date.now(),
      };
      commit([rec, ...records]);
    }
    setSelectedDate(new Date(res.date.getFullYear(), res.date.getMonth(), res.date.getDate()));
    setEditorOpen(false);
  };

  // 삭제 진입점 3곳(편집기 휴지통·상세 휴지통·카드 길게 누르기)이 같은 확인 창을 쓴다
  const confirmDelete = (r: ScheduleRecord) => {
    Alert.alert(t('일정 삭제'), t('이 일정을 삭제할까요?') + `\n\n"${(r.content || r.transcript || '').slice(0, 60)}"`, [
      { text: t('취소'), style: 'cancel' },
      { text: t('삭제'), style: 'destructive', onPress: async () => { setDetailId(null); await handleEditorDelete(r.id); } },
    ]);
  };
  const openCardMenu = (r: ScheduleRecord) => {
    Alert.alert((r.content || r.transcript || t('일정')).slice(0, 60), undefined, [
      { text: t('수정'), onPress: () => openEdit(r) },
      { text: t('삭제'), style: 'destructive', onPress: () => confirmDelete(r) },
      { text: t('취소'), style: 'cancel' },
    ]);
  };

  const handleEditorDelete = async (id: string) => {
    sharedPlayer.stop(); // 지우는 일정이 재생 중일 수 있다
    removeVoiceAlarm(id);
    const target = records.find((r) => r.id === id);
    if (target?.uri) deleteAudio(target.uri);
    for (const a of target?.appends ?? []) if (a.uri) deleteAudio(a.uri);
    if (target) await cancelAlarmGroup(target.id, target.notifIds);
    commit(records.filter((r) => r.id !== id));
    setEditorOpen(false);
  };

  // "추가"는 메모가 아니라 메인과 동등한 독립 엔트리 — 자기 녹음/전사/구간재생을 갖고
  // appends[]에 쌓여 메인과 한 일정 아래 함께 표시·내보내기된다.
  // 덧붙인 항목 하나를 만든다(녹음은 영구 폴더로 옮김) — 카드 "＋ 추가"와 수정 화면 "말로 덧붙이기"가 함께 쓴다
  const makeAppendEntry = (id: string, entry: AppendResult): AppendEntry => {
    const appendId = Date.now().toString();
    let savedUri = entry.uri;
    if (entry.uri) {
      try { savedUri = persistAudio(entry.uri, `${id}_a${appendId}`); }
      catch (e) { console.warn('추가 오디오 저장 실패:', e); }
    }
    return {
      id: appendId, uri: savedUri, durationSec: entry.durationSec,
      transcript: entry.transcript, content: entry.content,
      segments: entry.segments, createdAt: Date.now(),
    };
  };

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
     <View style={styles.page}>
      <StatusBar style={resolvedTheme === 'light' ? 'dark' : 'light'} />

      {/* ── 헤더 ── */}
      <View style={styles.header} onLayout={(e) => setHeaderW(Math.floor(e.nativeEvent.layout.width - 40))}>
        <View style={styles.headerLeft}>
          <Text style={styles.appName} onLayout={(e) => setTitleW(Math.ceil(e.nativeEvent.layout.width))}>{t('세이람')}</Text>
          {clockBelow && (
            <Text style={styles.clockUnderTitle} numberOfLines={1}>{formatTime(currentTime)}</Text>
          )}
          {nextSchedule?.scheduleAt ? (
            <Text style={styles.nextLabel} numberOfLines={bigText ? 2 : 1}>
              {t('다음 ·')}{' '}
              {formatDayHeader(new Date(nextSchedule.scheduleAt))}{' '}
              {formatTime(new Date(nextSchedule.scheduleAt))}
            </Text>
          ) : null}
          {nextSchedule?.scheduleAt ? (
            // 자연 폭 측정용(보이지 않음)
            <Text style={[styles.nextLabel, styles.measure]} numberOfLines={1} onLayout={(e) => setNextW(Math.ceil(e.nativeEvent.layout.width))}>
              {t('다음 ·')}{' '}
              {formatDayHeader(new Date(nextSchedule.scheduleAt))}{' '}
              {formatTime(new Date(nextSchedule.scheduleAt))}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {!clockBelow && (
            <Text style={styles.clockText} numberOfLines={1}>{formatTime(currentTime)}</Text>
          )}
          <View style={styles.headerBtns} onLayout={(e) => setBtnsW(Math.ceil(e.nativeEvent.layout.width))}>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsOpen(true)} activeOpacity={0.75} accessibilityLabel={t('설정')}>
              <Text style={styles.settingsBtnText}>{t('설정')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addCircleBtn} onPress={openNew} activeOpacity={0.75}>
              <Text style={styles.addCircleBtnText}>＋</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* 시계의 자연 폭 측정용(보이지 않음) */}
        <Text style={[styles.clockText, styles.measure]} numberOfLines={1} onLayout={(e) => setClockW(Math.ceil(e.nativeEvent.layout.width))}>
          {formatTime(currentTime)}
        </Text>
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
              {t('달력')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segTab, activeTab === 'all' && styles.segTabActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segTabText, activeTab === 'all' && styles.segTabTextActive]}>
              {t('전체 일정')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 컨텐츠 ── */}
      {activeTab === 'calendar' ? (
        <SectionList
          ref={periodListRef}
          sections={periodListSections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.dayListContent}
          ListFooterComponent={<PromoBanner />}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={(info) => {
            // 아직 렌더되지 않은 섹션 → 평균 높이로 근처까지 옮긴 뒤 다시 시도
            const idx = pendingScrollRef.current;
            try {
              periodListRef.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
            } catch {}
            if (idx == null) return;
            setTimeout(() => {
              try { periodListRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewOffset: 8, animated: true }); } catch {}
              pendingScrollRef.current = null;
            }, 120);
          }}
          ListHeaderComponent={
            <>
              <Calendar
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                markedDays={marked}
                preMarkedDays={preMarked}
                mode={calendarMode}
                onModeChange={handleCalendarMode}
                onVisibleRangeChange={setVisibleRange}
              />
              <View style={styles.dayHeader}>
                <Text style={styles.dayHeaderText} numberOfLines={2}>{t('{label} 일정', { label: periodLabel })}</Text>
                <Text style={styles.dayCount}>{periodCount > 0 ? t('{n}건', { n: periodCount }) : ''}</Text>
              </View>
              {periodCollapsed.pastCount > 0 && (
                <TouchableOpacity style={styles.pastToggle} onPress={() => setShowPastPeriod((v) => !v)} activeOpacity={0.7} accessibilityLabel={t(showPastPeriod ? '지난 일정 접기' : '지난 일정 보기')}>
                  <Text style={styles.pastToggleText}>
                    {showPastPeriod ? t('지난 일정 접기 ▴') : t('지난 일정 {n}건 보기 ▾', { n: periodCollapsed.pastCount })}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyDay}>
              <Text style={styles.emptyDayText}>{periodCollapsed.pastCount > 0 && !showPastPeriod ? t('앞으로 올 일정이 없어요') : calendarMode === 'week' ? t('이 주에는 일정이 없어요') : t('이 달에는 일정이 없어요')}</Text>
            </View>
          }
          renderSectionHeader={({ section }) => {
            const isSelected = section.key === dayKey(selectedDate);
            const isToday = isSameDay(section.date, new Date());
            return (
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionHeaderText, (isSelected || isToday) && styles.sectionHeaderToday]}>
                  {section.title}
                </Text>
                {isToday && (
                  <View style={styles.todayChip}>
                    <Text style={styles.todayChipText}>{t('오늘')}</Text>
                  </View>
                )}
              </View>
            );
          }}
          renderItem={({ item }) =>
            isPreAlarmItem(item)
              ? <PreAlarmRow item={item} onPress={openDetail} />
              : <ScheduleCard item={item} onPress={openDetail} onAppend={openAppend} onFixDate={openEdit} onLongPress={openCardMenu} />
          }
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        />
      ) : (
        <View style={styles.allWrap}>
          <AllSchedulesList records={records} onPress={openDetail} onAppend={openAppend} onFixDate={openEdit} onLongPress={openCardMenu} />
        </View>
      )}

      {/* ── 녹음 버튼 ── 목록 위에 떠 있으면 마지막 카드를 가려서(2026-10-14 폰 피드백) 목록 아래 고정 영역에 둔다 */}
      <View style={[styles.fabWrap, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.fab} onPress={startRecording} activeOpacity={0.85}>
          <MicIcon size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── 설정 (달력 기본 보기 · 백업 · 사용설명서 · 앱 정보) ── */}
      <SettingsSheet
        visible={settingsOpen}
        records={records}
        calendarMode={calendarMode}
        onCalendarMode={handleCalendarMode}
        defaultRemind={defaultRemind}
        onDefaultRemind={handleDefaultRemind}
        defaultVoice={defaultVoice}
        onDefaultVoice={handleDefaultVoice}
        onClose={() => setSettingsOpen(false)}
        onRestored={async (next) => {
          // 다른 폰의 알림 id는 이 폰에서 무효 → 전부 비우고 미래 일정 알람을 다시 건다
          const cleaned = next.map((r) => ({ ...r, notifIds: undefined }));
          commit(cleaned);
          await resyncAlarms(cleaned);
        }}
      />

      {/* ── 상세 보기 ── */}
      <ScheduleDetail
        visible={detailId != null}
        record={detailRecord}
        onClose={() => setDetailId(null)}
        onEdit={openEditFromDetail}
        onAppend={openAppendFromDetail}
        onDelete={confirmDelete}
      />

     </View>
      {/* ── 편집기 ── */}
      <ScheduleEditor
        visible={editorOpen}
        record={editing}
        defaultDate={selectedDate}
        markedDays={marked}
        appendMode={appendMode}
        defaultRemind={defaultRemind}
        defaultVoice={defaultVoice}
        onSave={handleEditorSave}
        onAppend={handleEditorAppend}
        onDelete={handleEditorDelete}
        onClose={() => setEditorOpen(false)}
      />

      {/* ── 녹음 오버레이 ── */}
      <Modal visible={showRecorder} animationType="slide" transparent onRequestClose={cancelRecording}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: 44 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, !voice.listening && styles.sheetTitleWait]} accessibilityLiveRegion="polite">
              {t(voice.listening ? '🎙 지금 말씀하세요' : '준비 중…')}
            </Text>
            <Waveform metering={voice.recorderState.metering} isRecording={voice.recorderState.isRecording} />
            {!voice.fileRecording && <Text style={styles.sheetNotice}>{NO_FILE_NOTICE}</Text>}
            <View style={styles.transcriptBox}>
              {voice.liveText ? (
                <Text style={styles.transcriptText} numberOfLines={4}>{voice.liveText}</Text>
              ) : (
                <Text style={styles.transcriptPlaceholder}>
                  {t('말씀해보세요…\n예: "내일 오후 3시에 회의"')}
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
                  <Text style={styles.detectWait}>{t('⏳ 날짜·시간을 기다리는 중…')}</Text>
                )
              ) : null}
            </View>
            <Text style={styles.timer}>{formatDuration(elapsedSec)}</Text>
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelRecording}>
                <Text style={styles.cancelBtnText}>{t('취소')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                <Text style={styles.stopBtnIcon}>⏹</Text>
                <Text style={styles.stopBtnText}>{t('완료')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  // 태블릿: 본문이 화면 전체로 퍼지지 않게 가운데 최대 폭 (카드 한 줄이 너무 길어지는 것 방지)
  page: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },

  // 헤더
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10,
  },
  appName: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, alignSelf: 'flex-start' }, // 폭 측정을 위해 내용 폭만 차지
  nextLabel: { color: C.accent, fontSize: 12, fontWeight: '500', marginTop: 3 },
  headerLeft: { flex: 1, flexShrink: 1, marginRight: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clockText: { color: C.textSub, fontSize: 18, fontWeight: '300', letterSpacing: 0.5 },
  measure: { position: 'absolute', opacity: 0, left: 0, top: 0 },
  clockUnderTitle: { color: C.textSub, fontSize: 14, fontWeight: '400', marginTop: 2 },
  settingsBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: C.surfaceHigh },
  settingsBtnText: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  addCircleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  addCircleBtnText: { color: C.text, fontSize: 22, fontWeight: '300', includeFontPadding: false },

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
  dayHeaderText: { color: C.text, fontSize: 17, fontWeight: '700', flex: 1, marginRight: 8 },
  dayCount: { color: C.textSub, fontSize: 13, fontWeight: '500', flexShrink: 0 },
  dayList: { flex: 1 },
  dayListContent: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyDay: { paddingTop: 48, alignItems: 'center' },
  emptyDayText: { color: C.textDim, fontSize: 15 },

  // 전체 일정 탭
  allWrap: { flex: 1 },
  allListContent: { paddingHorizontal: 16, paddingBottom: 24 },
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

  // 전체 일정: 검색창 · 기간 칩 · 결과 행
  filterWrap: { paddingTop: 4, paddingBottom: 2 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, height: 48,
    borderWidth: 1, borderColor: C.border,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 0 },
  searchClear: { color: C.textSub, fontSize: 15, fontWeight: '700', paddingHorizontal: 4 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.textSub, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  pastToggleRow: { flexDirection: 'row', gap: 8 },
  pastToggle: { marginHorizontal: 4, marginBottom: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center' },
  pastToggleText: { color: C.textSub, fontSize: 13, fontWeight: '600' },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 6, paddingTop: 2, paddingBottom: 2 },
  resultText: { color: C.textSub, fontSize: 13, fontWeight: '600' },
  resultActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultReset: { color: C.accent, fontSize: 13, fontWeight: '700', marginRight: 6 },
  resultBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surfaceHigh },
  resultBtnText: { color: C.text, fontSize: 12, fontWeight: '600' },

  // FAB
  fabWrap: {
    alignItems: 'center', paddingTop: 8, paddingBottom: 10,
    backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  fab: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.red, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },

  // 녹음 오버레이
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 44, alignItems: 'center',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 18 },
  sheetTitle: { color: C.red, fontSize: 17, fontWeight: '700', marginBottom: 16 },
  sheetTitleWait: { color: C.textDim, fontWeight: '500' },
  sheetNotice: { color: C.textSub, fontSize: 12, textAlign: 'center', marginTop: -4, marginBottom: 8, paddingHorizontal: 20 },
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
