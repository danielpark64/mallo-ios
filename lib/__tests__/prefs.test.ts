// 사용자 환경설정(달력 월/주 기본 보기) 저장·복원 — expo-file-system 인메모리 대체
const mockStore = new Map<string, string>();

jest.mock('expo-file-system', () => {
  const join = (parts: any[]) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: any[]) { this.uri = join(parts); }
    get exists() { return true; }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: any[]) { this.uri = join(parts); }
    get exists() { return mockStore.has(this.uri); }
    create() { if (!mockStore.has(this.uri)) mockStore.set(this.uri, ''); }
    write(s: string) { mockStore.set(this.uri, s); }
    textSync() { return mockStore.get(this.uri) ?? ''; }
    delete() { mockStore.delete(this.uri); }
  }
  return { Directory, File, Paths: { document: 'doc', cache: 'cache' } };
});

import { loadPrefs, savePrefs } from '../prefs';

const FILE = 'doc/mallo/prefs.json';
beforeEach(() => mockStore.clear());

describe('prefs', () => {
  test('파일이 없으면 기본값(월 보기)', () => {
    expect(loadPrefs()).toEqual({ calendarMode: 'month' });
  });
  test('저장한 달력 모드를 다시 읽는다', () => {
    savePrefs({ calendarMode: 'week' });
    expect(JSON.parse(mockStore.get(FILE)!)).toEqual({ calendarMode: 'week' });
    expect(loadPrefs().calendarMode).toBe('week');
  });
  test('깨진 파일·이상한 값이면 기본값으로', () => {
    mockStore.set(FILE, '{not json');
    expect(loadPrefs().calendarMode).toBe('month');
    mockStore.set(FILE, JSON.stringify({ calendarMode: 'year' }));
    expect(loadPrefs().calendarMode).toBe('month');
  });
});
