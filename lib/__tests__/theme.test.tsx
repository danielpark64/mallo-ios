// 테마(시스템/라이트/다크) 결정과 글자 배율, AppText 적용 — expo-file-system 인메모리 대체
const mockStore = new Map<string, string>();
jest.mock('expo-file-system', () => {
  const join = (parts: any[]) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory { uri: string; constructor(...parts: any[]) { this.uri = join(parts); } get exists() { return true; } create() {} }
  class File {
    uri: string; constructor(...parts: any[]) { this.uri = join(parts); }
    get exists() { return mockStore.has(this.uri); }
    create() { if (!mockStore.has(this.uri)) mockStore.set(this.uri, ''); }
    write(s: string) { mockStore.set(this.uri, s); }
    textSync() { return mockStore.get(this.uri) ?? ''; }
  }
  return { Directory, File, Paths: { document: 'doc', cache: 'cache' } };
});
let mockScheme: string | null = 'dark';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => mockScheme }));

import { act, render, renderHook } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Text, scaledTextStyle } from '../../components/AppText';
import { DARK, LIGHT } from '../colors';
import { FONT_SCALE, ThemeProvider, resolveTheme, useFontScale, useTheme, useThemeSetting } from '../theme';

beforeEach(() => { mockStore.clear(); mockScheme = 'dark'; });

describe('resolveTheme', () => {
  test('라이트/다크는 그대로, 시스템은 OS 값(모르면 다크)', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', null)).toBe('dark');
  });
});

describe('ThemeProvider', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
  test('기본은 시스템 따르기: OS가 라이트면 라이트 팔레트', async () => {
    mockScheme = 'light';
    const { result } = await renderHook(() => useTheme(), { wrapper });
    expect(result.current).toBe(LIGHT);
  });
  test('설정을 바꾸면 팔레트·배율이 바뀌고 prefs.json에 저장된다', async () => {
    const { result } = await renderHook(() => ({ set: useThemeSetting(), colors: useTheme(), font: useFontScale() }), { wrapper });
    expect(result.current.colors).toBe(DARK);
    expect(result.current.font.scale).toBe(1);
    await act(async () => { result.current.set.setThemeSetting('light'); result.current.set.setFontScale('xlarge'); });
    expect(result.current.colors).toBe(LIGHT);
    expect(result.current.font).toEqual({ fontScale: 'xlarge', scale: FONT_SCALE.xlarge });
    expect(JSON.parse(mockStore.get('doc/mallo/prefs.json')!)).toMatchObject({ theme: 'light', fontScale: 'xlarge' });
  });
  test('저장된 설정을 시작할 때 읽는다', async () => {
    mockStore.set('doc/mallo/prefs.json', JSON.stringify({ theme: 'light', fontScale: 'large' }));
    const { result } = await renderHook(() => ({ colors: useTheme(), font: useFontScale() }), { wrapper });
    expect(result.current.colors).toBe(LIGHT);
    expect(result.current.font.scale).toBe(1.3);
  });
});

describe('AppText', () => {
  test('배율을 fontSize·lineHeight에 곱한다 (fontSize 없으면 14 기준)', () => {
    expect(scaledTextStyle({ fontSize: 20, lineHeight: 30 }, 1.3)).toEqual({ fontSize: 26, lineHeight: 39 });
    expect(scaledTextStyle(undefined, 1.45)).toEqual({ fontSize: 14 * 1.45 });
  });
  test('설정이 아주 크게면 글자가 1.45배로 그려지고 OS 배율 상한이 걸린다', async () => {
    mockStore.set('doc/mallo/prefs.json', JSON.stringify({ fontScale: 'xlarge' }));
    const screen = await render(<ThemeProvider><Text testID="t" style={{ fontSize: 10 }}>가</Text></ThemeProvider>);
    const t = screen.getByTestId('t');
    expect(StyleSheet.flatten(t.props.style).fontSize).toBeCloseTo(14.5);
    expect(t.props.maxFontSizeMultiplier).toBe(1.5);
  });
});
