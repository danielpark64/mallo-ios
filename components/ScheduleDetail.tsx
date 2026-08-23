// ─── 일정 상세 보기 (전체화면 모달) ────────────────────────────────────────────
// 카드 탭 → 상세. 메인 + 추가 엔트리 각각 단어칩 구간재생, 스피커/수화기 선택,
// 전체 내용 복사/TXT/PDF 내보내기.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from './ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useStyles, type Theme } from '../lib/theme';
import { formatDayHeader, formatTime } from '../lib/dateUtils';
import { copyRecords, exportRecordsPdf, exportRecordsTxt } from '../lib/exportUtils';
import { resolveAudioUri, type ScheduleRecord, type TranscriptSegment } from '../lib/storage';

type AudioRoute = 'speaker' | 'earpiece';

// iOS: playback 카테고리에는 defaultToSpeaker 옵션이 적용되지 않아 라우팅이 애매해질 수 있음 →
// 항상 playAndRecord 카테고리를 쓰고 shouldRouteThroughEarpiece로만 스피커/수화기를 가른다.
async function applyRoute(route: AudioRoute) {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: route === 'earpiece',
  }).catch((e) => console.warn('오디오 라우팅 적용 실패:', route, String(e)));
}

async function resetAudioIdle() {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  }).catch(() => {});
}

/** 상세 화면 안의 여러 EntryBlock(메인/추가) 중 하나만 동시에 재생되도록 하는 공유 스토퍼 */
type PlaybackClaimRef = { current: (() => void) | null };

