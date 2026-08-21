// ─── 앱 설정 영구 저장 (expo-file-system JSON) ─────────────────────────────────
import { Directory, File, Paths } from 'expo-file-system';

export type ThemeOverride = 'system' | 'light' | 'dark';

export type Settings = {
  themeOverride: ThemeOverride;
};

const DEFAULT_SETTINGS: Settings = { themeOverride: 'system' };

const DIR = new Directory(Paths.document, 'mallo');
const FILE = new File(DIR, 'settings.json');

export function loadSettings(): Settings {
  try {
    if (!FILE.exists) return DEFAULT_SETTINGS;
    const raw = FILE.textSync();
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(next: Settings) {
  try {
    if (!DIR.exists) DIR.create({ intermediates: true });
    if (!FILE.exists) FILE.create();
    FILE.write(JSON.stringify(next));
  } catch (e) {
    console.warn('설정 저장 실패:', e);
  }
}
