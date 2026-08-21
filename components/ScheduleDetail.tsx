// ─── 일정 상세 보기 (전체화면 모달) ────────────────────────────────────────────
// 카드 탭 → 상세. 메인 + 추가 엔트리 각각 단어칩 구간재생, 스피커/수화기 선택,
// 전체 내용 복사/TXT/PDF 내보내기.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { C } from '../lib/colors';
import { formatDayHeader, formatTime } from '../lib/dateUtils';
import { copyRecords, exportRecordsPdf, exportRecordsTxt } from '../lib/exportUtils';
import type { ScheduleRecord, TranscriptSegment } from '../lib/storage';

type AudioRoute = 'speaker' | 'earpiece';

// iOS: playback 카테고리에는 defaultToSpeaker 옵션이 적용되지 않아 라우팅이 애매해질 수 있음 →
// 항상 playAndRecord 카테고리를 쓰고 shouldRouteThroughEarpiece로만 스피커/수화기를 가른다.
async function applyRoute(route: AudioRoute) {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: route === 'earpiece',
  }).catch(() => {});
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
  const player = useAudioPlayer(uri || undefined, { updateInterval: 100 });
  const [playing, setPlaying] = useState(false);
  const segEndRef = useRef<number | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const hasSegments = segments.length > 0;
  const text = content || transcript || '(내용 없음)';

  const stopSelfRef = useRef<() => void>(() => {});
  stopSelfRef.current = () => {
    try { player.pause(); } catch {}
    setPlaying(false);
    segEndRef.current = null;
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
    claimPlayback();
    await applyRoute(route);
    segEndRef.current = endSec;
    player.seekTo(startSec);
    player.play();
    setPlaying(true);
  };

  const toggle = () => {
    if (playing) {
      player.pause();
      setPlaying(false);
      segEndRef.current = null;
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
      setPlaying(false);
    } else if (player.duration > 0 && player.currentTime > 0 && player.currentTime >= player.duration - 0.1) {
      setPlaying(false);
    }
  }, [player.currentTime]);

  const onChipPress = (idx: number) => {
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
    setRangeMode(true);
    setRangeAnchor(idx);
  };

  const currentMs = player.currentTime * 1000;
  const activeIdx =
    hasSegments && playing
      ? segments.findIndex((seg) => currentMs >= seg.startTimeMillis && currentMs < seg.endTimeMillis)
      : -1;

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
              이 기기는 OS 버전으로 인해 부분별 녹음 재생을 사용할 수 없습니다
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
      <SafeAreaView style={s.screen}>
        {/* 상단 네비 */}
        <View style={s.navBar}>
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

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: 52,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  navCloseText: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  navEditText: { color: C.accent, fontSize: 16, fontWeight: '700' },
  navTitle: { color: C.text, fontSize: 16, fontWeight: '700' },

  body: { paddingHorizontal: 20, paddingBottom: 48 },
  when: { color: C.text, fontSize: 20, fontWeight: '700', marginTop: 18 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  badgeIcon: { fontSize: 14 },
  badgeVibe: { width: 16, height: 16, resizeMode: 'contain' },
  badgeText: { color: C.textSub, fontSize: 13, fontWeight: '600', marginLeft: 2 },

  sectionLabel: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  contentText: { color: C.text, fontSize: 17, lineHeight: 26 },
  noteText: { color: C.textSub, fontSize: 15, lineHeight: 23, marginBottom: 4 },

  entryBlock: {
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  entryLabel: { color: C.textSub, fontSize: 12, fontWeight: '700', marginBottom: 8 },

  // 전체 문장이 자연스럽게 읽히도록 단어를 텍스트처럼 배치 (터치는 단어 단위)
  wordFlow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  word: {
    borderRadius: 6,
    paddingHorizontal: 3, paddingVertical: 4,
    marginRight: 4, marginBottom: 4,
  },
  wordAnchor: { backgroundColor: C.accent },
  wordPlaying: { backgroundColor: C.red },
  wordText: { color: C.text, fontSize: 17, lineHeight: 25, fontWeight: '500' },
  wordTextOn: { color: '#fff', fontWeight: '700' },
  chipHint: { color: C.textDim, fontSize: 12, marginTop: 8 },

  playRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  playBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.red, alignItems: 'center', justifyContent: 'center',
  },
  playBtnIcon: { fontSize: 17, color: '#fff' },
  routeToggle: { flexDirection: 'row', backgroundColor: C.surfaceHigh, borderRadius: 10, padding: 3 },
  routeBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  routeBtnOn: { backgroundColor: C.accent },
  routeBtnText: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  routeBtnTextOn: { color: '#fff' },
  rangeBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.surfaceHigh,
  },
  rangeBtnOn: { backgroundColor: C.accent },
  rangeBtnText: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  rangeBtnTextOn: { color: '#fff' },
  unsupported: { color: C.textDim, fontSize: 12, marginTop: 10, lineHeight: 17 },

  exportRow: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  exportBtnText: { color: C.text, fontSize: 15, fontWeight: '600' },

  appendBtn: {
    backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 24,
  },
  appendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
