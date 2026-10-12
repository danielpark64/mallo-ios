// ─── 테마(다크/라이트/시스템) + 글자 크기 배율 ──────────────────────────────────
// 설정값은 prefs.json에 저장되고(lib/prefs.ts), 앱 어디서나 useTheme()/useFontScale()로 읽는다.
// 각 화면의 StyleSheet는 `makeStyles(C)` 함수로 만들어 팔레트가 바뀌면 다시 만든다.
// 글자 크기는 components/AppText.tsx 의 Text 가 fontSize에 배율을 곱해 일괄 적용하고,
// 글자에 맞춰 커져야 하는 칸 높이(휠·달력 칸 등)는 useFontScale().scale 을 곱한다.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { DARK, LIGHT, type Palette } from './colors';
export type { Palette };
import { loadPrefs, savePrefs, type FontScaleName, type ThemeSetting } from './prefs';

export const FONT_SCALE: Record<FontScaleName, number> = { small: 0.88, medium: 1, large: 1.3, xlarge: 1.45 };
export const FONT_SCALE_LABEL: Record<FontScaleName, string> = { small: '작게', medium: '보통', large: '크게', xlarge: '아주 크게' };
export const THEME_LABEL: Record<ThemeSetting, string> = { system: '시스템', light: '라이트', dark: '다크' };
/** OS "큰 글씨" 접근성 설정까지 겹치면 과해지므로 OS 배율 상한 */
export const MAX_OS_FONT_MULTIPLIER = 1.5;

export type ResolvedTheme = 'light' | 'dark';

type Ctx = {
  themeSetting: ThemeSetting;
  resolved: ResolvedTheme;
  colors: Palette;
  fontScale: FontScaleName;
  scale: number;
  setThemeSetting: (t: ThemeSetting) => void;
  setFontScale: (f: FontScaleName) => void;
};

const DEFAULT_CTX: Ctx = {
  themeSetting: 'system', resolved: 'dark', colors: DARK, fontScale: 'medium', scale: 1,
  setThemeSetting: () => {}, setFontScale: () => {},
};
const ThemeContext = createContext<Ctx>(DEFAULT_CTX);

export function resolveTheme(setting: ThemeSetting, systemScheme: string | null | undefined): ResolvedTheme {
  if (setting === 'light' || setting === 'dark') return setting;
  return systemScheme === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children, initial }: { children: ReactNode; initial?: Partial<Pick<Ctx, 'themeSetting' | 'fontScale'>> }) {
  const [prefs] = useState(() => loadPrefs());
  const [themeSetting, setThemeState] = useState<ThemeSetting>(initial?.themeSetting ?? prefs.theme);
  const [fontScale, setFontState] = useState<FontScaleName>(initial?.fontScale ?? prefs.fontScale);
  const system = useColorScheme();
  const resolved = resolveTheme(themeSetting, system);

  const setThemeSetting = useCallback((t: ThemeSetting) => { setThemeState(t); savePrefs({ theme: t }); }, []);
  const setFontScale = useCallback((f: FontScaleName) => { setFontState(f); savePrefs({ fontScale: f }); }, []);

  const value = useMemo<Ctx>(() => ({
    themeSetting, resolved, colors: resolved === 'light' ? LIGHT : DARK,
    fontScale, scale: FONT_SCALE[fontScale], setThemeSetting, setFontScale,
  }), [themeSetting, resolved, fontScale, setThemeSetting, setFontScale]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** 현재 팔레트. 컴포넌트에서 `const C = useTheme();` 로 받아 makeStyles(C)와 inline 색에 쓴다 */
export function useTheme(): Palette {
  return useContext(ThemeContext).colors;
}
export function useResolvedTheme(): ResolvedTheme {
  return useContext(ThemeContext).resolved;
}
export function useFontScale() {
  const { fontScale, scale } = useContext(ThemeContext);
  return { fontScale, scale };
}
export function useThemeSetting() {
  const { themeSetting, setThemeSetting, fontScale, setFontScale } = useContext(ThemeContext);
  return { themeSetting, setThemeSetting, fontScale, setFontScale };
}
