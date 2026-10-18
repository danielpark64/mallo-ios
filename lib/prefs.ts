// ─── 사용자 환경설정 (expo-file-system JSON) ───────────────────────────────────
// 달력 기본 보기(월/주)처럼 사용자가 고른 값을 앱 재시작 후에도 유지한다.
import { Directory, File, Paths } from 'expo-file-system';
import { DEFAULT_REMIND, normalizeRemind } from './reminders';

export type CalendarMode = 'month' | 'week';
export type ThemeSetting = 'system' | 'light' | 'dark';
export type FontScaleName = 'small' | 'medium' | 'large' | 'xlarge';
export type LanguageSetting = 'system' | 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant' | 'es' | 'fr' | 'de' | 'pt';
// [VOICE_ALARM] 보류된 기능 (lib/voiceAlarm.ts 스위치로 꺼짐)
export type Prefs = { calendarMode: CalendarMode; theme: ThemeSetting; fontScale: FontScaleName; defaultRemind: number[]; language: LanguageSetting; /** 새 일정의 알람을 내 목소리로 (기본 꺼짐) */ voiceAlarm: boolean; /** 목록을 한 줄 보기로 (기본 꺼짐 = 크게) */ listCompact: boolean; /** 달력 확대 단계 0 작게·1 보통·2 크게 */ calDensity: 0 | 1 | 2; /** 교대알람과 일정 자동 공유(한쪽만 켜도 공유) */ shareWithAlarmApp: boolean };

const DEFAULTS: Prefs = { calendarMode: 'month', theme: 'system', fontScale: 'medium', defaultRemind: [...DEFAULT_REMIND], language: 'system', voiceAlarm: false, listCompact: false, calDensity: 1, shareWithAlarmApp: false };
const LANGUAGES: LanguageSetting[] = ['system', 'ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt'];
const THEMES: ThemeSetting[] = ['system', 'light', 'dark'];
const FONT_SCALES: FontScaleName[] = ['small', 'medium', 'large', 'xlarge'];
const DIR = new Directory(Paths.document, 'mallo');
const FILE = new File(DIR, 'prefs.json');

export function loadPrefs(): Prefs {
  try {
    if (!FILE.exists) return { ...DEFAULTS };
    const parsed = JSON.parse(FILE.textSync());
    const mode = parsed?.calendarMode;
    return {
      ...DEFAULTS,
      ...(mode === 'month' || mode === 'week' ? { calendarMode: mode } : {}),
      ...(THEMES.includes(parsed?.theme) ? { theme: parsed.theme as ThemeSetting } : {}),
      ...(FONT_SCALES.includes(parsed?.fontScale) ? { fontScale: parsed.fontScale as FontScaleName } : {}),
      ...(Array.isArray(parsed?.defaultRemind) ? { defaultRemind: normalizeRemind(parsed.defaultRemind) } : {}),
      ...(LANGUAGES.includes(parsed?.language) ? { language: parsed.language as LanguageSetting } : {}),
      ...(typeof parsed?.voiceAlarm === 'boolean' ? { voiceAlarm: parsed.voiceAlarm } : {}),
      ...(typeof parsed?.listCompact === 'boolean' ? { listCompact: parsed.listCompact } : {}),
      ...(typeof parsed?.shareWithAlarmApp === 'boolean' ? { shareWithAlarmApp: parsed.shareWithAlarmApp } : {}),
      ...([0, 1, 2].includes(parsed?.calDensity) ? { calDensity: parsed.calDensity as 0 | 1 | 2 } : {}),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(patch: Partial<Prefs>) {
  try {
    if (!DIR.exists) DIR.create({ intermediates: true });
    const next = { ...loadPrefs(), ...patch };
    if (!FILE.exists) FILE.create();
    FILE.write(JSON.stringify(next));
  } catch (e) {
    console.warn('prefs 저장 실패:', e);
  }
}
