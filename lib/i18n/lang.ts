// ─── 현재 언어 상태 (의존성 없음) ───────────────────────────────────────────────
// dateUtils·reminders·notifications 같은 순수 모듈이 prefs/expo-file-system 없이 언어만 읽을 수 있게 분리.
export const LANGS = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NATIVE_NAME: Record<Lang, string> = {
  ko: '대한민국', en: 'English', ja: '日本語', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
  es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português',
};
/** 음성 인식 언어 코드 */
export const STT_LOCALE: Record<Lang, string> = {
  ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR',
};
/** 기기 로캘("ja-JP", "zh-Hant-TW", "pt-BR"…) → 지원 언어, 없으면 null */
export function langFromLocale(locale: string | undefined | null): Lang | null {
  const l = (locale ?? '').toLowerCase();
  if (l.startsWith('ko')) return 'ko';
  if (l.startsWith('en')) return 'en';
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('fr')) return 'fr';
  if (l.startsWith('de')) return 'de';
  if (l.startsWith('pt')) return 'pt';
  return null;
}
let currentLang: Lang = 'ko';
export function getLang(): Lang { return currentLang; }
export function setCurrentLang(l: Lang) { currentLang = l; }
