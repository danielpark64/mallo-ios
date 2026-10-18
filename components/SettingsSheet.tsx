// ─── 설정 화면 ─────────────────────────────────────────────────────────────────
// 화면(테마·글자 크기·언어), 알람, 달력 기본 보기, 백업 · 폰 옮기기, 사용설명서, 앱 정보를 한곳에 모은다.
// 문구는 모두 t()로 감싸 설정 언어(시스템/한국어/English)를 따른다.
import { useState, useMemo, useEffect } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, TouchableOpacity, View, AppState, Platform } from 'react-native';
import { Text } from './AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { FONT_SCALE_LABEL, THEME_LABEL, useTheme, useThemeSetting, type Palette } from '../lib/theme';
import type { FontScaleName, LanguageSetting, ThemeSetting } from '../lib/prefs';
import { LANGS, LANGUAGE_LABEL, useT } from '../lib/i18n';
import { REMIND_OPTIONS, normalizeRemind, remindLabel } from '../lib/reminders';
import { canDrawOverlays, requestOverlayPermission } from '../lib/nativeAlarm';
import type { CalendarMode } from '../lib/prefs';
import type { ScheduleRecord } from '../lib/storage';
import { voiceAlarmSupported } from '../lib/voiceAlarm';
import { BackupSheet } from './BackupSheet';
import { HelpSheet } from './HelpSheet';

