// ─── 다국어(한국어/영어) ───────────────────────────────────────────────────────
// 키는 한국어 원문 그대로: t('듣고 있어요'). 영어 사전에 없으면 한국어를 그대로 돌려줘 누락이 있어도 깨지지 않는다.
// 치환: t('일정 {n}건', { n: 3 }). 언어는 설정(prefs.language: system|ko|en)에서 고르고, 시스템은 기기 언어를 따른다.
// 컴포넌트는 useT()로 받아 언어가 바뀌면 다시 그려지고, 훅을 못 쓰는 순수 함수(날짜 포맷·알림 문구)는 getLang()/t()를 직접 쓴다.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadPrefs, savePrefs, type LanguageSetting } from '../prefs';
import { EN } from './en';

import { LANGS, LANG_NATIVE_NAME, getLang, langFromLocale, setCurrentLang, type Lang } from './lang';
export { LANGS, LANG_NATIVE_NAME, getLang, setCurrentLang, type Lang };
import { DICTS } from './dicts';

export function systemLang(): Lang {
  try {
    // Hermes 내장 Intl로 기기 언어를 읽는다 (expo-localization 없이). 예: "ko-KR", "en-US"
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'ko';
    return langFromLocale(locale) ?? 'en';
  } catch {
    return 'ko';
  }
}

export function resolveLang(setting: LanguageSetting): Lang {
  return setting === 'system' ? systemLang() : setting;
}


export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: string, params?: Params): string {
  let s = lang === 'ko' ? key : (DICTS[lang]?.[key] ?? EN[key] ?? key);
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
/** 현재 언어로 번역 (순수 함수용) */
export function t(key: string, params?: Params): string {
  return translate(getLang(), key, params);
}

type Ctx = { lang: Lang; setting: LanguageSetting; setSetting: (s: LanguageSetting) => void; t: (key: string, params?: Params) => string };
const LangContext = createContext<Ctx>({ lang: 'ko', setting: 'system', setSetting: () => {}, t: (k, p) => translate('ko', k, p) });

export function LanguageProvider({ children, initial }: { children: ReactNode; initial?: LanguageSetting }) {
  const [setting, setSettingState] = useState<LanguageSetting>(() => initial ?? loadPrefs().language);
  const lang = resolveLang(setting);
  setCurrentLang(lang);
  const setSetting = useCallback((s: LanguageSetting) => { setSettingState(s); savePrefs({ language: s }); }, []);
  const value = useMemo<Ctx>(() => ({ lang, setting, setSetting, t: (k, p) => translate(lang, k, p) }), [lang, setting, setSetting]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** 컴포넌트용: const { t, lang } = useT(); */
export function useT() {
  return useContext(LangContext);
}
export const LANGUAGE_LABEL: Record<LanguageSetting, string> = { system: '시스템', ...LANG_NATIVE_NAME };