/** 엔트리(메인 또는 추가) 하나의 재생/단어칩 구간재생 블록 — 각자 자기 오디오를 가진다 */
function EntryBlock({
  label,
  uri,
  content,
  transcript,
  segments,
  route,
  onRouteChange,
  activeStopperRef,
}: {
  label: string;
  uri: string;
  content: string;
  transcript: string;
  segments: TranscriptSegment[];
  route: AudioRoute;
  onRouteChange: (r: AudioRoute) => void;
  activeStopperRef: PlaybackClaimRef;
}) {
  const s = useStyles(makeStyles);
  const player = useAudioPlayer(resolveAudioUri(uri) || undefined, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  // 아이콘/하이라이트는 탭한 즉시 로컬 상태로 반응시키고(네이티브 상태 이벤트 지연·누락에
  // 안 흔들리게), 자연 종료만 네이티브 status.playing을 지켜보다가 따라간다.
  const [localPlaying, setLocalPlaying] = useState(false);
  const playing = localPlaying;
  const segEndRef = useRef<number | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const hasSegments = segments.length > 0;
  const text = content || transcript || '(내용 없음)';

  useEffect(() => {
    if (localPlaying && !status.playing) setLocalPlaying(false);
  }, [status.playing]);

  const stopSelfRef = useRef<() => void>(() => {});
  stopSelfRef.current = () => {
    try { player.pause(); } catch {}
    segEndRef.current = null;
    setLocalPlaying(false);
  };
  const stableStop = useRef(() => stopSelfRef.current()).current;

  useEffect(() => () => {
    try { player.pause(); } catch {}
    if (activeStopperRef.current === stableStop) activeStopperRef.current = null;
  }, []);

  const claimPlayback = () => {
    if (activeStopperRef.current && activeStopperRef.current !== stableStop) activeStopperRef.current();
    activeStopperRef.current = stableStop;
  };

  const playFrom = async (startSec: number, endSec: number | null) => {
    // 재생 시작마다 라우팅(스피커/수화기)을 다시 적용해야 한다 — iOS가 새 재생
    // 세션을 시작할 때 라우트를 기본값(수화기)으로 되돌리는 경우가 있어서,
    // 여기서 안 걸어주면 "스피커 켜놨는데 수화기로 들린다"·"몇 번 눌러야 겨우
    // 된다" 증상이 생긴다(실측 확인됨). 예전에 "범위선택 연타 시 세션이 꼬여
    // 재생이 막힌다"고 의심해 뺐었는데, 그 문제의 실제 원인은 다른 곳이었고
    // (재검증 완료) 이 reapply 자체는 원래도 안전했다.
    try {
      claimPlayback();
      await applyRoute(route);
      // applyRoute의 프로미스가 풀려도 iOS 네이티브 오디오 세션이 실제로 활성화되기까지
      // 아주 짧은 지연이 있을 수 있다 — 그 틈에 곧바로 play()를 부르면 세션이 미처
      // 안 붙어서 소리가 아예 안 나는 경우가 있었다(실측). 재생 시작 직전에 살짝 텀을 둔다.
      await new Promise((r) => setTimeout(r, 60));
      segEndRef.current = endSec;
      player.seekTo(startSec);
      player.play();
      setLocalPlaying(true);
    } catch (e) {
      console.warn('구간 재생 실패:', String(e));
    }
  };

  const toggle = () => {
    if (playing) {
      player.pause();
      segEndRef.current = null;
      setLocalPlaying(false);
      return;
    }
    const atEnd = player.duration > 0 && player.currentTime >= player.duration - 0.1;
    const start = player.currentTime > 0 && !atEnd ? player.currentTime : 0;
    playFrom(start, null);
  };

  useEffect(() => {
    if (segEndRef.current != null && player.currentTime >= segEndRef.current) {
      player.pause();
      segEndRef.current = null;
      setLocalPlaying(false);
      return;
    }
    // 전체 재생이 끝까지 도달했는데도 네이티브 status.playing이 false로 안 바뀌는
    // 경우가 있어(iOS, 세션 상태에 따라) currentTime으로도 자연 종료를 직접 감지한다.
    if (
      localPlaying &&
      segEndRef.current == null &&
      player.duration > 0 &&
      player.currentTime >= player.duration - 0.15
    ) {
      try { player.pause(); } catch {}
      setLocalPlaying(false);
    }
  }, [player.currentTime]);

  // iOS에서는 onLongPress가 발동한 같은 터치에 대해 onPress도 한 번 더 불리는 경우가
  // 있어(RN 크로스플랫폼 특성), 롱프레스로 범위선택을 막 시작하자마자 그 즉시 같은 칩의
  // onPress가 겹쳐 들어와 범위가 스스로 취소되던 버그가 있었다 — 롱프레스 직후 첫 onPress
  // 한 번은 그 "겹침 이벤트"로 간주하고 무시한다.
  const suppressNextPressRef = useRef(false);

  const onChipPress = (idx: number) => {
    if (suppressNextPressRef.current) {
      suppressNextPressRef.current = false;
      return;
    }
    if (rangeMode) {
      if (rangeAnchor === null) {
        setRangeAnchor(idx);
      } else {
        const st = Math.min(rangeAnchor, idx);
        const en = Math.max(rangeAnchor, idx);
        playFrom(segments[st].startTimeMillis / 1000, segments[en].endTimeMillis / 1000);
        setRangeAnchor(null);
        setRangeMode(false);
      }
    } else {
      playFrom(segments[idx].startTimeMillis / 1000, segments[idx].endTimeMillis / 1000);
    }
  };

  const onChipLongPress = (idx: number) => {
    suppressNextPressRef.current = true;
    setRangeMode(true);
    setRangeAnchor(idx);
  };

  const currentMs = player.currentTime * 1000;
  // 이 녹음의 세그먼트에 실제 타임스탬프가 없는 경우(전부 0/0 — STT 중간 결과만 잡혔던
  // 예전 녹음 등)가 있다. 그럴 때는 전체 재생 길이를 단어 수로 균등 분배해 "대략 지금
  // 읽는 위치"를 보여준다 — 정확한 단어 경계는 아니지만 아예 안 뜨는 것보단 낫다.
  const hasRealTimestamps = segments.some((seg) => seg.endTimeMillis > 0);
  const activeIdx =
    !hasSegments || !playing
      ? -1
      : hasRealTimestamps
        ? segments.findIndex((seg) => currentMs >= seg.startTimeMillis && currentMs < seg.endTimeMillis)
        : Math.min(
            segments.length - 1,
            Math.floor((player.currentTime / Math.max(player.duration, 0.01)) * segments.length)
          );

  return (
    <View style={s.entryBlock}>
      <Text style={s.entryLabel}>{label}</Text>

      {hasSegments ? (
        <>
          <View style={s.wordFlow}>
            {segments.map((seg, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  s.word,
                  rangeMode && rangeAnchor === idx && s.wordAnchor,
                  idx === activeIdx && s.wordPlaying,
                ]}
                onPress={() => onChipPress(idx)}
                onLongPress={() => onChipLongPress(idx)}
                activeOpacity={0.55}
              >
                <Text
                  style={[
                    s.wordText,
                    (idx === activeIdx || (rangeMode && rangeAnchor === idx)) && s.wordTextOn,
                  ]}
                >
                  {seg.segment}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.chipHint}>
            {rangeMode
              ? rangeAnchor === null
                ? '시작 단어를 누르세요'
                : '끝 단어를 누르면 그 구간이 재생됩니다'
              : '단어를 누르면 그 부분만 재생 · 길게 누르면 범위선택'}
          </Text>
        </>
      ) : (
        <Text style={s.contentText}>{text}</Text>
      )}

      {uri ? (
        <>
          <View style={s.playRow}>
            <TouchableOpacity style={s.playBtn} onPress={toggle} activeOpacity={0.8}>
              <Text style={s.playBtnIcon}>{playing ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <View style={s.routeToggle}>
              <TouchableOpacity
                style={[s.routeBtn, route === 'speaker' && s.routeBtnOn]}
                onPress={() => onRouteChange('speaker')}
              >
                <Text style={[s.routeBtnText, route === 'speaker' && s.routeBtnTextOn]}>🔊 스피커</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.routeBtn, route === 'earpiece' && s.routeBtnOn]}
                onPress={() => onRouteChange('earpiece')}
              >
                <Text style={[s.routeBtnText, route === 'earpiece' && s.routeBtnTextOn]}>📞 수화기</Text>
              </TouchableOpacity>
            </View>
            {hasSegments && (
              <TouchableOpacity
                style={[s.rangeBtn, rangeMode && s.rangeBtnOn]}
                onPress={() => { setRangeMode((m) => !m); setRangeAnchor(null); }}
              >
                <Text style={[s.rangeBtnText, rangeMode && s.rangeBtnTextOn]}>범위선택</Text>
              </TouchableOpacity>
            )}
          </View>
          {!hasSegments && (
            <Text style={s.unsupported}>
              {Platform.OS === 'android'
                ? '이 기기는 OS 버전으로 인해 부분별 녹음 재생을 사용할 수 없습니다 (Android 14 이상 필요)'
                : '이 녹음에는 단어별 재생 정보가 없어요 (예전 녹음이거나 인식이 불완전했을 수 있어요)'}
            </Text>
          )}
        </>
      ) : null}
    </View>
  );
}

