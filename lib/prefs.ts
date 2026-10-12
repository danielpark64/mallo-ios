// ─── 사용자 환경설정 (expo-file-system JSON) ───────────────────────────────────
// 달력 기본 보기(월/주)처럼 사용자가 고른 값을 앱 재시작 후에도 유지한다.
import { Directory, File, Paths } from 'expo-file-system';
import { DEFAULT_REMIND, normalizeRemind } from './reminders';

export type CalendarMode = 'month' | 'week';
export type ThemeSetting = 'system' | 'light' | 'dark';
export type FontScaleName = 'small' | 'medium' | 'large' | 'xlarge';
export type LanguageSetting = 'system' | 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant' | 'es' | 'fr' | 'de' | 'pt';
export type Prefs = { calendarMode: CalendarMode; theme: ThemeSetting; fontScale: FontScaleName; defaultRemind: number[]; language: LanguageSetting };

const DEFAULTS: Prefs = { calendarMode: 'month', theme: 'system', fontScale: 'medium', defaultRemind: [...DEFAULT_REMIND], language: 'system' };
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
