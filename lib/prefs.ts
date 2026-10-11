// ─── 사용자 환경설정 (expo-file-system JSON) ───────────────────────────────────
// 달력 기본 보기(월/주)처럼 사용자가 고른 값을 앱 재시작 후에도 유지한다.
import { Directory, File, Paths } from 'expo-file-system';

export type CalendarMode = 'month' | 'week';
export type Prefs = { calendarMode: CalendarMode };

const DEFAULTS: Prefs = { calendarMode: 'month' };
const DIR = new Directory(Paths.document, 'mallo');
const FILE = new File(DIR, 'prefs.json');

export function loadPrefs(): Prefs {
  try {
    if (!FILE.exists) return { ...DEFAULTS };
    const parsed = JSON.parse(FILE.textSync());
    const mode = parsed?.calendarMode;
    return { ...DEFAULTS, ...(mode === 'month' || mode === 'week' ? { calendarMode: mode } : {}) };
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