export function ScheduleDetail({
  visible,
  record,
  onClose,
  onEdit,
  onAppend,
}: {
  visible: boolean;
  record: ScheduleRecord | null;
  onClose: () => void;
  onEdit: (r: ScheduleRecord) => void;
  onAppend: (r: ScheduleRecord) => void;
}) {
  const s = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState<AudioRoute>('speaker');
  // 메인/추가 엔트리 중 하나만 동시에 재생되도록 하는 공유 스토퍼
  const activeStopperRef = useRef<(() => void) | null>(null);

  const content = record?.content || record?.transcript || '(내용 없음)';
  // 구버전 데이터 호환: 과거엔 추가 내용이 content 문자열에 '\n• '로 이어붙여 저장됨
  const [mainContent, ...legacyNotes] = content.split('\n• ');
  const segments = useMemo(() => record?.segments ?? [], [record?.segments]);

  useEffect(() => {
    if (visible) {
      applyRoute(route);
    } else {
      resetAudioIdle();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const switchRoute = async (r: AudioRoute) => {
    setRoute(r);
    await applyRoute(r);
  };

  if (!record) return null;

  const when =
    record.scheduleAt != null
      ? `${formatDayHeader(new Date(record.scheduleAt))}${
          record.hasTime ? '  ' + formatTime(new Date(record.scheduleAt)) : '  (시간 미정)'
        }`
      : '날짜 미정';
  const mode = record.alarmMode;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.screen} edges={['left', 'right', 'bottom']}>
        <StatusBar style="auto" />
        {/* 상단 네비 — Modal 안에서는 SafeAreaView의 top 자동 인셋이 가끔 안 먹어서(특히
            중첩 Modal 상황) insets.top을 직접 적용해 확실하게 보장한다 */}
        <View style={[s.navBar, { paddingTop: insets.top }]}>
          <TouchableOpacity style={s.navBtn} onPress={onClose}>
            <Text style={s.navCloseText}>닫기</Text>
          </TouchableOpacity>
          <Text style={s.navTitle}>일정 상세</Text>
          <TouchableOpacity style={s.navBtn} onPress={() => onEdit(record)}>
            <Text style={s.navEditText}>수정</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {/* 일시 */}
          <Text style={s.when}>{when}</Text>
          {mode ? (
            <View style={s.badgeRow}>
              {mode !== 'vibe' && <Text style={s.badgeIcon}>🔔</Text>}
              {mode !== 'sound' && (
                <Image source={require('../assets/vibrate_icon.png')} style={s.badgeVibe} />
              )}
              <Text style={s.badgeText}>
                {mode === 'both' ? '소리 + 진동' : mode === 'sound' ? '소리' : '진동'}
              </Text>
            </View>
          ) : null}

          {/* 내용 — 메인 + 추가 엔트리를 각각 독립적으로 재생/구간선택 */}
          <Text style={s.sectionLabel}>내용</Text>
          <EntryBlock
            label="메인"
            uri={record.uri}
            content={mainContent}
            transcript={record.transcript}
            segments={segments}
            route={route}
            onRouteChange={switchRoute}
            activeStopperRef={activeStopperRef}
          />
          {(record.appends ?? []).map((a, i) => (
            <EntryBlock
              key={a.id}
              label={`추가 ${i + 1} · ${formatTime(new Date(a.createdAt))}`}
              uri={a.uri}
              content={a.content}
              transcript={a.transcript}
              activeStopperRef={activeStopperRef}
              segments={a.segments ?? []}
              route={route}
              onRouteChange={switchRoute}
            />
          ))}

          {/* 구버전 메모(문자열 이어붙임) 호환 표시 */}
          {legacyNotes.length > 0 && (
            <>
              <Text style={s.sectionLabel}>메모</Text>
              {legacyNotes.map((n, i) => (
                <Text key={i} style={s.noteText}>• {n}</Text>
              ))}
            </>
          )}

          {/* 내보내기 — 메인 + 모든 추가 엔트리 텍스트를 함께 포함 */}
          <Text style={s.sectionLabel}>내보내기</Text>
          <View style={s.exportRow}>
            <TouchableOpacity style={s.exportBtn} onPress={() => copyRecords([record])}>
              <Text style={s.exportBtnText}>복사</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.exportBtn} onPress={() => exportRecordsTxt([record])}>
              <Text style={s.exportBtnText}>텍스트</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.exportBtn} onPress={() => exportRecordsPdf([record])}>
              <Text style={s.exportBtnText}>PDF</Text>
            </TouchableOpacity>
          </View>

          {/* 내용 추가 */}
          <TouchableOpacity style={s.appendBtn} onPress={() => onAppend(record)} activeOpacity={0.85}>
            <Text style={s.appendBtnText}>＋ 내용 추가</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.c.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, minHeight: 52,
    borderBottomWidth: 1, borderBottomColor: t.c.border,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  navCloseText: { color: t.c.textSub, fontSize: 16, fontWeight: '600' },
  navEditText: { color: t.c.accent, fontSize: 16, fontWeight: '700' },
  navTitle: { color: t.c.text, fontSize: 16, fontWeight: '700' },

  body: { paddingHorizontal: 20, paddingBottom: 48 },
  when: { color: t.c.text, fontSize: 20, fontWeight: '700', marginTop: 18 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  badgeIcon: { fontSize: 14 },
  badgeVibe: { width: 16, height: 16, resizeMode: 'contain' },
  badgeText: { color: t.c.textSub, fontSize: 13, fontWeight: '600', marginLeft: 2 },

  sectionLabel: { color: t.c.accent, fontSize: 13, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  contentText: { color: t.c.text, fontSize: 17, lineHeight: 26 },
  noteText: { color: t.c.textSub, fontSize: 15, lineHeight: 23, marginBottom: 4 },

  entryBlock: {
    backgroundColor: t.c.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: t.c.border,
  },
  entryLabel: { color: t.c.textSub, fontSize: 12, fontWeight: '700', marginBottom: 8 },

  // 전체 문장이 자연스럽게 읽히도록 단어를 텍스트처럼 배치 (터치는 단어 단위)
  wordFlow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  word: {
    borderRadius: 6,
    paddingHorizontal: 3, paddingVertical: 4,
    marginRight: 4, marginBottom: 4,
  },
  wordAnchor: { backgroundColor: t.c.accent },
  wordPlaying: { backgroundColor: t.c.red },
  wordText: { color: t.c.text, fontSize: 17, lineHeight: 25, fontWeight: '500' },
  wordTextOn: { color: t.c.onAccent, fontWeight: '700' },
  chipHint: { color: t.c.textDim, fontSize: 12, marginTop: 8 },

  playRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  playBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: t.c.red, alignItems: 'center', justifyContent: 'center',
  },
  playBtnIcon: { fontSize: 17, color: t.c.onAccent },
  routeToggle: { flexDirection: 'row', backgroundColor: t.c.surfaceAlt, borderRadius: 10, padding: 3 },
  routeBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  routeBtnOn: { backgroundColor: t.c.accent },
  routeBtnText: { color: t.c.textSub, fontSize: 12, fontWeight: '700' },
  routeBtnTextOn: { color: t.c.onAccent },
  rangeBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: t.c.surfaceAlt,
  },
  rangeBtnOn: { backgroundColor: t.c.accent },
  rangeBtnText: { color: t.c.textSub, fontSize: 12, fontWeight: '700' },
  rangeBtnTextOn: { color: t.c.onAccent },
  unsupported: { color: t.c.textDim, fontSize: 12, marginTop: 10, lineHeight: 17 },

  exportRow: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1, backgroundColor: t.c.surface, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: t.c.border,
  },
  exportBtnText: { color: t.c.text, fontSize: 15, fontWeight: '600' },

  appendBtn: {
    backgroundColor: t.c.accent, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 24,
  },
  appendBtnText: { color: t.c.onAccent, fontSize: 16, fontWeight: '700' },
});
