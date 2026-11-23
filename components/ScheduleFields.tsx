// ─── 날짜·시간 칸과 알림 칸 ─────────────────────────────────────────────────────
// 새 일정 화면(ScheduleEditor)과 일정 화면의 날짜·알림 팝업(DetailSheets)이 함께 쓴다.
// 상태는 부모가 갖고, 여기서는 달력 펼침 여부만 갖는다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { Calendar } from './Calendar';
import { ScrollPicker } from './ScrollPicker';
import { formatDayHeader } from '../lib/dateUtils';
import { useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { REMIND_OPTIONS, remindLabel } from '../lib/reminders';

export type AlarmMode = 'both' | 'sound' | 'vibe';

const HOURS24 = Array.from({ length: 24 }, (_, i) => i); // 0~23
export const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** 5분 단위 목록에 없는 분(말로 "3시 37분")이면 그 값을 끼워 넣는다 — 없으면 휠이 엉뚱한 칸에 멈춘다 */
export function minuteItemsWith(extra: number | null): number[] {
  return extra == null || MINUTES.includes(extra) ? MINUTES : [...MINUTES, extra].sort((a, b) => a - b);
}

/** 시작일과 같거나 앞인 끝나는 날은 기간이 아니다 */
export function validEnd(start: Date, end: Date | null): Date | null {
  if (!end) return null;
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return e > s ? end : null;
}

const pad2 = (v: number) => v.toString().padStart(2, '0');

export function DateTimeFields({
  date, onDate, hour, onHour, minute, onMinute, minuteItems, endDate, onEndDate, markedDays, onTouched, mode, resetKey,
}: {
  date: Date;
  onDate: (d: Date) => void;
  hour: number;
  onHour: (v: number) => void;
  minute: number;
  onMinute: (v: number) => void;
  minuteItems: number[];
  endDate: Date | null;
  onEndDate: (d: Date | null) => void;
  markedDays: Set<string>;
  /** 사용자가 날짜·시간을 직접 바꿀 때마다 */
  onTouched?: () => void;
  /** 새 일정 화면: 시간 칸 오른쪽의 소리·진동 아이콘 */
  mode?: { value: AlarmMode; onChange: (m: AlarmMode) => void };
  /** 바뀌면 펼친 달력을 접는다(화면을 다시 열 때) */
  resetKey?: unknown;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const [showCal, setShowCal] = useState(false);
  const [showEndCal, setShowEndCal] = useState(false);
  useEffect(() => { setShowCal(false); setShowEndCal(false); }, [resetKey]);
  const touch = () => onTouched?.();
  const label = useCallback(pad2, []);

  const meridiem = t(hour < 12 ? '오전' : '오후');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const timeStr = `${h12}:${pad2(minute)}`;

  return (
    <View>
      <Text style={s.label}>{t('날짜')}</Text>
      {/* 빠른 선택 — 날짜 없이 녹음한 일정을 고칠 때 한 번에 끝나도록 */}
      <View style={s.quickRow}>
        {[0, 1, 2].map((offset) => {
          const n = new Date();
          const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + offset);
          const on = d.toDateString() === date.toDateString();
          return (
            <TouchableOpacity
              key={offset}
              style={[s.quickChip, on && s.quickChipOn]}
              onPress={() => { touch(); onDate(d); setShowCal(false); }}
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.quickChipText, on && s.quickChipTextOn]}>{t(['오늘', '내일', '모레'][offset])}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={s.dateBtn} onPress={() => setShowCal((v) => !v)} testID="date-pick">
        <Text style={s.dateBtnText}>{formatDayHeader(date)}</Text>
        <Text style={s.dateBtnChevron}>{showCal ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showCal && (
        <View style={s.calBox}>
          <Calendar selectedDate={date} onSelectDate={(d) => { touch(); onDate(d); setShowCal(false); }} markedDays={markedDays} />
        </View>
      )}

      {/* 기간 일정(휴가·출장·여행): 끝나는 날. 알람은 시작하는 날에만 울린다 */}
      {endDate ? (
        <View style={s.endRow}>
          <TouchableOpacity style={[s.dateBtn, { flex: 1 }]} onPress={() => setShowEndCal((v) => !v)} accessibilityRole="button" accessibilityLabel={`${t('끝나는 날')}, ${formatDayHeader(endDate)}`}>
            <Text style={s.dateBtnText}>~ {formatDayHeader(endDate)}</Text>
            <Text style={s.dateBtnChevron}>{showEndCal ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.endClear} onPress={() => { touch(); onEndDate(null); setShowEndCal(false); }} accessibilityRole="button" accessibilityLabel={t('기간 지우기')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.endClearText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={s.endAdd}
          onPress={() => {
            touch();
            onEndDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
            setShowEndCal(true);
          }}
          accessibilityRole="button"
        >
          <Text style={s.endAddText}>{t('＋ 기간 (끝나는 날)')}</Text>
        </TouchableOpacity>
      )}
      {endDate && showEndCal && (
        <View style={s.calBox}>
          <Calendar
            selectedDate={endDate}
            onSelectDate={(d) => { touch(); onEndDate(validEnd(date, d)); setShowEndCal(false); }}
            markedDays={markedDays}
          />
        </View>
      )}

      <Text style={s.label}>{t('시간')}</Text>
      <View style={s.pickerRow}>
        <View style={s.timePickerGroup}>
          <ScrollPicker value={hour} items={HOURS24} onChange={(v) => { touch(); onHour(v); }} label={label} />
          <Text style={s.colon}>:</Text>
          <ScrollPicker value={minute} items={minuteItems} onChange={(v) => { touch(); onMinute(v); }} label={label} />
        </View>
        <View style={s.alarmSide}>
          <View style={s.alarmTextCol}>
            <Text style={s.meridiemText}>{meridiem}</Text>
            <Text style={s.timePreview}>{timeStr}</Text>
          </View>
          {mode ? (
            <View style={s.alarmIconCol}>
              <TouchableOpacity style={[s.modeIconBtn, mode.value === 'both' && s.modeIconBtnOn]} onPress={() => mode.onChange('both')}>
                <Text style={s.modeIconBell}>🔔</Text>
                <Image source={require('../assets/vibrate_icon.png')} style={s.modeIconVibe} />
              </TouchableOpacity>
              <View style={s.modeIconGroup}>
                <TouchableOpacity style={[s.modeIconBtn, mode.value === 'sound' && s.modeIconBtnOn]} onPress={() => mode.onChange('sound')}>
                  <Text style={s.modeIconBell}>🔔</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modeIconBtn, mode.value === 'vibe' && s.modeIconBtnOn]} onPress={() => mode.onChange('vibe')}>
                  <Image source={require('../assets/vibrate_icon.png')} style={s.modeIconVibe} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** 알림 요약 문구 — 칩 아래에 */
export function remindSummary(t: (k: string, p?: Record<string, string | number>) => string, remindBefore: number[], exact: boolean, noneText = '알림 없음'): string {
  return remindBefore.length
    ? t('{list}에 한 번씩 미리 알려요', { list: remindBefore.map((m) => t(remindLabel(m))).join(' · ') }) + (exact ? t(', 정각에도 울려요') : '')
    : exact ? t('정각에만 울려요 (못 들으면 1분·2분 뒤 다시)') : t(noneText);
}

export const MODE_EMOJI: Record<AlarmMode, string> = { both: '🔔📳', sound: '🔔', vibe: '📳' };
export const MODE_LABEL: Record<AlarmMode, string> = { both: '소리 + 진동', sound: '소리', vibe: '진동' };

export function AlarmFields({
  remindBefore, onToggleRemind, exactAlarm, onExact, voice, mode, noneText, sound,
}: {
  remindBefore: number[];
  onToggleRemind: (m: number) => void;
  exactAlarm: boolean;
  onExact: (v: boolean) => void;
  /** [VOICE_ALARM] 보류된 기능 — 상용에서는 넘기지 않는다 */
  voice?: { value: boolean; onChange: (v: boolean) => void } | null;
  /** 일정 화면의 알림 팝업: 소리·진동 칩 줄 */
  mode?: { value: AlarmMode; onChange: (m: AlarmMode) => void };
  noneText?: string;
  /** 일정 화면의 알림 팝업: "🎵 알람 소리 · 이름 ›" 줄(누르면 소리 고르기). 진동만이면 흐리게·못 누름 */
  sound?: { label: string; disabled: boolean; onPress: () => void } | null;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const none = remindBefore.length === 0 && !exactAlarm;
  return (
    <View>
      {mode ? (
        <View style={[s.remindRow, { marginBottom: 12 }]}>
          {(['both', 'sound', 'vibe'] as AlarmMode[]).map((m) => {
            const on = mode.value === m;
            return (
              <TouchableOpacity
                key={m}
                style={[s.quickChip, s.bigChip, on && s.quickChipOn]}
                onPress={() => mode.onChange(m)}
                accessibilityState={{ selected: on }}
                accessibilityRole="button"
                testID={`mode-${m}`}
              >
                <Text style={[s.quickChipText, s.bigChipText, on && s.quickChipTextOn]}>{`${MODE_EMOJI[m]} ${t(MODE_LABEL[m])}`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {sound ? (
        <TouchableOpacity
          style={[s.soundRow, sound.disabled && s.soundRowOff]}
          onPress={sound.onPress}
          disabled={sound.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: sound.disabled }}
          accessibilityLabel={`${t('알람 소리')} ${sound.label}`}
          testID="alarm-sound-row"
        >
          <Text style={s.soundTitle}>{t('🎵 알람 소리')}</Text>
          <Text style={s.soundValue} numberOfLines={1}>{`${sound.label} ›`}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={s.remindRow}>
        {REMIND_OPTIONS.map((m) => {
          const on = remindBefore.includes(m);
          return (
            <TouchableOpacity
              key={m}
              style={[s.quickChip, mode && s.bigChip, on && s.quickChipOn]}
              onPress={() => onToggleRemind(m)}
              accessibilityState={{ selected: on }}
              accessibilityLabel={t('미리 알림 {label}', { label: t(remindLabel(m)) })}
            >
              <Text style={[s.quickChipText, mode && s.bigChipText, on && s.quickChipTextOn]}>{t(remindLabel(m))}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[s.quickChip, mode && s.bigChip, exactAlarm && s.quickChipOn]}
          onPress={() => onExact(!exactAlarm)}
          accessibilityState={{ selected: exactAlarm }}
          accessibilityLabel={t('정각 알림')}
        >
          <Text style={[s.quickChipText, mode && s.bigChipText, exactAlarm && s.quickChipTextOn]}>{t('정각')}</Text>
        </TouchableOpacity>
        {/* [VOICE_ALARM] 보류된 기능 — 상용에서는 보이지 않는다 */}
        {voice ? (
          <TouchableOpacity
            style={[s.quickChip, mode && s.bigChip, voice.value && s.quickChipOn]}
            onPress={() => voice.onChange(!voice.value)}
            accessibilityState={{ selected: voice.value }}
            accessibilityLabel={t('알람 소리 내 목소리')}
          >
            <Text style={[s.quickChipText, mode && s.bigChipText, voice.value && s.quickChipTextOn]}>{t('🎙 내 목소리')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[s.remindHint, mode && none && s.remindWarn]} testID="remind-summary">
        {remindSummary(t, remindBefore, exactAlarm, noneText)}
      </Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  label: { color: C.accent, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  quickChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  quickChipText: { color: C.textSub, fontSize: 13, fontWeight: '700' },
  quickChipTextOn: { color: C.onAccent },
  bigChip: { paddingVertical: 9 },
  bigChipText: { fontSize: 15 },
  remindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  soundRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface,
  },
  soundRowOff: { opacity: 0.4 },
  soundTitle: { flexShrink: 1, color: C.text, fontSize: 15, fontWeight: '700' },
  soundValue: { flexShrink: 1, maxWidth: '60%', textAlign: 'right', color: C.accent, fontSize: 15, fontWeight: '600' },
  remindHint: { color: C.textSub, fontSize: 12, marginTop: 8 },
  remindWarn: { color: C.red, fontWeight: '700' },
  dateBtn: {
    backgroundColor: C.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: C.border,
  },
  dateBtnText: { color: C.text, fontSize: 16, fontWeight: '500' },
  dateBtnChevron: { color: C.accent, fontSize: 12 },
  calBox: { borderRadius: 12, marginTop: 8 },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  endClear: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  endClearText: { color: C.textSub, fontSize: 14, fontWeight: '700' },
  endAdd: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  endAddText: { color: C.accent, fontSize: 13, fontWeight: '700' },
  // 왼쪽 휠(시:분)은 flex로 줄어들고, 오른쪽 알람 영역은 내용 크기만큼만 차지해 박스 밖으로 나가지 않게 한다
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: C.surface, borderRadius: 16, paddingLeft: 8, paddingRight: 10,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  timePickerGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  colon: { color: C.text, fontSize: 20, fontWeight: '700', paddingHorizontal: 2 },
  alarmSide: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingVertical: 10 },
  alarmTextCol: { alignItems: 'center', gap: 2, minWidth: 44 },
  alarmIconCol: { alignItems: 'center', gap: 6 },
  meridiemText: { color: C.textSub, fontSize: 15, fontWeight: '700' },
  timePreview: { color: C.text, fontSize: 17, fontWeight: '700' },
  modeIconGroup: { flexDirection: 'row', gap: 6 },
  modeIconBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 9, backgroundColor: C.surfaceHigh },
  modeIconBtnOn: { backgroundColor: C.red },
  modeIconBell: { fontSize: 14 },
  modeIconVibe: { width: 16, height: 16, resizeMode: 'contain' },
});
