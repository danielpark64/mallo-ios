// ─── 일정 카드 (달력 탭 / 전체 일정 탭 공용) ──────────────────────────────────────
import { voiceUriOf } from '../lib/voiceAlarm';
import { useMemo } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { useFontScale, useTheme, type Palette } from '../lib/theme';
import { useSharedPlayer } from '../lib/sharedPlayer';
import { recordSpeechText } from '../lib/speech';
import { normalizeRemind, remindLabel } from '../lib/reminders';
import { formatTime, isPastItem } from '../lib/dateUtils';
import type { ScheduleRecord } from '../lib/storage';
import { MicIcon } from './MicIcon';
import { useT } from '../lib/i18n';

export function ScheduleCard({
  item,
  onPress,
  onAppend,
  onFixDate,
  onLongPress,
  showDate = false,
  compact = false,
  highlight = false,
}: {
  item: ScheduleRecord;
  onPress: (r: ScheduleRecord) => void;
  onAppend: (r: ScheduleRecord) => void;
  /** 날짜·시간 없이 녹음돼 임시로 오늘에 둔 일정의 "정하기" — 편집기를 연다 */
  onFixDate?: (r: ScheduleRecord) => void;
  /** 길게 누르기 — 수정·삭제 메뉴를 바로 띄운다 */
  onLongPress?: (r: ScheduleRecord) => void;
  showDate?: boolean;
  /** 한 줄 보기 — 시간·내용 한 줄·▶만. 일정이 많을 때 한 화면에 많이 보이게 (설정 prefs.listCompact) */
  compact?: boolean;
  /** 위쪽 "다음 · …"을 눌러 바로 온 카드 — 잠깐 테두리로 강조 */
  highlight?: boolean;
}) {
  const C = useTheme();
  const { t } = useT();
  const { scale } = useFontScale();
  const styles = useMemo(() => makeStyles(C, scale), [C, scale]);
  const shared = useSharedPlayer();
  const playing = shared.playingId === item.id;
  // 녹음이 있으면 내 목소리, 없으면 폰 음성으로 "언제 · 무엇"을 읽어 준다
  const speechText = item.uri ? '' : recordSpeechText(item);
  const canPlay = !!item.uri || !!speechText;
  const toggle = () => {
    if (item.uri) shared.toggle(item.id, item.uri);
    else if (speechText) shared.speak(item.id, speechText);
  };

  // 녹음 시각으로 저장된 일정은 그 시각을, 예전 방식(시간 없음)으로 저장된 것은 '날짜 미정'을 보여 준다
  const timeLabel = item.needsDate && !(item.hasTime && item.scheduleAt)
    ? t('날짜 미정')
    : item.hasTime && item.scheduleAt ? formatTime(new Date(item.scheduleAt)) : t('시간 미정');
  const title = item.content || item.transcript || t('(내용 없음)');
  // 메모는 아래 별도 줄로 표시하므로 제목에서는 본문만 (중복 표시 방지)
  const mainTitle = title.split('\n• ')[0];
  const mode = (item as any).alarmMode as 'sound' | 'vibe' | 'both' | undefined;
  // 시간 미정(그날 0시 저장)은 그 날이 끝나야 지난 것, 날짜 미정은 지난 것으로 보지 않는다
  const isPast = isPastItem(item); // 날짜를 안 정한 녹음은 그날이 지나야 지난 것(dateUtils)
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
      {t('{m}월 {d}일', { m: new Date(item.scheduleAt).getMonth() + 1, d: new Date(item.scheduleAt).getDate() })}
    </Text>
  ) : null;
  const remind = normalizeRemind(item.remindBefore ?? []);
  // 알람이 걸리는 일정(시간 있음)에만 소리·진동·미리 알림 표시
  const badges = mode && item.hasTime && !item.needsDate ? (
    <View style={styles.cardBadgeRow}>
      {/* [VOICE_ALARM] 보류된 기능 — 상용에서는 보이지 않는다 */}
      {/* 소리: 기본 알람음이면 종, 내 목소리 알람이면 마이크 */}
      {mode !== 'vibe' && <Text style={styles.cardBadgeIcon}>{voiceUriOf(item) ? '🎙' : '🔔'}</Text>}
      {mode !== 'sound' && (
        <Image source={require('../assets/vibrate_icon.png')} style={styles.cardBadgeVibe} />
      )}
      {remind.length > 0 && (
        <Text style={styles.cardRemindText} numberOfLines={2}>⏰ {remind.map(remindLabel).join('·')}</Text>
      )}
      {item.exactAlarm === false && <Text style={styles.cardRemindText}>{t('정각 알림 꺼짐')}</Text>}
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
          accessibilityLabel={t('날짜 정하기')}
        >
          <Text style={styles.needsDateText} numberOfLines={2}>
            {t(item.hasTime ? '녹음한 시각으로 저장했어요' : '언제인지 아직 안 정했어요')}
          </Text>
          <Text style={styles.needsDateBtn}>{t('정하기')}</Text>
        </TouchableOpacity>
      )}
      {item.appends && item.appends.length > 0 && (
        <View style={styles.cardAppendRow}>
          <MicIcon size={12} color={C.textSub} />
          <Text style={styles.cardAppendedNote}>{t('추가 {n}건', { n: item.appends.length })}</Text>
        </View>
      )}
    </>
  );

  if (compact) {
    const appendCount = item.appends?.length ?? 0;
    return (
      <TouchableOpacity
        style={[styles.compactRow, isPast && styles.cardPast, highlight && styles.cardHighlight]}
        onPress={() => onPress(item)}
        onLongPress={onLongPress ? () => onLongPress(item) : undefined}
        delayLongPress={400}
        activeOpacity={0.72}
        testID={highlight ? 'card-highlight' : 'card-compact'}
      >
        <View style={[styles.compactBar, { backgroundColor: isPast ? C.textSub : accentColor }]} />
        <Text style={[styles.compactTime, isPast ? styles.cardTimePast : { color: accentColor }]} numberOfLines={1}>
          {timeLabel}
        </Text>
        <Text style={[styles.compactTitle, isPast && styles.cardTitlePast]} numberOfLines={1} ellipsizeMode="tail">
          {mainTitle}
        </Text>
        {item.needsDate && <Text style={styles.compactNeeds}>{t('정하기')}</Text>}
        {appendCount > 0 && <Text style={styles.compactAppend}>+{appendCount}</Text>}
        {canPlay ? (
          <TouchableOpacity
            style={styles.compactPlay}
            onPress={toggle}
            accessibilityLabel={t(playing ? '⏸ 멈춤' : item.uri ? '▶ 듣기' : '▶ 읽어 주기')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cardPlayIcon}>{playing ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  }

  if (stacked) {
    return (
      <TouchableOpacity
        style={[styles.card, styles.cardStacked, isPast && styles.cardPast, highlight && styles.cardHighlight]}
        onPress={() => onPress(item)}
        onLongPress={onLongPress ? () => onLongPress(item) : undefined}
        delayLongPress={400}
        activeOpacity={0.72}
        testID={highlight ? 'card-highlight' : 'card-stacked'}
      >
        <View style={styles.stackTop}>
          <View style={[styles.stackBar, { backgroundColor: accentColor }]} />
          <Text style={[styles.stackTime, isPast ? styles.cardTimePast : { color: accentColor }]} numberOfLines={1}>
            {timeLabel}
          </Text>
          {dateSub}
          {badges}
        </View>
        <Text style={[styles.cardTitle, isPast && styles.cardTitlePast]} numberOfLines={2} ellipsizeMode="tail">
          {mainTitle}
        </Text>
        {extras}
        <View style={styles.stackActions}>
          {canPlay ? (
            <TouchableOpacity style={styles.stackBtn} onPress={toggle} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityLabel={t(playing ? '⏸ 멈춤' : item.uri ? '▶ 듣기' : '▶ 읽어 주기')}>
              <Text style={styles.stackBtnText}>{playing ? t('⏸ 멈춤') : t('▶ 듣기')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.stackBtn} onPress={() => onAppend(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={styles.stackBtnTextAccent}>{t('＋ 추가')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, isPast && styles.cardPast, highlight && styles.cardHighlight]}
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      delayLongPress={400}
      activeOpacity={0.72}
      testID={highlight ? 'card-highlight' : undefined}
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
            <Text style={styles.cardAppendBtnText}>{t('＋ 추가')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {canPlay ? (
        <TouchableOpacity
          style={styles.cardPlayBtn}
          onPress={toggle}
          accessibilityLabel={t(playing ? '⏸ 멈춤' : item.uri ? '▶ 듣기' : '▶ 읽어 주기')}
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
  // 미리 알림을 여러 개 켜면 글이 길어진다 → 줄어들거나 다음 줄로 내려가되 시간은 절대 밀어내지 않는다
  cardBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, flexWrap: 'wrap', rowGap: 2, maxWidth: '100%' },
  cardBadgeIcon: { fontSize: 15 },
  cardRemindText: { color: C.textSub, fontSize: 11, fontWeight: '600', marginLeft: 4, flexShrink: 1 },
  // 종 옆에서 점처럼 보이지 않게 종보다 크게 (2026-10-13 사용자 피드백)
  cardBadgeVibe: { width: 22, height: 22, resizeMode: 'contain' },
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
    backgroundColor: C.surfaceHigh,
  },
  needsDateText: { color: C.textSub, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  needsDateBtn: { color: '#fff', fontSize: 12, fontWeight: '700', backgroundColor: C.red, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  cardPlayBtn: {
    width: 36, height: 36, marginLeft: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surfaceHigh, borderRadius: 18,
  },
  cardPlayIcon: { fontSize: 14, color: C.textSub },
  // 큰 글자용 세로 배치
  cardStacked: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 14 },
  stackTop: { flexDirection: 'row', alignItems: 'center', gap: 8, rowGap: 4, marginBottom: 8, flexWrap: 'wrap' },
  stackBar: { width: 4, height: 20, borderRadius: 2 },
  // 시간은 줄이지 않는다(예전엔 미리 알림 4개를 켜면 '…'로 사라졌다 — 2026-10-13 32 피드백)
  stackTime: { fontSize: 15, fontWeight: '800', flexShrink: 0 },
  stackActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  stackBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surfaceHigh },
  stackBtnText: { color: C.text, fontSize: 13, fontWeight: '700' },
  stackBtnTextAccent: { color: C.accent, fontSize: 13, fontWeight: '700' },
  // "다음"에서 바로 온 카드 강조
  // 테두리 두께는 그대로(줄이 흔들리지 않게) 색과 배경만 바꾼다
  cardHighlight: { borderColor: C.accent, backgroundColor: C.surfaceHigh },
  // 한 줄 보기
  compactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderRadius: 12,
    paddingVertical: 8, paddingLeft: 10, paddingRight: 8, marginBottom: 6,
    borderWidth: 1, borderColor: C.border,
  },
  compactBar: { width: 3, height: 20, borderRadius: 2 },
  compactTime: { fontSize: 13, fontWeight: '700', minWidth: Math.round(62 * scale) },
  compactTitle: { flex: 1, color: C.text, fontSize: 15, fontWeight: '500' },
  compactNeeds: { color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: C.red, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
  compactAppend: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  compactPlay: {
    width: 30, height: 30,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surfaceHigh, borderRadius: 15,
  },

});
