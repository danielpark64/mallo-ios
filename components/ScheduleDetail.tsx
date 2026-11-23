// ─── 일정 화면 (보기 + 고치기, 전체화면 모달) ───────────────────────────────────────
// 카드 탭 → 이 화면. 2026-11-22 상세와 수정 화면을 하나로 합쳤다(시안 승낙).
// 날짜 줄·알림 칩·[✏️ 고치기]를 누르면 그 부분만 팝업(DetailSheets)에서 고치고 [완료]로 바로 저장한다.
// 저장 직후 아래에 "바꿨어요 · 되돌리기"를 잠깐 보여 준다(화면이 떠 있을 때만 쓰는 setTimeout 하나).
// 메인 + 추가 엔트리 각각 단어칩 구간재생(탭·길게 끌기), 스피커/수화기 선택은 그대로.
import { useSharedPlayer } from '../lib/sharedPlayer';
import { pauseIfPlaying } from '../lib/audioPause';
import { voiceUriOf } from '../lib/voiceAlarm';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, ScrollView, StyleSheet, TouchableOpacity, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Text } from './AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useFontScale, useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { normalizeRemind, remindLabel } from '../lib/reminders';
import { MODE_EMOJI, MODE_LABEL, type AlarmMode } from './ScheduleFields';
import { AlarmSheet, AttachSheet, ContentSheet, DateSheet, ExportSheet, OutcomeSheet, PostponeHelp, type SheetSave } from './DetailSheets';
import { formatDayHeader, formatTime, isPastItem } from '../lib/dateUtils';
import { OUTCOME_BUTTON, isMovedAway, nextWhen, outcomeTag } from '../lib/outcome';
import { copyRecords } from '../lib/exportUtils';
import { ExportPreview, type ExportKind } from './ExportPreview';
import { AttachmentSection, useAttachActions } from './AttachmentSection';
import { SendSheet } from './SendSheet';
import { canSend, receivedLabel } from '../lib/sendSchedule';
import type { Attachment, OutcomeKind, ScheduleRecord, TranscriptSegment } from '../lib/storage';
import {
  activeSegmentIndex,
  chipsForEntry,
  extendRange,
  findChipAt,
  normalizeRange,
  rangeText,
  type ChipLayout,
  type WordRange,
} from '../lib/wordRange';

type AudioRoute = 'speaker' | 'earpiece';

