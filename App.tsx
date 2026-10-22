import { installCrashLogger } from './lib/crashLog';
installCrashLogger();
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Keyboard, Linking, LogBox, Modal, ScrollView, SectionList, StyleSheet, TextInput, TouchableOpacity, View, AppState, Platform } from 'react-native';
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
  findItemLocation,
  relativeDayLabel,
  coverEnd,
  rangesCovering,
  itemsWithinRange,
  startOfDay,
  emptyGapBetween,
  formatEmptyGap,
  type EmptyGap,
  daysWithSchedules,
  formatDayHeader,
  formatTime,
  groupByDay,
  isSameDay,
  isPastItem,
  type DaySection,
  collapsePast, PAST_PAGE,
} from './lib/dateUtils';
import { loadPrefs, savePrefs } from './lib/prefs';
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
  type OutcomeKind,
  type ScheduleRecord,
} from './lib/storage';
import { carryDefaultDate, dropOutcome, isMovedAway, linkCarry, setOutcome, syncCarryDate, unlinkDeleted } from './lib/outcome';
import { useVoiceRecorder } from './lib/useVoiceRecorder';
import { NO_FILE_NOTICE } from './lib/voiceCapture';
import { sttBlockedNotice } from './lib/sttErrors';
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
import { notifyAudioLost } from './lib/audioLostNotice';
import { healEmptyRecordingsOnce } from './lib/healRecordings';
import { removeVoiceAlarm, setVoiceAlarmDefault, voiceAlarmOn, voiceAlarmToStore, voiceUriOf } from './lib/voiceAlarm';
import { ThemeProvider, useFontScale, useResolvedTheme, useTheme, type Palette } from './lib/theme';
import { copyRecords } from './lib/exportUtils';
import { ExportPreview, type ExportKind } from './components/ExportPreview';
import { FilterSheet } from './components/FilterSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { MicIcon } from './components/MicIcon';
import { PromoBanner } from './components/PromoBanner';
import { Waveform, formatDuration } from './components/Waveform';
import { ScheduleCard } from './components/ScheduleCard';
import { MiniMonthSheet } from './components/MiniMonthSheet';
import { CalendarIcon } from './components/CalendarIcon';
import { ListDensityIcon } from './components/ListDensityIcon';
import { MonthScroll, monthScrollYearRange } from './components/MonthScroll';
import { YearView } from './components/YearView';
import { DaySheet } from './components/DaySheet';
import type { CalEvent } from './lib/calendarKit/monthLayout';
import { ymdKey } from './lib/calendarKit/holidays';
import { publishOwnShare, pushOwnShare, readSiblingShifts, siblingShareAvailable } from './lib/siblingShare';
import { consumeRecentShiftRequest, isNewerThan, loadShifts, markShiftRequest, parseShiftImportUrl, saveShifts, SHIFT_REQUEST_URL, type ShiftData } from './lib/shiftImport';
import { ScheduleDetail } from './components/ScheduleDetail';
import { ScheduleEditor, type AppendResult, type EditorPrefill, type EditorResult } from './components/ScheduleEditor';