export function SettingsSheet({
  visible,
  records,
  calendarMode,
  onCalendarMode,
  shiftsInfo = null,
  shareOn = false,
  onShareOn,
  onImportShifts,
  onClearShifts,
  defaultRemind,
  onDefaultRemind,
  defaultVoice = false,
  onDefaultVoice,
  onRestored,
  onClose,
}: {
  visible: boolean;
  records: ScheduleRecord[];
  calendarMode: CalendarMode;
  onCalendarMode: (m: CalendarMode) => void;
  /** 교대알람에서 가져온 근무표 안내("10월 18일 ~ 4월 16일") — 없으면 null */
  shiftsInfo?: string | null;
  /** 교대알람 자동 공유 스위치(Android). 없으면 iOS처럼 링크로 가져오기 버튼만 */
  shareOn?: boolean;
  onShareOn?: (on: boolean) => void;
  onImportShifts?: () => void;
  onClearShifts?: () => void;
  defaultRemind: number[];
  onDefaultRemind: (list: number[]) => void;
  /** 새 일정의 알람 소리: false = 기본 알람음, true = 내 목소리 */
  defaultVoice?: boolean;
  onDefaultVoice?: (on: boolean) => void;
  onRestored: (records: ScheduleRecord[]) => void;
  onClose: () => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { themeSetting, setThemeSetting, fontScale, setFontScale } = useThemeSetting();
  const { t, setting: langSetting, setSetting: setLangSetting } = useT();
  const [backupOpen, setBackupOpen] = useState(false);
  // "다른 앱 위에 표시" 허용 여부 — 설정 앱에서 돌아오면 다시 확인한다
  const [overlayOk, setOverlayOk] = useState(() => canDrawOverlays());
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (visible) setOverlayOk(canDrawOverlays());
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setOverlayOk(canDrawOverlays()); });
    return () => sub.remove();
  }, [visible]);
  const [helpOpen, setHelpOpen] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const withAudio = records.filter((r) => r.uri).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          <View style={s.navBar}>
            <TouchableOpacity style={s.navBtn} onPress={onClose}>
              <Text style={s.navCloseText}>{t('닫기')}</Text>
            </TouchableOpacity>
            <Text style={s.navTitle}>{t('설정')}</Text>
            <View style={s.navBtn} />
          </View>

          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            <Text style={s.sectionLabel}>{t('화면')}</Text>
            <View style={s.card}>
              <Text style={s.rowTitle}>{t('테마')}</Text>
              <View style={[s.segment, s.segmentWide]}>
                {(['system', 'light', 'dark'] as ThemeSetting[]).map((th) => (
                  <TouchableOpacity
                    key={th}
                    style={[s.segBtn, s.segBtnGrow, themeSetting === th && s.segBtnOn]}
                    onPress={() => themeSetting !== th && setThemeSetting(th)}
                    accessibilityState={{ selected: themeSetting === th }}
                    accessibilityLabel={`${t('테마')} ${t(THEME_LABEL[th])}`}
                  >
                    <Text style={[s.segText, themeSetting === th && s.segTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t(THEME_LABEL[th])}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.rowSub}>{t('시스템은 폰 설정(다크/라이트)을 따라요')}</Text>
              <View style={s.divider} />
              <Text style={s.rowTitle}>{t('글자 크기')}</Text>
              <View style={[s.segment, s.segmentWide]}>
                {(['small', 'medium', 'large', 'xlarge'] as FontScaleName[]).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[s.segBtn, s.segBtnGrow, fontScale === f && s.segBtnOn]}
                    onPress={() => fontScale !== f && setFontScale(f)}
                    accessibilityState={{ selected: fontScale === f }}
                    accessibilityLabel={`${t('글자 크기')} ${t(FONT_SCALE_LABEL[f])}`}
                  >
                    <Text style={[s.segText, fontScale === f && s.segTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t(FONT_SCALE_LABEL[f])}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.rowSub}>{t('일정 내용, 달력, 설명서 등 앱의 모든 글자에 적용돼요')}</Text>
              <View style={s.divider} />
              <Text style={s.rowTitle}>{t('언어')}</Text>
              <View style={[s.segment, s.segmentWide, s.chipWrap]}>
                {(['system', ...LANGS] as LanguageSetting[]).map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[s.segBtn, s.langChip, langSetting === l && s.segBtnOn]}
                    onPress={() => langSetting !== l && setLangSetting(l)}
                    accessibilityState={{ selected: langSetting === l }}
                    accessibilityLabel={`${t('언어')} ${l === 'system' ? t(LANGUAGE_LABEL[l]) : LANGUAGE_LABEL[l]}`}
                  >
                    <Text style={[s.segText, langSetting === l && s.segTextOn]} numberOfLines={1}>{t(LANGUAGE_LABEL[l])}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.rowSub}>{t('시스템은 폰의 언어를 따라요')}</Text>
            </View>

            <Text style={s.sectionLabel}>{t('알람')}</Text>
            <View style={s.card}>
              <Text style={s.rowTitle}>{t('기본 미리 알림')}</Text>
              <Text style={s.rowSub}>{t('새 일정에 자동으로 붙어요. 일정마다 편집기에서 바꿀 수 있어요')}</Text>
              <View style={[s.segment, s.segmentWide, s.chipWrap]}>
                {REMIND_OPTIONS.map((m) => {
                  const on = defaultRemind.includes(m);
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[s.segBtn, s.segBtnGrow, on && s.segBtnOn]}
                      onPress={() => onDefaultRemind(normalizeRemind(on ? defaultRemind.filter((x) => x !== m) : [...defaultRemind, m]))}
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${t('기본 미리 알림')} ${remindLabel(m)}`}
                    >
                      <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{remindLabel(m)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={s.rowSub}>{t('하루 전은 전날 저녁 8시에 울려요')}</Text>
              {/* [VOICE_ALARM] 보류된 기능 — 상용에서는 보이지 않는다 */}
              {onDefaultVoice && voiceAlarmSupported() && (
                <>
                  <View style={s.divider} />
                  <Text style={s.rowTitle}>{t('알람 소리')}</Text>
                  <Text style={s.rowSub}>{t('내 목소리를 고르면 알람이 울릴 때 그 일정을 말한 녹음 앞부분을 들려줘요. 일정마다 바꿀 수 있어요')}</Text>
                  <View style={[s.segment, s.segmentWide]}>
                    {([false, true] as const).map((v) => (
                      <TouchableOpacity
                        key={String(v)}
                        style={[s.segBtn, s.segBtnGrow, defaultVoice === v && s.segBtnOn]}
                        onPress={() => defaultVoice !== v && onDefaultVoice(v)}
                        accessibilityState={{ selected: defaultVoice === v }}
                        accessibilityLabel={`${t('알람 소리')} ${t(v ? '내 목소리' : '기본 알람음')}`}
                      >
                        <Text style={[s.segText, defaultVoice === v && s.segTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {t(v ? '🎙 내 목소리' : '🔔 기본 알람음')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {Platform.OS === 'android' && (
                <>
                  <View style={s.divider} />
                  <TouchableOpacity
                    style={s.rowBetween}
                    onPress={() => { if (!overlayOk) requestOverlayPermission(); }}
                    activeOpacity={overlayOk ? 1 : 0.7}
                    accessibilityLabel="알람 화면 항상 띄우기"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{t('알람 화면 항상 띄우기')}</Text>
                      <Text style={s.rowSub}>
                        {overlayOk
                          ? t('다른 앱을 쓰는 중에도, 접은 폴더블의 커버 화면에도 알람 끄기 화면이 떠요')
                          : t('눌러서 "다른 앱 위에 표시"를 켜면 다른 앱을 쓰는 중이나 접은 폴더블의 커버 화면에도 알람 끄기 화면이 떠요')}
                      </Text>
                    </View>
                    <Text style={[s.rowValue, overlayOk && { color: C.green }]}>{overlayOk ? t('켜짐') : t('꺼짐 ›')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* '달력 기본 보기(월/주)'는 2026-10-18 새 달력(위아래 연속 스크롤)으로 바뀌며 없앴다 */}
            {(onImportShifts || onShareOn) && (
              <>
                <Text style={s.sectionLabel}>{t('달력')}</Text>
                <View style={s.card}>
                  {onShareOn && (
                    // 자동 공유: 두 앱만 깔려 있으면 버튼 없이. 교대알람이나 세이람 중 한쪽만 켜도 된다
                    <View style={s.rowBetween}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={s.rowTitle}>{t('교대알람과 일정 공유')}</Text>
                        <Text style={s.rowSub}>{shiftsInfo ?? t('같은 폰의 교대알람 근무가 달력에, 세이람 일정이 교대알람 달력에 보여요. 한쪽 앱에서만 켜도 돼요.')}</Text>
                      </View>
                      <Switch value={shareOn} onValueChange={onShareOn} accessibilityLabel={t('교대알람과 일정 공유')} />
                    </View>
                  )}
                  {/* 같은 폰의 교대알람에서 근무표(초번·말번…)를 받아 달력 칸에 작게 보여 준다 — lib/shiftImport.ts
                      (자동 공유가 없는 iOS용. 유료 개발자 계정의 App Group이 생기면 자동 공유로 바꾼다) */}
                  {onImportShifts && <TouchableOpacity style={s.rowBetween} onPress={onImportShifts} activeOpacity={0.7} accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{t('교대알람 근무 가져오기')}</Text>
                      <Text style={s.rowSub}>{shiftsInfo ?? t('같은 폰의 교대알람 근무표를 달력에 함께 보여 줘요')}</Text>
                    </View>
                    <Text style={s.rowValue}>›</Text>
                  </TouchableOpacity>}
                  {shiftsInfo && onClearShifts && !onShareOn && (
                    <TouchableOpacity style={s.rowBetween} onPress={onClearShifts} activeOpacity={0.7} accessibilityRole="button">
                      <Text style={[s.rowTitle, { color: C.red }]}>{t('가져온 근무 지우기')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            <Text style={s.sectionLabel}>{t('데이터')}</Text>
            <View style={s.card}>
              <TouchableOpacity style={s.rowBetween} onPress={() => setBackupOpen(true)} activeOpacity={0.7} accessibilityLabel="백업 · 폰 옮기기">
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{t('백업 · 폰 옮기기')}</Text>
                  <Text style={s.rowSub}>{t('일정 {n}건 · 녹음 있는 일정 {a}건', { n: records.length, a: withAudio })}</Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionLabel}>{t('도움말')}</Text>
            <View style={s.card}>
              <TouchableOpacity style={s.rowBetween} onPress={() => setHelpOpen(true)} activeOpacity={0.7} accessibilityLabel="사용설명서">
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{t('사용설명서')}</Text>
                  <Text style={s.rowSub}>{t('말하는 요령, 달력·찾기, 구간 재생, 알람, 백업')}</Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionLabel}>{t('앱 정보')}</Text>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>{t('버전')}</Text>
                <Text style={s.rowValue}>{version}</Text>
              </View>
              <View style={s.divider} />
              <Text style={s.note}>
                {t('모든 녹음과 일정은 이 폰 안에만 저장되고 서버로 보내지 않습니다. 음성 인식은 기기의 음성 인식 기능을 사용합니다.')}
              </Text>
            </View>
          </ScrollView>

          <BackupSheet
            visible={backupOpen}
            records={records}
            onClose={() => setBackupOpen(false)}
            onRestored={onRestored}
          />
          <HelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: 52, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  navBtn: { minWidth: 56, paddingHorizontal: 10, paddingVertical: 8 },
  navCloseText: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  navTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 40 },
  sectionLabel: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 6, marginBottom: 8 },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: C.border },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: C.textSub, fontSize: 12, marginTop: 3 },
  rowValue: { color: C.textSub, fontSize: 14 },
  chevron: { color: C.textSub, fontSize: 22, fontWeight: '300' },
  segment: { flexDirection: 'row', backgroundColor: C.surfaceHigh, borderRadius: 9, padding: 3 },
  segmentWide: { marginTop: 10, marginBottom: 8 },
  chipWrap: { flexWrap: 'wrap', gap: 4 },
  langChip: { paddingHorizontal: 12, paddingVertical: 7, marginVertical: 1 },
  segBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 7 },
  segBtnGrow: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  segBtnOn: { backgroundColor: C.accent },
  segText: { color: C.textSub, fontSize: 13, fontWeight: '700' },
  segTextOn: { color: C.onAccent },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  note: { color: C.textSub, fontSize: 13, lineHeight: 20 },
});