// iOS 라우팅:
// - 스피커 모드는 재생 전용(playback) 카테고리. 이어폰/블루투스가 꽂혀 있으면 그쪽으로, 아니면 스피커로 — 메인 화면 카드와 동일.
//   (예전처럼 항상 playAndRecord를 쓰면 expo-audio가 블루투스 A2DP를 허용하지 않아 이어폰을 낀 채로는
//    소리가 폰 본체(수화기)로만 가서 "아무 소리도 안 들리는" 상태가 된다 — 2026-10-12 폰 확인)
// - 수화기 모드만 playAndRecord + shouldRouteThroughEarpiece로 수화기에 보낸다.
async function applyRoute(route: AudioRoute) {
  await setAudioModeAsync({
    allowsRecording: route === 'earpiece',
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

/** 길게 누르기 판정 시간(ms)과, 그 전에 이만큼 움직이면 스크롤로 간주해 선택을 시작하지 않는 거리(px) */
const LONG_PRESS_MS = 350;
const MOVE_SLOP = 8;

/** 엔트리(메인 또는 추가) 하나의 재생/단어칩 구간재생 블록 — 각자 자기 오디오를 가진다 */
function EntryBlock({
  label,
  uri,
  durationSec,
  content,
  transcript,
  segments,
  route,
  onRouteChange,
  activeStopperRef,
  onSelectingChange,
  headerRight,
  onPressText,
}: {
  label: string;
  /** 제목 줄 오른쪽(메인 내용의 [✏️ 고치기]) */
  headerRight?: React.ReactNode;
  /** 녹음이 없는 항목: 글을 누르면(단어 재생이 없으니) 바로 고치기를 연다 */
  onPressText?: () => void;
  uri: string;
  /** 녹음 길이(초). 플레이어가 duration을 0으로 보고하는 기기에서 종료 판정의 예비값 */
  durationSec: number;
  content: string;
  transcript: string;
  segments: TranscriptSegment[];
  route: AudioRoute;
  onRouteChange: (r: AudioRoute) => void;
  activeStopperRef: PlaybackClaimRef;
  /** 끌어서 범위선택 중인지 — 부모 ScrollView가 이 동안 스크롤을 잠근다 */
  onSelectingChange?: (selecting: boolean) => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const player = useAudioPlayer(uri || undefined, { updateInterval: 100 });
  const shared = useSharedPlayer();
  // 이 항목을 읽어 줄 때의 재생 id (녹음 없는 항목만 씀)
  const speakId = `tts:${label}:${content.length}`;
  // player.currentTime은 리렌더를 일으키지 않는 네이티브 getter → 구간 종료 감지/단어 하이라이트가
  // 동작하지 않았음. 상태 구독 훅으로 100ms마다 갱신되는 반응형 값을 쓴다.
  const status = useAudioPlayerStatus(player);
  const [playing, setPlaying] = useState(false);
  // 제스처 핸들러(useMemo 클로저)에서 최신 재생 상태를 읽기 위한 ref
  const playingRef = useRef(false);
  playingRef.current = playing;
  const segEndRef = useRef<number | null>(null);
  // 재생 시작 시각/위치 — 재생 위치를 "시계"로도 계산하기 위해 기억한다.
  // 플레이어 status는 (1) 시작 직후 이전 재생의 stale 값이 오고 (2) 기기에 따라 갱신이 늦거나 멈출 수 있어
  // 단어 하이라이트와 구간 종료를 status에만 맡기면 눈에 보이는 진행이 끊긴다.
  const playStartedAtRef = useRef(0);
  const playStartSecRef = useRef(0);
  // 재생을 시작한 순간의 status 객체. useAudioPlayerStatus는 이벤트마다 새 객체를 주므로
  // 같은 객체가 아직 보이면 "이전 재생의 값"이다 — 끝 지점/didJustFinish를 보고 즉시 멈추는 오판을 막는다
  const statusRef = useRef(status);
  statusRef.current = status;
  const statusAtStartRef = useRef<typeof status | null>(null);
  // 재생 중 80ms마다 리렌더해 시계 기준 위치로 하이라이트를 움직인다
  const [, setTick] = useState(0);
  const text = content || transcript || t('(내용 없음)');

  // ── 범위선택 상태 ──────────────────────────────────────────────────────────────
  // range: 확정된 선택(재생이 끝나도 유지 → "다시 듣기"). selecting: 손가락으로 끌어 넓히는 중.
  const [range, setRangeState] = useState<WordRange | null>(null);
  const [selecting, setSelecting] = useState(false);
  // 제스처 핸들러는 리렌더 사이에 연달아 불릴 수 있어(move 직후 release) ref를 즉시 갱신해 둔다
  const rangeRef = useRef<WordRange | null>(null);
  const setRange = (r: WordRange | null) => {
    rangeRef.current = r;
    setRangeState(r);
  };
  const selectingRef = useRef(false);
  const chipLayoutsRef = useRef<Array<ChipLayout | undefined>>([]);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const stopSelfRef = useRef<() => void>(() => {});
  stopSelfRef.current = () => {
    pauseIfPlaying(player, playingRef.current);
    setPlaying(false);
    segEndRef.current = null;
  };
  const stableStop = useRef(() => stopSelfRef.current()).current;

  useEffect(() => () => {
    pauseIfPlaying(player, playingRef.current);
    if (activeStopperRef.current === stableStop) activeStopperRef.current = null;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (selectingRef.current) onSelectingChange?.(false); // 끌기 도중 모달이 닫혀도 부모 스크롤 잠금을 남기지 않는다
  }, []);

  const claimPlayback = () => {
    if (activeStopperRef.current && activeStopperRef.current !== stableStop) activeStopperRef.current();
    activeStopperRef.current = stableStop;
  };

  const playFrom = async (startSec: number, endSec: number | null) => {
    shared.stop(); // 읽어 주기(폰 음성)나 목록 재생이 돌고 있으면 멈춘다
    claimPlayback();
    await applyRoute(route);
    segEndRef.current = endSec;
    // seekTo는 비동기 — 기다리지 않고 play()하면(특히 끝까지 들은 뒤 다시 ▶) 이전 위치(끝)에서 재생이 시작돼
    // 바로 끝나 버리고, 하이라이트만 시계 기준으로 끝까지 움직여 "소리는 안 나는데 단어만 움직이는" 상태가 된다 (2026-10-12 폰)
    try { await player.seekTo(startSec); } catch {}
    playStartSecRef.current = startSec;
    playStartedAtRef.current = Date.now();
    statusAtStartRef.current = statusRef.current;
    player.play();
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, [playing]);

  // 전체 길이(초): 플레이어가 알려주면 그 값, 아니면(0) 저장된 녹음 길이
  const totalSec = status.duration > 0 ? status.duration : durationSec;

  // 단어칩: 저장된 단어 시각이 표시 글과 같으면 그대로(쓸모없는 시각은 합성), 글을 고쳐 단어가 달라졌거나
  // 단어 시각이 없으면 표시 글을 나눠 근사 시각을 합성한다 — 녹음이 있는 한 칩 탭·끌기·따라가기가 항상 동작.
  const segs = useMemo(
    () => (uri ? chipsForEntry(segments, text, Math.max(0, totalSec) * 1000) : []),
    [uri, text, segments, totalSec],
  );
  const hasSegments = segs.length > 0;

  const toggle = () => {
    if (playing) {
      pauseIfPlaying(player, true);
      setPlaying(false);
      segEndRef.current = null;
      return;
    }
    // 끝 근처(마지막 단어를 듣고 멈춘 상태 등)에서 ▶를 누르면 처음부터 — 끝 지점에서 이어 재생하면
    // 바로 끝나 버리거나, duration을 못 받는 기기에선 ⏸·마지막 단어에 고착된다
    const nearEnd = totalSec > 0 && status.currentTime >= totalSec - 0.5;
    const start = status.currentTime > 0 && !nearEnd ? status.currentTime : 0;
    playFrom(start, null);
  };

  // 현재 재생 위치(초). 시작 위치 + 경과 시간(시계)과 플레이어 status 중 믿을 만한 쪽을 쓴다.
  // status가 (1) 재생 시작 때 본 그 객체이거나 (2) 시작 위치보다 앞이거나 (3) 시계보다 1초 이상 앞서면 이전 재생의 값 → 시계만.
  // status가 살아 있으면 status를 우선하되, 갱신이 멈춘 기기를 위해 시계가 0.3초 넘게 앞서면 시계를 따른다
  // (0.3초는 seek/세션 활성화 지연 — 시계를 그대로 쓰면 마지막 단어 꼬리가 잘린다).
  const clockSec = playStartSecRef.current + (Date.now() - playStartedAtRef.current) / 1000;
  const statusStale =
    status === statusAtStartRef.current ||
    status.currentTime < playStartSecRef.current - 0.05 ||
    status.currentTime > clockSec + 1;
  const posSec = playing ? (statusStale ? clockSec : Math.max(status.currentTime, clockSec - 0.3)) : status.currentTime;

  const playRange = (r: WordRange) =>
    playFrom(segs[r.start].startTimeMillis / 1000, segs[r.end].endTimeMillis / 1000);


  useEffect(() => {
    if (!playing) return;
    if (segEndRef.current != null && posSec >= segEndRef.current) {
      // 선택한 단어/구간의 끝에 도달 → 정지 (소리가 안 나와 status가 멈춰 있어도 시계로 끝낸다)
      pauseIfPlaying(player, true);
      segEndRef.current = null;
      setPlaying(false);
    } else if ((status.didJustFinish && !statusStale) || (totalSec > 0 && posSec >= totalSec - 0.1)) {
      segEndRef.current = null;
      setPlaying(false);
    }
  }, [posSec, status.didJustFinish, statusStale, totalSec, playing]);

  // ── 단어칩 제스처: 탭 = 한 단어 재생, 길게 누른 채 끌기 = 범위선택 후 재생 ──────────
  // 칩마다 Touchable을 두면 "길게 누르기 → 다른 칩으로 끌기"를 한 제스처로 잇기 어려워
  // 컨테이너 하나가 터치를 받고 좌표로 칩을 찾는다.
  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const setSelectingState = (on: boolean) => {
    selectingRef.current = on;
    setSelecting(on);
    onSelectingChange?.(on);
  };
  // 칩(자식)에 pointerEvents="none"을 줘서 터치 target이 항상 컨테이너가 되게 했으므로
  // locationX/Y가 곧 컨테이너 기준 좌표다 — 스크롤 위치나 measure 타이밍과 무관
  const localPoint = (e: GestureResponderEvent) => ({
    x: e.nativeEvent.locationX,
    y: e.nativeEvent.locationY,
  });
  const chipAt = (e: GestureResponderEvent) => {
    const p = localPoint(e);
    return findChipAt(chipLayoutsRef.current, p.x, p.y);
  };
  const beginSelecting = (idx: number) => {
    anchorRef.current = idx;
    if (playingRef.current) stopSelfRef.current(); // pan 클로저의 playing은 stale일 수 있어 ref로 읽는다
    setRange({ start: idx, end: idx });
    setSelectingState(true);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => false,
        // 선택 중이 아닐 땐 ScrollView가 스크롤을 가져가도록 양보, 선택 중엔 붙잡는다
        onPanResponderTerminationRequest: () => !selectingRef.current,
        onPanResponderGrant: (e) => {
          movedRef.current = false;
          clearPressTimer();
          if (selectingRef.current) setSelectingState(false); // release 없이 끝난 선택 잔재 정리
          const idx = chipAt(e);
          anchorRef.current = idx;
          if (idx != null) {
            pressTimerRef.current = setTimeout(() => {
              pressTimerRef.current = null;
              if (!movedRef.current) beginSelecting(idx);
            }, LONG_PRESS_MS);
          }
        },
        onPanResponderMove: (e, g) => {
          if (!selectingRef.current) {
            if (Math.abs(g.dx) > MOVE_SLOP || Math.abs(g.dy) > MOVE_SLOP) {
              movedRef.current = true;
              clearPressTimer();
            }
            return;
          }
          const idx = chipAt(e);
          if (idx == null || anchorRef.current == null) return;
          const next = normalizeRange(anchorRef.current, idx);
          const cur = rangeRef.current;
          if (!cur || cur.start !== next.start || cur.end !== next.end) setRange(next);
        },
        onPanResponderRelease: () => {
          clearPressTimer();
          if (selectingRef.current) {
            // 끌기 끝 → 선택된 범위 재생
            setSelectingState(false);
            const r = rangeRef.current;
            if (r) playRange(r);
            return;
          }
          if (movedRef.current) return; // 스크롤 제스처였음
          const idx = anchorRef.current;
          if (idx == null) return;
          const r = rangeRef.current;
          if (r) {
            // 선택이 남아 있을 때의 탭: 범위 안이면 다시 듣기, 밖이면 그쪽으로 범위 확장
            const next = extendRange(r, idx);
            if (next !== r) setRange(next);
            playRange(next);
            return;
          }
          playFrom(segs[idx].startTimeMillis / 1000, segs[idx].endTimeMillis / 1000);
        },
        onPanResponderTerminate: () => {
          clearPressTimer();
          if (!selectingRef.current) return;
          // 선택 중엔 termination request를 거부하므로, 그래도 terminate가 오면 네이티브 쪽 취소다
          // (iOS ScrollView가 터치를 가로챈 경우 등). 손을 뗀 것과 같이 선택 범위를 재생한다.
          setSelectingState(false);
          const r = rangeRef.current;
          if (r) playRange(r);
        },
      }),
    // segs/route는 ref 경유가 아니라 클로저로 쓰므로 바뀌면 새로 만든다
    [segs, route],
  );

  const onChipLayout = (idx: number) => (e: LayoutChangeEvent) => {
    chipLayoutsRef.current[idx] = e.nativeEvent.layout;
  };
  const clearRange = () => {
    if (playing && segEndRef.current != null) stopSelfRef.current();
    setRange(null);
  };

  const activeIdx = hasSegments && playing ? activeSegmentIndex(segs, posSec * 1000) : -1;
  const inRange = (idx: number) => !!range && idx >= range.start && idx <= range.end;
  const isEdge = (idx: number) => !!range && (idx === range.start || idx === range.end);

  return (
    <View style={s.entryBlock}>
      <View style={s.entryHead}>
        <Text style={s.entryLabel}>{label}</Text>
        {headerRight}
      </View>

      {hasSegments ? (
        <>
          <View style={s.wordFlow} testID="wordFlow" {...pan.panHandlers}>
            {segs.map((seg, idx) => {
              const playingNow = idx === activeIdx;
              const selected = inRange(idx);
              return (
                <View
                  key={idx}
                  testID={`chip-${idx}`}
                  pointerEvents="none"
                  onLayout={onChipLayout(idx)}
                  style={[
                    s.word,
                    selected && s.wordInRange,
                    selected && isEdge(idx) && s.wordRangeEdge,
                    selected && selecting && s.wordSelecting,
                    playingNow && s.wordPlaying,
                  ]}
                >
                  <Text style={[s.wordText, (playingNow || (selected && isEdge(idx))) && s.wordTextOn]}>
                    {seg.segment}
                  </Text>
                </View>
              );
            })}
          </View>

          {range ? (
            <View style={s.rangeBar}>
              <TouchableOpacity style={s.rangeReplay} onPress={() => playRange(range)} activeOpacity={0.8}>
                <Text style={s.rangeReplayText}>{t('▶ {n}단어 다시 듣기', { n: range.end - range.start + 1 })}</Text>
              </TouchableOpacity>
              <Text style={s.rangeWords} numberOfLines={1}>“{rangeText(segs, range)}”</Text>
              <TouchableOpacity
                style={s.rangeClear}
                onPress={clearRange}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t('범위 해제')}
              >
                <Text style={s.rangeClearText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={s.chipHint}>
            {selecting
              ? t('끌어서 범위를 넓히세요 · 손을 떼면 재생')
              : range
                ? t('다른 단어를 누르면 범위가 늘어나요 · ✕로 해제')
                : t('단어 탭: 그 단어만 · 길게 누른 채 끌기: 범위 재생')}
          </Text>
        </>
      ) : onPressText ? (
        <TouchableOpacity onPress={onPressText} activeOpacity={0.7} accessibilityRole="button" accessibilityHint={t('✏️ 고치기')} testID="content-text">
          <Text style={s.contentText}>{text}</Text>
        </TouchableOpacity>
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
                <Text style={[s.routeBtnText, route === 'speaker' && s.routeBtnTextOn]}>{t('🔊 스피커')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.routeBtn, route === 'earpiece' && s.routeBtnOn]}
                onPress={() => onRouteChange('earpiece')}
              >
                <Text style={[s.routeBtnText, route === 'earpiece' && s.routeBtnTextOn]}>{t('📞 수화기')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {!hasSegments && (
            <Text style={s.unsupported}>{t('녹음 길이를 알 수 없어 단어별 재생을 쓸 수 없어요')}</Text>
          )}
        </>
      ) : (
        <>
          {/* 녹음이 없는 항목: 폰 음성으로 글을 읽어 준다 (공용 재생기 — 다른 재생과 겹치지 않음) */}
          {(content || transcript).trim() ? (
            <View style={s.playRow}>
              <TouchableOpacity
                style={s.playBtn}
                onPress={() => {
                  if (activeStopperRef.current) activeStopperRef.current(); // 다른 항목의 녹음 재생 멈춤
                  shared.speak(speakId, (content || transcript).trim());
                }}
                activeOpacity={0.8}
                accessibilityLabel={t(shared.playingId === speakId ? '⏸ 멈춤' : '▶ 읽어 주기')}
              >
                <Text style={s.playBtnIcon}>{shared.playingId === speakId ? '⏸' : '▶'}</Text>
              </TouchableOpacity>
              <Text style={s.speakHint}>{t('폰 음성으로 읽어 줘요')}</Text>
            </View>
          ) : null}
          <Text style={s.unsupported}>{t('녹음 파일 없이 글만 저장된 항목이에요')}</Text>
        </>
      )}
    </View>
  );
}

type SheetKind = 'date' | 'alarm' | 'content' | 'export' | 'postpone' | 'outcome' | 'attach';

/** 열자마자 띄울 팝업 — 카드의 "정하기"는 날짜 팝업을 바로 연다. nonce가 바뀔 때마다 다시 연다 */
export type DetailOpenSheet = { kind: 'date' | 'content'; nonce: number };

/** 되돌리기 띠를 보여 주는 시간(ms) */
export const UNDO_MS = 4000;

export function ScheduleDetail({
  visible,
  record,
  onClose,
  onSave,
  onUndo,
  onDelete,
  onOutcome,
  origin,
  onOpenRecord,
  onAttachmentsChange,
  onMakeScheduleFromPhoto,
  markedDays,
  defaultRemind,
  openSheet,
}: {
  visible: boolean;
  record: ScheduleRecord | null;
  onClose: () => void;
  /** 팝업의 [완료] — 저장·알람 다시 걸기는 부모가(App.saveEditor). 저장했으면 true, 겹치는 일정 확인에서 취소하면 false */
  onSave?: SheetSave;
  /** 되돌리기 — 바꾸기 전 레코드로 저장하고 알람도 되돌린다(부모가) */
  onUndo?: (prev: ScheduleRecord) => void | Promise<void>;
  /** 휴지통 — 확인 창과 실제 삭제는 부모가 */
  onDelete?: (r: ScheduleRecord) => void;
  /** 지난 일정의 결과 버튼(못 했어요·덜 했어요·바뀌었어요)과 앞으로의 일정의 미루기 — 저장·다시 잡기는 부모가 */
  onOutcome?: (r: ScheduleRecord, kind: OutcomeKind) => void;
  /** 이 일정이 다시 잡은 일정이면 원래 일정 */
  origin?: ScheduleRecord | null;
  /** 연결된 일정(원래 일정·다시 잡은 일정)으로 넘어가기 */
  onOpenRecord?: (id: string) => void;
  /** 사진·파일 첨부를 붙이거나 뺄 때(저장·권한 반납은 부모가) */
  onAttachmentsChange?: (r: ScheduleRecord, next: Attachment[], removed: Attachment[]) => void;
  /** 붙은 사진으로 새 일정 만들기(글자 인식 → 미리보기) — 이 창을 닫고 새 일정 화면은 부모가 연다 */
  onMakeScheduleFromPhoto?: (photo: Attachment) => void;
  /** 날짜 팝업 달력에 일정이 있는 날 표시 */
  markedDays?: Set<string>;
  /** 날짜를 안 정한 녹음을 정할 때 붙일 기본 미리 알림(설정값) */
  defaultRemind?: number[];
  openSheet?: DetailOpenSheet | null;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const { scale } = useFontScale();
  const [route, setRoute] = useState<AudioRoute>('speaker');
  // 텍스트/PDF는 바로 공유하지 않고 미리보기 화면을 먼저 띄운다
  const [preview, setPreview] = useState<ExportKind | null>(null);
  // 메인/추가 엔트리 중 하나만 동시에 재생되도록 하는 공유 스토퍼
  const activeStopperRef = useRef<(() => void) | null>(null);
  // 지금 열린 팝업(하나만)
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  // 일정 보내기 시트(이 창 안에 띄운다 — iOS는 창을 두 개 나란히 못 띄우지만 창 안의 창은 된다)
  const [sendOpen, setSendOpen] = useState(false);
  // 되돌리기 띠: 바꾸기 전 레코드
  const [undoPrev, setUndoPrev] = useState<ScheduleRecord | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearUndo = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setUndoPrev(null);
  };
  const recordId = record?.id;
  // 창을 닫거나 다른 일정으로 넘어가면 팝업·띠를 치운다
  useEffect(() => {
    setSheet(null);
    clearUndo();
    if (!visible) setSendOpen(false);
  }, [visible, recordId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);
  // 카드 "정하기" 등으로 열리면 그 팝업을 바로 띄운다(같은 요청은 한 번만)
  const handledNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!visible || !openSheet || !record || !onSave || handledNonceRef.current === openSheet.nonce) return;
    handledNonceRef.current = openSheet.nonce;
    setSheet(openSheet.kind);
  }, [visible, openSheet?.nonce, recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sharedForClose = useSharedPlayer();
  // 창을 닫으면 읽어 주기(폰 음성)도 멈춘다
  useEffect(() => { if (!visible) sharedForClose.stop(); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  // 단어칩을 끌어 범위선택하는 동안 ScrollView가 터치를 취소하지 않게 한다.
  // (scrollEnabled를 끄면 iOS가 진행 중인 터치 자체를 취소해 release가 안 온다 — 2026-10-12 폰 확인)
  const [scrollLocked, setScrollLocked] = useState(false);

  const attachments = record?.attachments ?? [];
  const attach = useAttachActions(attachments, (next, removed) => { if (record) onAttachmentsChange?.(record, next, removed); });

  const content = record?.content || record?.transcript || t('(내용 없음)');
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

  const sheetCancelRef = useRef<(() => void) | null>(null); // 내용 고치기 팝업의 "버릴까요?" 확인
  if (!record) return null;

  // 팝업 [완료] → 저장되면 팝업을 닫고 되돌리기 띠를 띄운다
  const before = record;
  const saveFromSheet: SheetSave = async (res) => {
    if (!onSave) return false;
    const ok = (await onSave(res)) !== false;
    return ok;
  };
  const afterSaved = () => {
    setSheet(null);
    if (!onUndo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoPrev(before);
    undoTimerRef.current = setTimeout(() => { undoTimerRef.current = null; setUndoPrev(null); }, UNDO_MS);
  };
  const undo = () => {
    const prev = undoPrev;
    clearUndo();
    if (prev && onUndo) Promise.resolve(onUndo(prev)).catch(() => {});
  };
  const closeSheet = () => setSheet(null);
  // Android 뒤로가기: 팝업이 있으면 팝업부터 닫는다
  const onBack = () => { if (sheet) (sheetCancelRef.current ?? closeSheet)(); else onClose(); };

  const editable = !!onSave;
  const openContent = () => { if (editable) setSheet('content'); };
  const nowMs = Date.now();
  const past = isPastItem(record); // 지난 일정이면 결과 버튼, 아직이면 미루기
  const alarmPast = record.scheduleAt != null && record.scheduleAt <= nowMs; // 알람 시각이 지났다
  const movedAway = !alarmPast && isMovedAway(record); // 미룬 일정은 새 일정 쪽에서만 울린다
  const dayPart = record.scheduleAt != null ? formatDayHeader(new Date(record.scheduleAt)) : null;
  const endPart = record.endAt != null ? ` ~ ${formatDayHeader(new Date(record.endAt))}` : '';
  // 날짜 미정 임시 일정은 "(시간 미정)" 대신 "(임시)" 꼬리표를 단다
  const when =
    dayPart == null
      ? t('날짜 미정')
      : record.hasTime
        ? `${dayPart}  ${formatTime(new Date(record.scheduleAt!))}${record.needsDate ? '  ' + t('(녹음 시각)') : ''}${endPart}`
        : `${dayPart}  ${t(record.needsDate ? '(임시)' : '(시간 미정)')}${endPart}`;
  const mode = (record.alarmMode as AlarmMode | undefined) ?? 'both';
  const remind = normalizeRemind(record.remindBefore ?? []);
  const exact = record.exactAlarm !== false;
  const showAlarm = record.hasTime && !record.needsDate && !alarmPast && !movedAway;
  const remindChip = remind.length || exact
    ? [...remind.map((m) => t(remindLabel(m))), t('정각 {state}', { state: t(exact ? '켬' : '끔') })].join(' · ')
    : t('알림 없음');
  // 미루기는 아직 오지 않은 하루짜리 일정만(기간 일정은 날짜를 고쳐서 옮긴다). 결과는 지난 일정
  const canPostpone = !!onOutcome && !record.needsDate && record.scheduleAt != null && !past && record.endAt == null;
  const canResult = !!onOutcome && !record.needsDate && record.scheduleAt != null && past;
  const moved = record.outcome?.kind === 'moved';
  const outcomeOn = record.outcome?.kind;
  // 띠에 보여 줄 결과 꼬리표(지난 일정의 못 함·덜 함·바뀜). 다시 잡은 날짜가 있으면 그 줄로 대신한다
  const tag = record.outcome && record.outcome.nextAt == null && !movedAway ? outcomeTag(record) : '';
  const bigText = scale >= 1.3;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBack}>
      {/* Modal은 별도 창이라 바깥 SafeAreaProvider의 인셋이 전달되지 않는다 → 안쪽에 따로 둔다
          (없으면 iOS에서 닫기 네비가 상태바 위로 올라감 — 2026-10-12 폰 확인) */}
      <SafeAreaProvider>
      <SafeAreaView style={s.screen}>
        {/* 위 막대: [닫기] · 일정 · 🗑 */}
        {/* 팝업이 떠 있으면 뒤 화면은 TalkBack에서 숨긴다(iOS는 팝업의 accessibilityViewIsModal) */}
        <View style={s.navBar} importantForAccessibility={sheet ? 'no-hide-descendants' : 'auto'}>
          <TouchableOpacity style={s.navBtn} onPress={onClose} accessibilityRole="button">
            <Text style={s.navCloseText}>{t('닫기')}</Text>
          </TouchableOpacity>
          <Text style={s.navTitle} accessibilityRole="header">{t('일정')}</Text>
          {onDelete ? (
            <TouchableOpacity style={s.navBtn} onPress={() => onDelete(record)} accessibilityRole="button" accessibilityLabel={t('일정 삭제')}>
              <Text style={s.navDeleteIcon}>🗑</Text>
            </TouchableOpacity>
          ) : <View style={s.navBtn} />}
        </View>

        <ScrollView
          importantForAccessibility={sheet ? 'no-hide-descendants' : 'auto'}
          key={record.id} // 연결된 일정(→·←)으로 넘어가면 녹음 블록의 구간 선택·재생 상태를 새로 시작한다
          contentContainerStyle={s.body}
          showsVerticalScrollIndicator={false}
          // iOS: 터치 취소만 막는다(scrollEnabled를 끄면 진행 중 터치가 취소됨). Android: 그 속성이 없고 scrollEnabled 토글이 안전하다
          {...(Platform.OS === 'android' ? { scrollEnabled: !scrollLocked } : { canCancelContentTouches: !scrollLocked })}
          testID="detailScroll"
        >
          {/* 날짜·시간 — 누르면 날짜 팝업 */}
          <TouchableOpacity
            onPress={() => editable && setSheet('date')}
            disabled={!editable}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityHint={t('날짜·시간')}
            testID="when-open"
          >
            <Text style={s.when}>{when}{editable ? <Text style={s.whenChevron}>{'  ›'}</Text> : null}</Text>
          </TouchableOpacity>

          {/* 상태 띠 — 날짜 미정·미룸·결과·받은 일정·지난 일정 */}
          {record.needsDate ? (
            <TouchableOpacity style={s.needsDateBar} onPress={() => editable && setSheet('date')} activeOpacity={0.8} accessibilityLabel={t('날짜 정하기')} testID="band-needsDate">
              <Text style={s.needsDateText}>{t(record.hasTime ? '날짜·시간을 말하지 않아 녹음한 시각으로 저장했어요. 정하면 알람이 울려요' : '날짜·시간 없이 녹음돼 오늘에 임시로 두었어요')}</Text>
              <Text style={s.needsDateBtn}>{t('정하기')}</Text>
            </TouchableOpacity>
          ) : null}
          {(record.received || (record.hasTime && !record.needsDate && alarmPast) || movedAway || tag || record.outcome?.nextAt != null || (origin && origin.scheduleAt != null && onOpenRecord)) ? (
            <View style={s.band} testID="status-band">
              {record.received ? <Text style={[s.pill, s.pillAccent]} testID="detail-received">{receivedLabel(record, t)}</Text> : null}
              {record.hasTime && !record.needsDate && alarmPast ? <Text style={s.pill} testID="band-past">{t('지난 일정 (알림 없음)')}</Text> : null}
              {movedAway ? <Text style={[s.pill, s.pillWarn]} testID="band-moved">{t('미뤄서 이 일정은 알림이 울리지 않아요')}</Text> : null}
              {tag ? <Text style={[s.pill, s.pillWarn]} testID="band-outcome">{tag}</Text> : null}
              {record.outcome?.nextAt != null ? (
                <TouchableOpacity
                  disabled={!record.outcome.nextId || !onOpenRecord}
                  onPress={() => record.outcome?.nextId && onOpenRecord?.(record.outcome.nextId)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  testID="outcome-next"
                >
                  <Text style={[s.pill, s.pillLink]} numberOfLines={2}>{t('→ {date}에 다시 잡았어요', { date: nextWhen(record) })}</Text>
                </TouchableOpacity>
              ) : null}
              {/* 다시 잡은 일정이면 원래 일정으로 가는 줄 */}
              {origin && origin.scheduleAt != null && onOpenRecord ? (
                <TouchableOpacity onPress={() => onOpenRecord(origin.id)} activeOpacity={0.7} accessibilityRole="button" testID="outcome-origin">
                  <Text style={[s.pill, s.pillLink]} numberOfLines={2}>
                    {t('← {date} 일정에서 다시 잡았어요', { date: formatDayHeader(new Date(origin.scheduleAt)) })}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* 알림 — 작은 칩 두 개, 누르면 알림 팝업 */}
          {showAlarm ? (
            <View style={s.chipRow}>
              <TouchableOpacity style={s.chip} onPress={() => editable && setSheet('alarm')} disabled={!editable} accessibilityRole="button" testID="alarm-mode-chip">
                <Text style={s.chipText}>{`${voiceUriOf(record) ? '🎙' : MODE_EMOJI[mode]} ${t(MODE_LABEL[mode])}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.chip, s.chipAccent]} onPress={() => editable && setSheet('alarm')} disabled={!editable} accessibilityRole="button" testID="remind-open">
                <Text style={[s.chipText, s.chipTextAccent]}>{`⏰ ${remindChip}${editable ? ' ›' : ''}`}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* 내용 — 메인 + 추가 엔트리를 각각 독립적으로 재생/구간선택. 고치기는 [✏️ 고치기]로만(단어 탭은 재생) */}
          <View style={{ marginTop: 14 }}>
            <EntryBlock
              label={t('내용')}
              uri={record.uri}
              durationSec={record.durationSec}
              content={mainContent}
              transcript={record.transcript}
              segments={segments}
              route={route}
              onRouteChange={switchRoute}
              activeStopperRef={activeStopperRef}
              onSelectingChange={setScrollLocked}
              onPressText={!record.uri && editable ? openContent : undefined}
              headerRight={editable ? (
                <TouchableOpacity style={s.penBtn} onPress={openContent} accessibilityRole="button" testID="content-edit" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.penText}>{t('✏️ 고치기')}</Text>
                </TouchableOpacity>
              ) : undefined}
            />
          </View>
          {(record.appends ?? []).map((a, i) => (
            <EntryBlock
              key={a.id}
              label={t('추가 {n} · {time}', { n: i + 1, time: formatTime(new Date(a.createdAt)) })}
              uri={a.uri}
              durationSec={a.durationSec}
              content={a.content}
              transcript={a.transcript}
              activeStopperRef={activeStopperRef}
              segments={a.segments ?? []}
              route={route}
              onRouteChange={switchRoute}
              onSelectingChange={setScrollLocked}
            />
          ))}

          {/* 구버전 메모(문자열 이어붙임) 호환 표시 */}
          {legacyNotes.length > 0 && (
            <>
              <Text style={s.sectionLabel}>{t('메모')}</Text>
              {legacyNotes.map((n, i) => (
                <Text key={i} style={s.noteText}>• {n}</Text>
              ))}
            </>
          )}

          {/* 버튼 줄 — 미루기(?) 또는 결과 · 보내기 · 내보내기. 큰 글씨에서는 두 줄로 내려간다 */}
          <View style={s.actRow} testID="action-row">
            {canPostpone ? (
              <View style={[s.act, bigText && s.actBig, moved && s.actOn]}>
                <TouchableOpacity style={s.actMain} onPress={() => onOutcome!(record, 'moved')} accessibilityRole="button" accessibilityState={{ selected: moved }} testID="outcome-moved">
                  <Text style={[s.actText, moved && s.actTextOn]} numberOfLines={1}>{`↪ ${t('미루기')}`}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.qBtn} onPress={() => setSheet('postpone')} accessibilityRole="button" accessibilityLabel={t('미루기란?')} testID="postpone-help" hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}>
                  <Text style={s.qText}>?</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {canResult ? (
              <TouchableOpacity style={[s.act, bigText && s.actBig, !!outcomeOn && s.actOn]} onPress={() => setSheet('outcome')} accessibilityRole="button" testID="outcome-open">
                <Text style={[s.actText, !!outcomeOn && s.actTextOn]} numberOfLines={2}>
                  {outcomeOn ? `📝 ${t(OUTCOME_BUTTON[outcomeOn])}` : `📝 ${t('어떻게 됐나요?')}`}
                </Text>
              </TouchableOpacity>
            ) : null}
            {/* 일정 보내기 — 글만 보낸다(목소리·사진 없음). 날짜를 정한 일정만 */}
            {canSend(record) ? (
              <TouchableOpacity style={[s.act, bigText && s.actBig]} onPress={() => setSendOpen(true)} accessibilityRole="button" testID="detail-send">
                <Text style={s.actText} numberOfLines={1}>{t('📤 보내기')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[s.act, bigText && s.actBig]} onPress={() => setSheet('export')} accessibilityRole="button" testID="export-open">
              <Text style={s.actText} numberOfLines={1}>{t('⋯ 내보내기')}</Text>
            </TouchableOpacity>
          </View>

          {/* 사진·파일·메모 — 사진·파일 원본은 복사하지 않고 위치만 */}
          {onAttachmentsChange ? (
            <AttachmentSection
              key={record.id} // 연결된 일정으로 넘어가면 미리보기를 새로 만든다
              recordId={record.id}
              attachments={attachments}
              onChange={(next, removed) => onAttachmentsChange(record, next, removed)}
              onMakeSchedule={onMakeScheduleFromPhoto}
              onAddPress={() => setSheet('attach')}
            />
          ) : null}
        </ScrollView>

        {/* 되돌리기 띠 — 저장 직후 몇 초만 */}
        {undoPrev ? (
          <View style={s.undoBar} testID="undo-bar" accessibilityLiveRegion="polite">
            <Text style={s.undoText}>{t('바꿨어요')}</Text>
            <TouchableOpacity onPress={undo} accessibilityRole="button" testID="undo" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.undoBtn}>{t('되돌리기')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 팝업 — 창 안에 겹쳐 띄운다(열려 있을 때만 그린다) */}
        {sheet === 'date' && onSave ? (
          <DateSheet record={record} markedDays={markedDays ?? EMPTY_DAYS} defaultRemind={defaultRemind} onCancel={closeSheet} onSave={saveFromSheet} onSaved={afterSaved} />
        ) : null}
        {sheet === 'alarm' && onSave ? (
          <AlarmSheet record={record} onCancel={closeSheet} onSave={saveFromSheet} onSaved={afterSaved} />
        ) : null}
        {sheet === 'content' && onSave ? (
          <ContentSheet record={record} onCancel={closeSheet} onSave={saveFromSheet} onSaved={afterSaved} cancelRef={sheetCancelRef} />
        ) : null}
        {sheet === 'export' ? (
          <ExportSheet onClose={closeSheet} onCopy={() => copyRecords([record])} onPreview={(k) => setPreview(k)} />
        ) : null}
        {sheet === 'postpone' ? <PostponeHelp onClose={closeSheet} /> : null}
        {sheet === 'outcome' && onOutcome ? (
          <OutcomeSheet current={record.outcome?.kind} onPick={(k) => onOutcome(record, k)} onClose={closeSheet} />
        ) : null}
        {sheet === 'attach' ? (
          <AttachSheet
            busy={attach.busy}
            onClose={closeSheet}
            onPick={(what) => { closeSheet(); if (what === 'paste') attach.paste(); else attach.add(what); }}
          />
        ) : null}
      </SafeAreaView>
      </SafeAreaProvider>
      <ExportPreview visible={preview != null} kind={preview ?? 'txt'} records={[record]} onClose={() => setPreview(null)} />
      <SendSheet visible={sendOpen} record={record} onClose={() => setSendOpen(false)} />
    </Modal>
  );
}

const EMPTY_DAYS = new Set<string>();

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: 52,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 8, minWidth: 56 },
  navCloseText: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  navTitle: { flex: 1, textAlign: 'center', color: C.text, fontSize: 16, fontWeight: '700' },
  navDeleteIcon: { fontSize: 18 },

  body: { paddingHorizontal: 20, paddingBottom: 96 },
  when: { color: C.text, fontSize: 22, fontWeight: '800', lineHeight: 30, marginTop: 16 },
  whenChevron: { color: C.accent, fontSize: 22, fontWeight: '800' },
  needsDateBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10,
    backgroundColor: C.surfaceHigh,
  },
  needsDateText: { color: C.textSub, fontSize: 13, fontWeight: '600', flex: 1 },
  needsDateBtn: { color: '#fff', fontSize: 13, fontWeight: '700', backgroundColor: C.red, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  band: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 6 },
  pill: { color: C.textSub, fontSize: 13, fontWeight: '700', backgroundColor: C.surfaceHigh, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  pillAccent: { color: C.accent, fontWeight: '800' },
  pillWarn: { color: C.red },
  pillLink: { color: C.accent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, flexShrink: 1 },
  chipAccent: { borderColor: C.accent },
  chipText: { color: C.text, fontSize: 13, fontWeight: '700' },
  chipTextAccent: { color: C.accent },

  sectionLabel: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  contentText: { color: C.text, fontSize: 17, lineHeight: 26 },
  noteText: { color: C.textSub, fontSize: 15, lineHeight: 23, marginBottom: 4 },
  penBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: C.surfaceHigh },
  penText: { color: C.accent, fontSize: 13, fontWeight: '800' },

  actRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  act: {
    flexGrow: 1, flexBasis: 0, minWidth: 96, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 6,
  },
  // 큰 글씨: 한 줄에 둘씩 — 버튼 줄이 두 줄로 내려간다
  actBig: { flexBasis: '40%' },
  actOn: { borderColor: C.red, backgroundColor: C.red },
  actMain: { flexShrink: 1, paddingVertical: 4 },
  actText: { color: C.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  actTextOn: { color: '#fff' },
  qBtn: { marginLeft: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceHigh },
  qText: { color: C.textSub, fontSize: 12, fontWeight: '800' },

  undoBar: {
    position: 'absolute', left: 16, right: 16, bottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: '#1b2440',
  },
  undoText: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  undoBtn: { color: '#8fb3ff', fontSize: 15, fontWeight: '800' },

  entryBlock: {
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  entryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  entryLabel: { color: C.textSub, fontSize: 12, fontWeight: '700', flexShrink: 1 },

  // 전체 문장이 자연스럽게 읽히도록 단어를 텍스트처럼 배치 (터치는 단어 단위)
  wordFlow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  word: {
    borderRadius: 6,
    paddingHorizontal: 3, paddingVertical: 4,
    marginRight: 4, marginBottom: 4,
  },
  // 선택 범위: 가운데는 연한 파란 띠, 양 끝은 진한 파랑. 끌기 중엔 조금 더 선명하게
  wordInRange: { backgroundColor: 'rgba(61, 139, 255, 0.28)' },
  wordRangeEdge: { backgroundColor: C.accent },
  wordSelecting: { borderWidth: 1, borderColor: C.accent, paddingHorizontal: 2, paddingVertical: 3 },
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
  // 선택 범위 바: [▶ N단어 다시 듣기] "선택 문구…" [✕]
  rangeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10, paddingVertical: 6, paddingLeft: 6, paddingRight: 4,
    backgroundColor: C.surfaceHigh, borderRadius: 10,
  },
  rangeReplay: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  rangeReplayText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rangeWords: { flex: 1, color: C.textSub, fontSize: 12 },
  rangeClear: { paddingHorizontal: 8, paddingVertical: 6 },
  rangeClearText: { color: C.textSub, fontSize: 14, fontWeight: '700' },
  speakHint: { color: C.textSub, fontSize: 13, fontWeight: '600' },
  unsupported: { color: C.textDim, fontSize: 12, marginTop: 10, lineHeight: 17 },

});