// ─── 일정 탭 (옛 이름 "전체 일정") ─────────────────────────────────────────────────
// 검색창 + 기간 칩(전체/오늘/이번 주/이번 달/직접 선택)으로 바로 걸러진다. "조회하기" 버튼 없음.
// 2026-10-18 D안: 날짜 머리에 "모레·2주 뒤", 일정 사이에 "N일 비어 있음" 줄, 날짜 머리 📅 → 작은 점 달력.
function AllSchedulesList({
  records,
  onPress,
  onAppend,
  onFixDate,
  onLongPress,
  compact,
  onAddOnDate,
  jump,
}: {
  records: ScheduleRecord[];
  onPress: (r: ScheduleRecord) => void;
  onAppend: (r: ScheduleRecord) => void;
  onFixDate: (r: ScheduleRecord) => void;
  onLongPress?: (r: ScheduleRecord) => void;
  /** 한 줄 보기 (달력 탭과 같은 설정) */
  compact: boolean;
  /** 빈 날 줄을 누르면 그 날로 새 일정 */
  onAddOnDate: (d: Date) => void;
  /** 위쪽 "다음 ›"으로 이 일정 카드로 이동(잠깐 강조). nonce가 바뀔 때마다 */
  jump: { id: string; nonce: number } | null;
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

  // 빈 날 줄: 검색·기간 조건이 없을 때만(걸러진 목록에선 "비어 있음"이 사실이 아니다)
  const gapAfter = useMemo(() => {
    const m = new Map<string, EmptyGap>();
    if (active) return m;
    const today = new Date();
    // 기간 일정(휴가 등)이 덮는 날은 비어 있지 않다 — 지금까지 덮인 마지막 날부터 센다
    let covered = 0;
    for (let i = 0; i + 1 < sections.length; i++) {
      const a = sections[i];
      const b = sections[i + 1];
      if (a.key === 'undated' || b.key === 'undated') continue;
      covered = Math.max(covered, a.date.getTime(), ...a.data.map((r) => coverEnd(r).getTime()));
      const g = emptyGapBetween(new Date(covered), b.date, today);
      if (g) m.set(a.key, g);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, active, dayKey(new Date())]); // 자정이 지나면 "오늘부터"가 바뀐다
  // 작은 점 달력: 일정 있는 날 표시, 누른 날로 목록 이동
  const listRef = useRef<SectionList<ScheduleRecord, DaySection>>(null);
  // 닫히는 동안에도 마지막 날짜를 유지해야 선택 동그라미가 오늘로 튀지 않는다
  const [miniOpen, setMiniOpen] = useState(false);
  const [miniDate, setMiniDate] = useState<Date>(() => new Date());
  const marked = useMemo(() => daysWithSchedules(records), [records]);
  const pendingIdxRef = useRef<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (!jump) return;
    const loc = findItemLocation(sections, jump.id);
    if (!loc) return;
    setHighlight(jump.id);
    pendingIdxRef.current = loc.sectionIndex;
    // 탭이 막 바뀐 직후라 목록이 그려진 뒤 스크롤. itemIndex는 0이 날짜 머리라 +1
    const t1 = setTimeout(() => {
      try { listRef.current?.scrollToLocation({ sectionIndex: loc.sectionIndex, itemIndex: loc.itemIndex + 1, viewOffset: 40, animated: true }); } catch {}
    }, 120);
    const t2 = setTimeout(() => setHighlight(null), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump]);
  const jumpToDay = (d: Date) => {
    setMiniOpen(false);
    const t0 = startOfDay(d).getTime();
    let idx = sections.findIndex((sec) => sec.key !== 'undated' && sec.date.getTime() >= t0);
    if (idx < 0) idx = sections.length - 1;
    if (idx < 0) return;
    pendingIdxRef.current = idx;
    setTimeout(() => {
      try { listRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewOffset: 8, animated: true }); } catch {}
    }, 250); // 창이 닫히는 애니메이션 뒤
  };

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
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.allListContent}
        onScrollToIndexFailed={(info) => {
          const idx = pendingIdxRef.current;
          try { listRef.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false }); } catch {}
          if (idx == null) return;
          setTimeout(() => {
            try { listRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewOffset: 8, animated: true }); } catch {}
            pendingIdxRef.current = null;
          }, 120);
        }}
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
            {/* 📅 이모지는 기기마다 "JUL 17" 그림이라 직접 그린 아이콘 */}
            <View style={{ marginBottom: 16 }}><CalendarIcon size={40} color={C.textSub} /></View>
            <Text style={styles.emptyAllText}>{active ? t('조건에 맞는 일정이 없어요') : collapsing ? t('앞으로 올 일정이 없어요') : t('등록된 일정이 없어요')}</Text>
            {!active && <Text style={styles.emptyAllSub}>{t('아래 마이크 버튼으로 말해서 바로 추가해보세요')}</Text>}
          </View>
        }
        renderSectionHeader={({ section }) => {
          const isToday = isSameDay(section.date, today);
          const isPast = section.date.getTime() < todayMidnight;
          const undated = section.key === 'undated';
          const rel = undated ? null : relativeDayLabel(section.date, today);
          if (undated) {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
              </View>
            );
          }
          // 날짜 머리를 누르면 그 달의 작은 점 달력 (앞뒤로 뭐가 있나·빈 날 확인)
          return (
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => { setMiniDate(section.date); setMiniOpen(true); }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`${rel ? rel + ' · ' : ''}${section.title}, ${t('달력으로 보기')}`}
            >
              {rel && (
                isToday ? (
                  <View style={styles.todayChip}><Text style={styles.todayChipText}>{rel}</Text></View>
                ) : (
                  <Text style={[styles.sectionRel, isPast && styles.sectionHeaderPast]}>{rel}</Text>
                )
              )}
              <Text style={[styles.sectionHeaderText, isToday && styles.sectionHeaderToday, isPast && styles.sectionHeaderPast]}>
                {section.title}
              </Text>
              <View style={styles.sectionCal}><CalendarIcon size={15} color={C.textSub} /></View>
            </TouchableOpacity>
          );
        }}
        renderSectionFooter={({ section }) => {
          const g = gapAfter.get(section.key);
          if (!g) return null;
          return (
            <TouchableOpacity
              style={styles.gapRow}
              onPress={() => onAddOnDate(g.from)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`${formatEmptyGap(g)}, ${t('일정 추가')}`}
            >
              <View style={styles.gapLine} />
              <Text style={styles.gapText}>{formatEmptyGap(g)}</Text>
              <View style={styles.gapLine} />
            </TouchableOpacity>
          );
        }}
        renderItem={({ item }) => <ScheduleCard item={item} compact={compact} highlight={highlight === item.id} onPress={onPress} onAppend={onAppend} onFixDate={onFixDate} onLongPress={onLongPress} />}
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
      <MiniMonthSheet visible={miniOpen} selected={miniDate} markedDays={marked} onPick={jumpToDay} onClose={() => setMiniOpen(false)} />
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

  // 알림 응답 핸들러가 최신 records를 참조할 수 있도록 ref 유지
  const recordsRef = useRef<ScheduleRecord[]>([]);
  useEffect(() => { recordsRef.current = records; }, [records]);

  // ── 초기화 ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // 예전에 소리 없이 저장된 녹음은 uri를 비워 ▶가 무음 대신 글 읽어 주기로 동작하게 한다 (lib/healRecordings.ts)
    const healed = healEmptyRecordingsOnce(loadRecords());
    const recs = healed.records;
    if (healed.healed) {
      saveRecords(recs);
      console.warn('빈 녹음 정리:', healed.removed);
    }
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
          if (rec && isMovedAway(rec)) return; // 알림 센터에 남은 알림이라도 미룬 일정은 다시 울리지 않는다
          const body = response.notification.request.content.body || rec?.content || t('미리 알림');
          await scheduleAlarm(recordId, body, new Date(Date.now() + 5 * 60 * 1000), rec?.alarmMode ?? 'both', { single: true, voiceUri: voiceUriOf(rec) });
        }
        return;
      }
      if (response.actionIdentifier === 'snooze') {
        // 스누즈: 남은 슬롯 취소 후 5분 뒤로 다시 예약
        await cancelAlarmByRecordId(recordId).catch(() => {});
        const rec = recordsRef.current.find((r) => r.id === recordId);
        if (rec && isMovedAway(rec)) return; // 미룬 일정은 새 일정 쪽에서만 울린다
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
  // 한 줄 보기(일정이 많을 때 한 화면에 많이) — 달력·전체 일정 탭 공용, 재시작해도 유지
  const [listCompact, setListCompact] = useState<boolean>(() => loadPrefs().listCompact);
  const toggleListCompact = () => {
    setListCompact((v) => { savePrefs({ listCompact: !v }); return !v; });
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


  const nextSchedule = useMemo(() => {
    const now = Date.now();
    return records
      .filter((r) => !r.needsDate && r.hasTime && r.scheduleAt != null && r.scheduleAt >= now && !isMovedAway(r))
      .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0))[0] ?? null;
  }, [records, currentTime]);

  // 위쪽 "다음 · …"을 누르면 일정 탭에서 그 일정 카드로 바로 간다(잠깐 강조).
  // 2026-10-18 달력 탭이 목록 없는 큰 달력으로 바뀌어, 카드가 있는 일정 탭으로 간다.
  // 새 달력 탭: 한 달(연속 스크롤) ↔ 1년, 날짜 시트, 음력 표시
  const [calMode, setCalMode] = useState<'month' | 'year'>('month');
  const [yearShown, setYearShown] = useState(() => new Date().getFullYear());
  const [monthJump, setMonthJump] = useState<{ y: number; m: number; nonce: number } | null>(null);
  const [daySheet, setDaySheet] = useState<Date | null>(null);
  const [showLunar, setShowLunar] = useState(false);
  const toggleLunar = useCallback(() => setShowLunar((v) => !v), []);
  // 교대알람에서 가져온 근무표(같은 폰, URL로 주고받음 — lib/shiftImport.ts). 일정·알람은 만들지 않는다
  const [shifts, setShifts] = useState<ShiftData | null>(() => loadShifts());
  const shiftsInfo = useMemo(() => {
    if (!shifts) return null;
    const [y, m, d] = shifts.from.split('-').map(Number);
    const from = new Date(y, m - 1, d);
    const to = new Date(y, m - 1, d + shifts.days.length - 1);
    return t('{from} ~ {to} 근무', { from: formatDayHeader(from), to: formatDayHeader(to) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, lang]);
  const importShifts = async () => {
    try {
      markShiftRequest(); // 돌아온 근무표가 사용자가 요청한 것인지 구분(요청 없이 온 것은 묻는다)
      await Linking.openURL(SHIFT_REQUEST_URL);
    } catch {
      Alert.alert(t('교대알람이 없어요'), t('같은 폰에 교대알람이 설치되어 있어야 근무표를 가져올 수 있어요.'));
    }
  };
  const clearShifts = () => {
    Alert.alert(t('가져온 근무 지우기'), t('달력에서 교대알람 근무 표시를 지울까요? 교대알람 앱의 근무표는 그대로예요.'), [
      { text: t('취소'), style: 'cancel' },
      { text: t('지우기'), style: 'destructive', onPress: () => { saveShifts(null); setShifts(null); } },
    ]);
  };
  // ── 교대알람 자동 공유(v2, Android): 두 앱만 깔려 있으면 버튼 없이, 한쪽 설정만 켜도 — lib/siblingShare.ts ──
  const [shareOn, setShareOn] = useState<boolean>(() => loadPrefs().shareWithAlarmApp);
  const changeShareOn = (on: boolean) => { setShareOn(on); savePrefs({ shareWithAlarmApp: on }); };
  // 내 일정·설정을 공유 자리에 둔다(교대알람이 열릴 때 읽는다)
  // 시작 직후 records 초기값([])으로 빈 일정을 덮어쓰지 않게, 불러온 뒤부터 쓴다
  const recordsLoadedRef = useRef(false);
  useEffect(() => {
    if (!recordsLoadedRef.current) { recordsLoadedRef.current = records.length > 0 || loadRecords().length === 0; if (!recordsLoadedRef.current) return; }
    publishOwnShare(records, shareOn);
  }, [records, shareOn]);
  // 교대알람 근무표 읽기 — 시작할 때와 앱이 앞으로 올 때만(폴링 없음, 세이람 규칙 10). 교대알람이 넣어 준 파일만 읽는다
  const refreshSibling = useCallback(async () => {
    if (!siblingShareAvailable) return;
    const d = await readSiblingShifts(shareOn);
    if (d) {
      // 그대로면 다시 저장·그리지 않는다(달력 전체 다시 그리기 방지)
      const cur = shiftsRef.current;
      if (cur?.source === 'auto' && cur.from === d.from && cur.days.join() === d.days.join() && cur.labels.join() === d.labels.join() && cur.colors.join() === d.colors.join()) return;
      const auto = { ...d, source: 'auto' as const, importedAt: Date.now() };
      setShifts(auto);
      saveShifts(auto);
    } else if (shiftsRef.current?.source === 'auto') {
      // 공유를 끄거나 교대알람을 지웠으면 자동으로 받은 근무도 지운다
      setShifts(null);
      saveShifts(null);
    }
  }, [shareOn]);
  useEffect(() => {
    refreshSibling();
    // 앞으로 올 때: 받은 파일만 읽는다(교대알람을 깨우지 않음). 떠날 때: 바뀐 것만 교대알람에 한 번 넣어 준다
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refreshSibling();
      else if (st === 'background' && siblingShareAvailable) pushOwnShare(shareOn);
    });
    return () => sub.remove();
  }, [refreshSibling, shareOn]);

  // 링크 처리는 앱 시작 때 한 번 등록되므로 최신 번역 함수·근무표를 ref로 읽는다
  const tRef = useRef(t);
  tRef.current = t;
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const d = parseShiftImportUrl(url);
      if (!d) return;
      // 같은 링크로 앱이 다시 열려도(Android 최근 앱) 옛 근무표가 새것을 덮지 않게
      if (!isNewerThan(d, shiftsRef.current)) return;
      const tt = tRef.current;
      const apply = () => {
        const saved = { ...d, importedAt: Date.now() };
        saveShifts(saved);
        setShifts(saved);
        setSettingsOpen(false);
        setActiveTab('calendar');
        // 설정 창이 닫힌 뒤에 알린다(모달 위 알림 창 겹침 방지)
        setTimeout(() => Alert.alert(tt('교대알람 근무표를 가져왔어요'), tt('달력 칸에 근무가 작게 보여요. 근무표를 바꾸면 다시 가져와 주세요.')), 500);
      };
      // 사용자가 [가져오기]를 누르고 10분 안에 돌아온 것만 바로 받는다. 아니면 묻는다(다른 앱이 마음대로 바꾸지 못하게)
      if (consumeRecentShiftRequest()) apply();
      else Alert.alert(tt('교대알람 근무표로 바꿀까요?'), tt('달력에 보이는 근무가 이 근무표로 바뀌어요.'), [
        { text: tt('취소'), style: 'cancel' },
        { text: tt('바꾸기'), onPress: apply },
      ]);
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 달력 확대 단계(두 손가락·달 제목 두 번 탭), 재시작해도 유지
  const [calDensity, setCalDensity] = useState<0 | 1 | 2>(() => loadPrefs().calDensity);
  const changeDensity = useCallback((d: 0 | 1 | 2) => { setCalDensity(d); savePrefs({ calDensity: d }); }, []);
  const pickYearMonth = useCallback((y: number, m: number) => { setCalMode('month'); setMonthJump({ y, m, nonce: Date.now() }); }, []);
  const yearRange = useMemo(() => monthScrollYearRange(), []);
  // 일정을 저장하면(녹음·편집기) 그 날짜로 selectedDate가 바뀐다 → 달력도 그 달로 간다
  useEffect(() => {
    setMonthJump({ y: selectedDate.getFullYear(), m: selectedDate.getMonth(), nonce: Date.now() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);
  // 다른 탭에 다녀오면 오늘 달부터(예전에 고른 달로 다시 튀지 않게)
  useEffect(() => { if (activeTab !== 'calendar') setMonthJump(null); }, [activeTab]);
  const calEvents = useMemo<CalEvent[]>(() => records
    .filter((r) => r.scheduleAt != null)
    .map((r) => {
      const at = new Date(r.scheduleAt!);
      const start = new Date(at.getFullYear(), at.getMonth(), at.getDate());
      const end = r.endAt != null ? startOfDay(new Date(r.endAt)) : start;
      return {
        id: r.id, title: (r.content || r.transcript || '').split('\n')[0], start, end,
        time: r.hasTime && !r.needsDate ? at.getHours() * 60 + at.getMinutes() : undefined,
      };
    }), [records]);
  const busyDays = useMemo(() => {
    const set = new Set<string>();
    for (const e of calEvents) for (let d = e.start; d.getTime() <= e.end.getTime() && set.size < 20000; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) set.add(ymdKey(d));
    return set;
  }, [calEvents]);
  // 시트를 닫은 뒤에 다른 창(상세·편집기)을 연다 — iOS는 모달 위에 모달을 띄우면 무시한다
  const afterSheet = (fn: () => void) => { setDaySheet(null); setTimeout(fn, 450); }; // 상세→편집기 전환과 같은 지연

  const [listJump, setListJump] = useState<{ id: string; nonce: number } | null>(null);
  const jumpToNext = () => {
    if (!nextSchedule?.scheduleAt) return;
    setActiveTab('all');
    setListJump({ id: nextSchedule.id, nonce: Date.now() });
  };

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

    // 소리가 비어 버린 경우(res.audioLost)는 글·알람은 살리고 저장한 뒤 알린다 — 말한 내용을 잃지 않게
    if (!uri && voice.fileRecording && !res.audioLost) {
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
      if (res.audioLost) notifyAudioLost(); // 저장한 뒤에 알린다 (삭제 명령·취소 경로에선 안 뜬다)
      return;
    }
    if (!parsed.hasDate && !parsed.hasTime) {
      Alert.alert(t('삭제할 일정을 못 찾았어요'), t('"{text}"\n\n어느 날 일정을 지울지 날짜를 함께 말씀해주세요.', { text: transcript }), [{ text: t('확인') }]);
      return;
    }

    const saveAsNew = async () => {
      if (parsed.date && !(await confirmOverlap(parsed.date, parsed.endDate?.getTime()))) return;
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
        endAt: parsed.endDate ? parsed.endDate.getTime() : undefined, // 기간 일정(휴가 등) — 알람은 시작에만
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
      if (res.audioLost) notifyAudioLost();
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
            await commitDeleted(target.id);
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

  // 새 일정의 기본 날짜: 보통은 달력에서 고른 날, 일정 탭의 빈 날 줄에서 열면 그 날(취소해도 달력 선택은 그대로)
  const [newDefaultDate, setNewDefaultDate] = useState<Date | null>(null);
  // 지난 일정을 다시 잡는 중이면(바뀌었어요·덜 했어요) 원래 일정과 미리 채울 값. 다른 방법으로 편집기를 열면 지운다
  const [prefill, setPrefill] = useState<EditorPrefill | null>(null);
  const carryRef = useRef<{ fromId: string; kind: OutcomeKind } | null>(null);
  const clearCarry = () => { carryRef.current = null; setPrefill(null); };
  const openNew = () => { clearCarry(); setNewDefaultDate(null); setEditing(null); setAppendMode(false); setEditorOpen(true); };
  const openNewOn = (d: Date) => { clearCarry(); setNewDefaultDate(d); setEditing(null); setAppendMode(false); setEditorOpen(true); };
  const openEdit = (r: ScheduleRecord) => { clearCarry(); setEditing(r); setAppendMode(false); setEditorOpen(true); };
  const openAppend = (r: ScheduleRecord) => { clearCarry(); setEditing(r); setAppendMode(true); setEditorOpen(true); };
  const closeEditor = () => { clearCarry(); setEditorOpen(false); };

  // ── 지난 일정의 결과 (lib/outcome.ts) ──────────────────────────────────────────
  // 상세를 닫고 새 일정 화면을 연다: 내용·시각·알림은 원래 일정에서, 날짜는 내일. 저장하면 원래 일정에 "→ 새 날짜"가 남는다
  const startCarry = (rec: ScheduleRecord, kind: OutcomeKind) => {
    setDetailId(null);
    setTimeout(() => {
      const d = carryDefaultDate(rec);
      carryRef.current = { fromId: rec.id, kind };
      setPrefill({
        content: rec.content || rec.transcript || '',
        hour: d.getHours(),
        minute: d.getMinutes(),
        alarmMode: rec.alarmMode ?? 'both',
        remindBefore: rec.remindBefore ?? defaultRemind,
        exactAlarm: rec.exactAlarm !== false,
      });
      setNewDefaultDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      setEditing(null);
      setAppendMode(false);
      setEditorOpen(true);
    }, 450); // 상세→편집기 전환과 같은 지연
  };
  // 표시를 푼다. 미뤄서 알람을 꺼 둔 일정이 아직 오지 않았으면 알람(두 경로)을 다시 건다
  const unmarkOutcome = async (id: string, transform: (list: ScheduleRecord[]) => ScheduleRecord[]) => {
    const rec = recordsRef.current.find((r) => r.id === id);
    let ids: string[] | null = null;
    if (rec && isMovedAway(rec) && !isPastItem(rec) && rec.hasTime && rec.scheduleAt != null) {
      await cancelAlarmGroup(rec.id, rec.notifIds);
      ids = await scheduleAlarm(rec.id, rec.content || rec.transcript, new Date(rec.scheduleAt), rec.alarmMode ?? 'both', {
        remindBefore: rec.remindBefore, exactAlarm: rec.exactAlarm, voiceUri: voiceUriOf(rec),
      });
    }
    const next = transform(recordsRef.current);
    commit(ids ? next.map((r) => (r.id === id ? { ...r, notifIds: ids!.length ? ids! : undefined } : r)) : next);
  };
  // 일정을 지운 뒤 저장한다. 미뤄서 만든 새 일정을 지웠고 원래 일정이 아직 오지 않았으면
  // 원래 일정을 되살린다(표시를 풀고 알람을 다시 건다) — 안 그러면 어디서도 울리지 않는다
  const commitDeleted = async (id: string) => {
    const deleted = recordsRef.current.find((r) => r.id === id);
    const origin = deleted?.carriedFrom ? recordsRef.current.find((r) => r.id === deleted.carriedFrom) : undefined;
    const drop = (list: ScheduleRecord[]) => unlinkDeleted(list.filter((r) => r.id !== id), id);
    if (origin && isMovedAway(origin) && !isPastItem(origin) && origin.outcome?.nextId === id) {
      await unmarkOutcome(origin.id, (list) => setOutcome(drop(list), origin.id, null));
    } else {
      commit(drop(recordsRef.current));
    }
  };
  // 다시 잡은 일정까지 지운다 — 알람(두 경로)도 함께 취소
  const removeLinked = async (linked: ScheduleRecord, fromId: string) => {
    if (sharedPlayer.playingId === linked.id) sharedPlayer.stop();
    removeVoiceAlarm(linked.id);
    if (linked.uri) deleteAudio(linked.uri);
    for (const a of linked.appends ?? []) if (a.uri) deleteAudio(a.uri);
    await cancelAlarmGroup(linked.id, linked.notifIds);
    await unmarkOutcome(fromId, (list) => setOutcome(unlinkDeleted(list.filter((r) => r.id !== linked.id), linked.id), fromId, null));
  };
  const handleOutcome = (rec: ScheduleRecord, kind: OutcomeKind) => {
    const all = recordsRef.current;
    const cur = all.find((r) => r.id === rec.id)?.outcome;
    const linked = cur?.nextId ? all.find((r) => r.id === cur.nextId) : undefined;
    if (cur?.kind === kind) {
      // 같은 버튼을 다시 누르면 표시를 푼다(= 한 것). 다시 잡은 일정이 있으면 어떻게 할지 묻는다
      if (!linked) { unmarkOutcome(rec.id, (list) => setOutcome(list, rec.id, null)).catch(() => {}); return; }
      Alert.alert(t('표시를 풀까요?'), t('다시 잡은 일정({date})도 지울까요?', { date: formatDayHeader(new Date(linked.scheduleAt ?? Date.now())) }), [
        { text: t('취소'), style: 'cancel' },
        { text: t('일정은 남기기'), onPress: () => { unmarkOutcome(rec.id, (list) => dropOutcome(list, rec.id)).catch(() => {}); } },
        { text: t('같이 지우기'), style: 'destructive', onPress: () => { removeLinked(linked, rec.id).catch(() => {}); } },
      ]);
      return;
    }
    if (kind === 'moved' && !linked) { startCarry(rec, 'moved'); return; } // 새 날짜를 저장해야 표시가 남는다
    commit(setOutcome(all, rec.id, kind));
    if (kind === 'partial' && !linked) {
      Alert.alert(t('남은 걸 다시 잡을까요?'), undefined, [
        { text: t('괜찮아요'), style: 'cancel' },
        { text: t('다시 잡기'), onPress: () => startCarry(rec, 'partial') },
      ]);
    }
  };

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
    const ids = at && at.getTime() > Date.now() && !isMovedAway(rec) // 미룬 일정은 설정만 저장(알람은 새 일정 쪽)
      ? await scheduleAlarm(rec.id, rec.content || rec.transcript, at, rec.alarmMode ?? 'both', { remindBefore, exactAlarm, voiceUri: voiceUriOf({ ...rec, voiceAlarm }) })
      : [];
    commit(recordsRef.current.map((r) =>
      r.id === rec.id ? { ...r, remindBefore, exactAlarm, voiceAlarm, notifIds: ids.length ? ids : undefined } : r
    ));
  };

  // 휴가 같은 기간 일정과 겹치면 저장 전에 먼저 알린다 — 그래도 넣을 수 있다(2026-10-18 사용자 요청).
  // ① 하루짜리를 기간 중인 날에 넣을 때 ② 이미 일정이 있는 날들에 기간을 넣을 때
  const confirmOverlap = (date: Date, endAt: number | undefined, excludeId?: string): Promise<boolean> => {
    const all = recordsRef.current;
    let title = '';
    let body = '';
    if (endAt != null) {
      const inside = itemsWithinRange(all, date, new Date(endAt), excludeId);
      if (!inside.length) return Promise.resolve(true);
      title = t('이 기간에 일정 {n}건이 있어요', { n: inside.length });
      body = inside.slice(0, 3).map((r) => `• ${formatDayHeader(new Date(r.scheduleAt!))} ${r.content || r.transcript}`).join('\n')
        + (inside.length > 3 ? `\n…` : '');
    } else {
      const ranges = rangesCovering(all, date, excludeId);
      if (!ranges.length) return Promise.resolve(true);
      const r = ranges[0];
      title = t("'{name}' 기간이에요", { name: (r.content || r.transcript).slice(0, 20) });
      body = `${formatDayHeader(new Date(r.scheduleAt!))} ~ ${formatDayHeader(new Date(r.endAt!))}`;
    }
    return new Promise((resolve) => {
      Alert.alert(title, body + '\n\n' + t('그래도 넣을까요?'), [
        { text: t('취소'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('그대로 넣기'), onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    });
  };

  // 저장 연타 방지 — 두 번 들어가면 같은 일정이 두 개(알람도 두 벌) 생긴다
  const savingRef = useRef(false);
  const handleEditorSave = async (res: EditorResult) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try { await saveEditor(res); } finally { savingRef.current = false; }
  };
  const saveEditor = async (res: EditorResult) => {
    // 기간 일정: 끝나는 날이 시작일 뒤일 때만 (같은 날·앞이면 하루짜리)
    const endAt = res.endDate && startOfDay(res.endDate).getTime() > startOfDay(res.date).getTime()
      ? startOfDay(res.endDate).getTime() : undefined;
    const display = formatDisplay(res.date, true, res.hasTime) + (endAt ? ` ~ ${formatDisplay(new Date(endAt), true, false)}` : '');
    // 날짜·기간이 그대로인 수정(내용만 고침)에는 묻지 않는다
    const before = res.id ? records.find((r) => r.id === res.id) : undefined;
    const dateChanged = !before || !before.scheduleAt || dayKey(new Date(before.scheduleAt)) !== dayKey(res.date) || before.endAt !== endAt;
    if (dateChanged && !(await confirmOverlap(res.date, endAt, res.id))) return; // 취소 → 수정 화면 그대로
    // 미룬 일정을 날짜는 그대로 두고 고치면 미룸 표시를 지키고 알람도 다시 걸지 않는다(날짜를 고치면 표시를 풀고 다시 건다)
    const silenced = !!before && isMovedAway(before) && !isPastItem(before) && !dateChanged;
    const notifAt = res.hasTime && res.date.getTime() > Date.now() && !silenced ? res.date : null;
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
              endAt,
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
      // 다시 잡은 일정의 날짜를 고치면 원래 일정의 "→ 날짜"도 따라간다.
      // 결과를 표시한 지난 일정을 앞으로의 날짜로 옮기면 그 표시는 더 맞지 않으니 지운다
      const synced = syncCarryDate(next, res.id);
      const moved = synced.find((r) => r.id === res.id);
      commit(moved?.outcome && !isPastItem(moved) && !silenced ? dropOutcome(synced, res.id) : synced);
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
        content: res.content, scheduleAt: res.date.getTime(), scheduleDisplay: display, endAt,
        hasDate: true, hasTime: res.hasTime, notifIds, alarmMode: res.alarmMode,
        remindBefore: res.remindBefore, exactAlarm: res.exactAlarm, voiceAlarm, createdAt: Date.now(),
      };
      const carry = carryRef.current;
      // 미룬 원래 일정은 알람(두 경로)을 끈다 — 새 일정 쪽에서만 울린다
      const from = carry?.kind === 'moved' ? records.find((r) => r.id === carry.fromId) : undefined;
      if (from) await cancelAlarmGroup(from.id, from.notifIds);
      const linked = carry ? linkCarry([rec, ...records], carry.fromId, carry.kind, rec) : [rec, ...records];
      commit(from ? linked.map((r) => (r.id === from.id ? { ...r, notifIds: undefined } : r)) : linked);
    }
    clearCarry();
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
    await commitDeleted(id); // 이 일정과 이어진 "→ 날짜"·"← 원래 일정" 연결도 끊는다
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
            // 누르면 그 일정 카드로 바로 간다
            <TouchableOpacity onPress={jumpToNext} activeOpacity={0.6} hitSlop={{ top: 6, bottom: 6 }} accessibilityRole="button" accessibilityLabel={`${t('다음 일정으로 가기')}: ${formatDayHeader(new Date(nextSchedule.scheduleAt))} ${formatTime(new Date(nextSchedule.scheduleAt))}`}>
              <Text style={styles.nextLabel} numberOfLines={bigText ? 2 : 1}>
                {t('다음 ·')}{' '}
                {formatDayHeader(new Date(nextSchedule.scheduleAt))}{' '}
                {formatTime(new Date(nextSchedule.scheduleAt))} ›
              </Text>
            </TouchableOpacity>
          ) : null}
          {nextSchedule?.scheduleAt ? (
            // 자연 폭 측정용(보이지 않음)
            <Text style={[styles.nextLabel, styles.measure]} numberOfLines={1} onLayout={(e) => setNextW(Math.ceil(e.nativeEvent.layout.width))}>
              {t('다음 ·')}{' '}
              {formatDayHeader(new Date(nextSchedule.scheduleAt))}{' '}
              {formatTime(new Date(nextSchedule.scheduleAt))} ›
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {!clockBelow && (
            <Text style={styles.clockText} numberOfLines={1}>{formatTime(currentTime)}</Text>
          )}
          <View style={styles.headerBtns} onLayout={(e) => setBtnsW(Math.ceil(e.nativeEvent.layout.width))}>
            {/* 목록 보기: 한 줄 ↔ 크게 (달력·일정 탭 공용). 아이콘은 누르면 바뀔 모양 */}
            <TouchableOpacity
              style={styles.densityBtn}
              onPress={toggleListCompact}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t(listCompact ? '크게 보기' : '한 줄 보기')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <ListDensityIcon compact={!listCompact} size={16} color={C.textSub} />
            </TouchableOpacity>
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
              {t('일정')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 컨텐츠 ── */}
      {activeTab === 'calendar' ? (
        calMode === 'year' ? (
          <YearView
            year={yearShown}
            minYear={yearRange.min}
            maxYear={yearRange.max}
            busyDays={busyDays}
            onClose={() => setCalMode('month')}
            onPickMonth={pickYearMonth}
          />
        ) : (
          <MonthScroll
            events={calEvents}
            selected={daySheet}
            showLunar={showLunar && lang === 'ko'}
            onToggleLunar={lang === 'ko' ? toggleLunar : undefined}
            onPickDay={setDaySheet}
            onYearPress={(y) => { setYearShown(y); setCalMode('year'); }}
            jumpTo={monthJump}
            density={1} // 칸 크기 단계는 쓰지 않는다 — 두 손가락은 화면 확대(2026-10-18 사용자: 사진처럼 확대)
            onDensity={changeDensity}
            shifts={shifts}
          />
        )
      ) : (
        <View style={styles.allWrap}>
          <AllSchedulesList records={records} onPress={openDetail} onAppend={openAppend} onFixDate={openEdit} onLongPress={openCardMenu} compact={listCompact} onAddOnDate={openNewOn} jump={listJump} />
        </View>
      )}

      {/* ── 녹음 버튼 ── 목록 위에 떠 있으면 마지막 카드를 가려서(2026-10-14 폰 피드백) 목록 아래 고정 영역에 둔다 */}
      <View style={[styles.fabWrap, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.fab} onPress={startRecording} activeOpacity={0.85}>
          <MicIcon size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── 달력에서 누른 날의 일정 ── */}
      <DaySheet
        day={daySheet}
        records={records}
        compact={listCompact}
        shifts={shifts}
        onClose={() => setDaySheet(null)}
        onOpen={(r) => afterSheet(() => openDetail(r))}
        onAppend={(r) => afterSheet(() => openAppend(r))}
        onFixDate={(r) => afterSheet(() => openEdit(r))}
        onAdd={(d) => afterSheet(() => openNewOn(d))}
      />

      {/* ── 설정 (달력 기본 보기 · 백업 · 사용설명서 · 앱 정보) ── */}
      <SettingsSheet
        visible={settingsOpen}
        records={records}
        calendarMode="month"
        onCalendarMode={() => {}}
        shiftsInfo={shiftsInfo}
        shiftsAuto={shifts?.source === 'auto'}
        // Android는 자동 공유 스위치, iOS는 App Group이 생기기 전까지 링크로 가져오기
        shareOn={shareOn}
        onShareOn={siblingShareAvailable ? changeShareOn : undefined}
        onImportShifts={siblingShareAvailable ? undefined : importShifts}
        onClearShifts={clearShifts}
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
        onAlarmChange={handleAlarmChange}
        onDelete={confirmDelete}
        onOutcome={handleOutcome}
        origin={detailRecord?.carriedFrom ? records.find((r) => r.id === detailRecord.carriedFrom) ?? null : null}
        onOpenRecord={(id) => { if (records.some((r) => r.id === id)) setDetailId(id); }}
      />

     </View>
      {/* ── 편집기 ── */}
      <ScheduleEditor
        visible={editorOpen}
        record={editing}
        defaultDate={newDefaultDate ?? new Date()} // 새 달력은 날짜 선택 상태가 없다 — 기본은 오늘, 날짜 시트·빈 날 줄에서 열면 그 날
        markedDays={marked}
        appendMode={appendMode}
        defaultRemind={defaultRemind}
        defaultVoice={defaultVoice}
        prefill={prefill}
        onSave={handleEditorSave}
        onAppend={handleEditorAppend}
        onDelete={handleEditorDelete}
        onClose={closeEditor}
      />

      {/* ── 녹음 오버레이 ── */}
      <Modal visible={showRecorder} animationType="slide" transparent onRequestClose={cancelRecording}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: 44 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, !voice.listening && !voice.sttBlocked && styles.sheetTitleWait]} accessibilityLiveRegion="polite">
              {t(voice.listening ? '🎙 지금 말씀하세요' : voice.sttBlocked ? '🎙 녹음 중' : '준비 중…')}
            </Text>
            {/* 음성 인식을 못 쓰면(아이폰 받아쓰기·Siri 꺼짐 등) "준비 중…"에 멈춘 듯 보이지 않게 이유와 방법을 알린다 */}
            {voice.sttBlocked && <Text style={styles.sheetNotice}>{t(sttBlockedNotice(Platform.OS))}</Text>}
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
  densityBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
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
  // 긴 번역(독일어 등)·큰 글자에서도 기간 제목을 밀어내지 않게 폭 제한

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
  sectionHeaderText: { color: C.textSub, fontSize: 13, fontWeight: '600', letterSpacing: 0.3, flexShrink: 1 },
  sectionHeaderToday: { color: C.text, fontSize: 14 },
  sectionHeaderPast: { color: C.textDim },
  sectionRel: { color: C.accent, fontSize: 13, fontWeight: '700' },
  sectionCal: { marginLeft: 'auto', paddingLeft: 8 },
  // 빈 날 줄 — 점선 사이 작은 글씨. 누르면 그 날 새 일정
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 4 },
  gapLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  gapText: { color: C.textDim, fontSize: 12, fontWeight: '500' },
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
