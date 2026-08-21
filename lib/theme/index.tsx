// ─── 테마 Provider / 훅 ────────────────────────────────────────────────────────
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type ViewStyle } from 'react-native';
import { dark, light, type Palette } from './palette';
import { duration, font, radius, screenPad, shadow, space, tabularNums, typo } from './tokens';

export type Theme = {
  c: Palette;
  scheme: 'light' | 'dark';
  space: typeof space;
  screenPad: typeof screenPad;
  radius: typeof radius;
  shadow: typeof shadow;
  typo: typeof typo;
  font: typeof font;
  tabularNums: typeof tabularNums;
  duration: typeof duration;
  /**
   * 라이트는 그림자, 다크는 테두리로 카드를 띄운다.
   * 다크에서 그림자는 보이지도 않으면서 저사양 기기(32)에서 비용만 든다.
   */
  elevation: (level?: 'e1' | 'e2' | 'e3') => ViewStyle;
};

function makeTheme(scheme: 'light' | 'dark'): Theme {
  const c = scheme === 'dark' ? dark : light;
  return {
    c, scheme, space, screenPad, radius, shadow, typo, font, tabularNums, duration,
    elevation: (level = 'e1') =>
      scheme === 'dark'
        ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }
        : shadow[level],
  };
}

const LIGHT_THEME = makeTheme('light');
const DARK_THEME = makeTheme('dark');

const ThemeContext = createContext<Theme>(DARK_THEME);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  // 나중에 "시스템/라이트/다크" 수동 전환을 넣으려면 여기에 override state를 둔다
  const theme = scheme === 'light' ? LIGHT_THEME : DARK_THEME;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * makeStyles 팩토리를 테마에 묶어 메모이즈한다.
 * ⚠️ factory는 반드시 모듈 최상위 상수여야 한다 —
 * 컴포넌트 안에서 정의하면 매 렌더 새 함수가 되어 useMemo가 무효화된다.
 */
export function useStyles<T>(factory: (t: Theme) => T): T {
  const t = useTheme();
  return useMemo(() => factory(t), [t, factory]);
}

export type { Palette };
export { light, dark };
