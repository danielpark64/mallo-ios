// 설정 화면: 백업/설명서 진입 (달력 기본 보기 토글은 2026-10-18 없앰)
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));
jest.mock('../../lib/backup', () => ({
  createBackup: jest.fn(), deleteBackup: jest.fn(), listBackups: jest.fn(() => []), restoreBackup: jest.fn(),
  exportBackupToFolderAndroid: jest.fn(), importBackupFromFolderAndroid: jest.fn(),
}));

jest.mock('expo-file-system', () => {
  const store = new Map<string, string>();
  const join = (parts: any[]) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory { uri: string; constructor(...parts: any[]) { this.uri = join(parts); } get exists() { return true; } create() {} }
  class File {
    uri: string; constructor(...parts: any[]) { this.uri = join(parts); }
    get exists() { return store.has(this.uri); }
    create() { if (!store.has(this.uri)) store.set(this.uri, ''); }
    write(s: string) { store.set(this.uri, s); }
    textSync() { return store.get(this.uri) ?? ''; }
  }
  return { Directory, File, Paths: { document: 'doc', cache: 'cache' } };
});

import { SettingsSheet } from '../SettingsSheet';
import { ThemeProvider } from '../../lib/theme';

const base = { visible: true, records: [], onRestored: () => {}, onClose: () => {}, defaultRemind: [30], onDefaultRemind: () => {} };

describe('SettingsSheet', () => {
  test('버전과 항목이 보이고, 달력 기본 보기(월/주)는 없다(새 달력은 위아래 연속 스크롤 — 2026-10-18)', async () => {
    const { getByText, queryByLabelText } = await render(
      <SettingsSheet {...base} calendarMode="month" onCalendarMode={() => {}} />
    );
    expect(getByText('1.2.3')).toBeTruthy();
    expect(getByText('백업 · 폰 옮기기')).toBeTruthy();
    expect(getByText('사용설명서')).toBeTruthy();
    expect(queryByLabelText('월 보기')).toBeNull();
    expect(queryByLabelText('주 보기')).toBeNull();
  });

  test('사용설명서를 누르면 설명서 화면이 열린다', async () => {
    const { getByLabelText, getByText } = await render(
      <SettingsSheet {...base} calendarMode="month" onCalendarMode={() => {}} />
    );
    await fireEvent.press(getByLabelText('사용설명서'));
    expect(getByText('1. 시작하기')).toBeTruthy();
    expect(getByText('9. 백업과 폰 옮기기')).toBeTruthy();
  });

  test('백업 · 폰 옮기기를 누르면 백업 화면이 열린다', async () => {
    const { getByLabelText, getByText } = await render(
      <SettingsSheet {...base} calendarMode="week" onCalendarMode={() => {}} />
    );
    await fireEvent.press(getByLabelText('백업 · 폰 옮기기'));
    expect(getByText('지금 백업 만들기')).toBeTruthy();
  });
});

describe('SettingsSheet 화면 설정', () => {
  test('테마·글자 크기 항목이 보이고 누르면 바뀐다', async () => {
    const { getByLabelText, getByText } = await render(
      <SettingsSheet {...base} calendarMode="month" onCalendarMode={() => {}} />
    );
    expect(getByText('테마')).toBeTruthy();
    expect(getByText('글자 크기')).toBeTruthy();
    expect(getByLabelText('테마 시스템').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('글자 크기 보통').props.accessibilityState.selected).toBe(true);
    // 프로바이더 없이도(기본 컨텍스트) 렌더되고, 프로바이더 안에서는 누르면 선택이 옮겨간다
    const { getByLabelText: g2 } = await render(
      <ThemeProvider>
        <SettingsSheet {...base} calendarMode="month" onCalendarMode={() => {}} />
      </ThemeProvider>
    );
    await fireEvent.press(g2('테마 라이트'));
    expect(g2('테마 라이트').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(g2('글자 크기 아주 크게'));
    expect(g2('글자 크기 아주 크게').props.accessibilityState.selected).toBe(true);
  });

  test('언어 항목: 시스템/한국어/English 세그먼트, English를 고르면 문구가 영어로 바뀐다', async () => {
    const { LanguageProvider } = require('../../lib/i18n');
    const { getByLabelText, getByText, queryByText } = await render(
      <LanguageProvider initial="ko">
        <SettingsSheet {...base} calendarMode="month" onCalendarMode={() => {}} />
      </LanguageProvider>
    );
    expect(getByText('언어')).toBeTruthy();
    expect(getByLabelText('언어 대한민국').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(getByLabelText('언어 English'));
    expect(getByLabelText('Language English').props.accessibilityState.selected).toBe(true);
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Language')).toBeTruthy();
    expect(getByText('Extra large')).toBeTruthy();
    expect(queryByText('설정')).toBeNull();
    // 접근성 라벨도 앱 언어를 따라간다 (스크린리더가 화면 언어로 읽도록)
    expect(getByLabelText('Theme System')).toBeTruthy();
  });
});
