// ─── 일정 카드 (달력 탭 / 전체 일정 탭 공용) ──────────────────────────────────────
import { useEffect, useRef, useState, useMemo } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useFontScale, useTheme, type Palette } from '../lib/theme';
import { normalizeRemind, remindLabel } from '../lib/reminders';
import { formatTime } from '../lib/dateUtils';
import type { ScheduleRecord } from '../lib/storage';
import { MicIcon } from './MicIcon';

// 동시 재생 방지: 새 카드가 재생을 시작하면 이전 카드를 멈춤
let activeCardStopper: (() => void) | null = null;

export function ScheduleCard({
  item,
  onPress,
  onAppend,
  onFixDate,
  showDate = false,
}: {
  item: ScheduleRecord;
  onPress: (r: ScheduleRecord) => void;
  onAppend: (r: ScheduleRecord) => void;
  /** 날짜·시간 없이 녹음돼 임시로 오늘에 둔 일정의 "정하기" — 편집기를 연다 */
  onFixDate?: (r: ScheduleRecord) => void;
  showDate?: boolean;
}) {
  const C = useTheme();
  const { scale } = useFontScale();
  const styles = useMemo(() => makeStyles(C, scale), [C, scale]);
  const player = useAudioPlayer(item.uri || undefined, { updateInterval: 100 });
  // useAudioPlayer()가 돌려주는 player 객체의 currentTime/playing은 리렌더를 일으키지 않는
  // 네이티브 getter라 useEffect 의존성으로 쓸 수 없다 → 상태 구독 훅으로 반응형 값 사용
  const status = useAudioPlayerStatus(player);
  const [playing, setPlaying] = useState(false);
  // 재생 시작 직후엔 status가 아직 이전 재생(끝 지점)의 값이라 "끝남"으로 오판할 수 있음 → 잠깐 무시
  const playStartedAtRef = useRef(0);

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
      const atEnd = status.duration > 0 && status.currentTime >= status.duration - 0.1;
      if (status.currentTime <= 0 || atEnd || !(status.duration > 0)) {
        player.seekTo(0);
      }
      playStartedAtRef.current = Date.now();
      player.play();
      setPlaying(true);
    }
  };

  // 재생이 끝나면 ▶ 아이콘으로 복귀 (이전엔 리렌더가 없어 ⏸ 상태로 남아 있었음)
  useEffect(() => {
    if (!playing) return;
    if (Date.now() - playStartedAtRef.current < 300) return;
    const atEnd = status.duration > 0 && status.currentTime >= status.duration - 0.1;
    if (status.didJustFinish || atEnd) setPlaying(false);
  }, [status.didJustFinish, status.currentTime, status.duration, playing]);

  const timeLabel = item.needsDate
    ? '날짜 미정'
    : item.hasTime && item.scheduleAt ? formatTime(new Date(item.scheduleAt)) : '시간 미정';
  const title = item.content || item.transcript || '(내용 없음)';
  // 메모는 아래 별도 줄로 표시하므로 제목에서는 본문만 (중복 표시 방지)
  const mainTitle = title.split('\n• ')[0];
  const mode = (item as any).alarmMode as 'sound' | 'vibe' | 'both' | undefined;
  const isPast = item.scheduleAt != null && item.scheduleAt < Date.now();
  // 구버전 데이터 호환용 — 새 데이터는 appends[]를 사용
  const appendedNotes = (item.content || '').includes('\n• ')
    ? (item.content || '').split('\n• ').slice(1)
    : [];

  const accentColor = mode === 'vibe' ? C.textSub : mode === 'both' ? C.accent : C.red;
  // 글자를 크게(1.3배↑) 쓰면 가로 3열(시간|내용|▶)이 너무 좁아져 내용이 두세 글자마다 꺾인다.
  // 그때는 세로 배치: 1줄 시간·알람, 2줄 내용(전체 폭), 3줄 듣기·추가 버튼.
  const stacked = scale >= 1.3;

  const dateSub = showDate && item.scheduleAt ? (
    <Text style={styles.cardDateSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      {new Date(item.scheduleAt).getMonth() + 1}월 {new Date(item.scheduleAt).getDate()}일
    </Text>
  ) : null;
  const remind = normalizeRemind(item.remindBefore ?? []);
  const badges = mode ? (
    <View style={styles.cardBadgeRow}>
      {mode !== 'vibe' && <Text style={styles.cardBadgeIcon}>🔔</Text>}
      {mode !== 'sound' && (
        <Image source={require('../assets/vibrate_icon.png')} style={styles.cardBadgeVibe} />
      )}
      {remind.length > 0 && (
        <Text style={styles.cardRemindText} numberOfLines={1}>⏰ {remind.map(remindLabel).join('·')}</Text>
      )}
      {item.exactAlarm === false && <Text style={styles.cardRemindText}>정각 없음</Text>}
    </View>
  ) : <View />;
  const extras = (
    <>
      {appendedNotes.map((note, i) => (
        <Text key={i} style={styles.cardAppendedNote}>+ {note}</Text>
      ))}
      {item.needsDate && (
        // 사라지지 않는 꼬리표 — 사용자가 날짜·시간을 정할 때까지 남는다 (재촉 없음)
        <TouchableOpacity
          style={styles.needsDateRow}
          onPress={() => onFixDate?.(item)}
          activeOpacity={0.7}
          accessibilityLabel="날짜 정하기"
        >
          <Text style={styles.needsDateText}>언제인지 아직 안 정했어요</Text>
          <Text style={styles.needsDateBtn}>정하기</Text>
        </TouchableOpacity>
      )}
      {item.appends && item.appends.length > 0 && (
        <View style={styles.cardAppendRow}>
          <MicIcon size={12} color={C.textSub} />
          <Text style={styles.cardAppendedNote}>추가 {item.appends.length}건</Text>
        </View>
      )}
    </>
  );

  if (stacked) {
    return (
      <TouchableOpacity
        style={[styles.card, styles.cardStacked, isPast && styles.cardPast]}
        onPress={() => onPress(item)}
        activeOpacity={0.72}
        testID="card-stacked"
      >
        <View style={styles.stackTop}>
          <View style={[styles.stackBar, { backgroundColor: accentColor }]} />
          <Text style={[styles.stackTime, isPast ? styles.cardTimePast : { color: accentColor }]} numberOfLines={1}>
            {timeLabel}
          </Text>
          {dateSub}
          <View style={{ flex: 1 }} />
          {badges}
        </View>
        <Text style={[styles.cardTitle, isPast && styles.cardTitlePast]} numberOfLines={2} ellipsizeMode="tail">
          {mainTitle}
        </Text>
        {extras}
        <View style={styles.stackActions}>
          {item.uri ? (
            <TouchableOpacity style={styles.stackBtn} onPress={toggle} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={styles.stackBtnText}>{playing ? '⏸ 멈춤' : '▶ 듣기'}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.stackBtn} onPress={() => onAppend(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={styles.stackBtnTextAccent}>＋ 추가</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, isPast && styles.cardPast]}
      onPress={() => onPress(item)}
      activeOpacity={0.72}
    >
      <View style={styles.cardTimeCol}>
        <Text style={[styles.cardTime, isPast ? styles.cardTimePast : { color: accentColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {timeLabel}
        </Text>
        {dateSub}
      </View>

      <View style={[styles.cardDivider, { backgroundColor: accentColor }]} />

      <View style={styles.cardBody}>
        {/* 내용은 2줄로 요약해 보여준다 — 긴 녹음도 카드 높이가 일정하고, 전문은 상세에서 */}
        <Text style={[styles.cardTitle, isPast && styles.cardTitlePast]} numberOfLines={2} ellipsizeMode="tail">
          {mainTitle}
        </Text>
        {extras}

        <View style={styles.cardBottomRow}>
          {badges}
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


const makeStyles = (C: Palette, scale: number) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  cardPast: { opacity: 0.5 },
  cardTimeCol: { width: Math.round(68 * scale), justifyContent: 'center' },
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
  cardRemindText: { color: C.textSub, fontSize: 11, fontWeight: '600', marginLeft: 4 },
  cardBadgeVibe: { width: 14, height: 14, resizeMode: 'contain', opacity: 0.75 },
  cardAppendBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, backgroundColor: C.surfaceHigh,
  },
  cardAppendBtnText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  cardAppendedNote: { color: C.textSub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardAppendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  needsDateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    marginTop: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(240, 106, 106, 0.14)',
  },
  needsDateText: { color: C.red, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  needsDateBtn: { color: '#fff', fontSize: 12, fontWeight: '700', backgroundColor: C.red, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  cardPlayBtn: {
    width: 36, height: 36, marginLeft: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surfaceHigh, borderRadius: 18,
  },
  cardPlayIcon: { fontSize: 14, color: C.textSub },
  // 큰 글자용 세로 배치
  cardStacked: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 14 },
  stackTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  stackBar: { width: 4, height: 20, borderRadius: 2 },
  stackTime: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  stackActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  stackBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surfaceHigh },
  stackBtnText: { color: C.text, fontSize: 13, fontWeight: '700' },
  stackBtnTextAccent: { color: C.accent, fontSize: 13, fontWeight: '700' },

});
