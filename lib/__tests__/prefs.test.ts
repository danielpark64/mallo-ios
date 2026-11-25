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
  test('파일이 없으면 기본값(월 보기·시스템 테마·보통 글자)', () => {
    expect(loadPrefs()).toEqual({ calendarMode: 'month', theme: 'system', fontScale: 'medium', defaultRemind: [30], language: 'system', voiceAlarm: false, listCompact: false, calDensity: 1, shareWithAlarmApp: false, showLunar: false, sendName: '', sendVia: 'auto', alarmSound: 'default', alarmScreenAskedAt: 0, updateLaterDay: '' });
  });
  test('저장한 달력 모드를 다시 읽는다 (다른 값은 기본값 유지)', () => {
    savePrefs({ calendarMode: 'week' });
    expect(JSON.parse(mockStore.get(FILE)!)).toEqual({ calendarMode: 'week', theme: 'system', fontScale: 'medium', defaultRemind: [30], language: 'system', voiceAlarm: false, listCompact: false, calDensity: 1, shareWithAlarmApp: false, showLunar: false, sendName: '', sendVia: 'auto', alarmSound: 'default', alarmScreenAskedAt: 0, updateLaterDay: '' });
    expect(loadPrefs().calendarMode).toBe('week');
  });
  test('테마·글자 크기를 저장하고 다시 읽는다, 이상한 값은 기본값', () => {
    savePrefs({ theme: 'light', fontScale: 'xlarge' });
    expect(loadPrefs()).toMatchObject({ theme: 'light', fontScale: 'xlarge', calendarMode: 'month' });
    mockStore.set(FILE, JSON.stringify({ theme: 'sepia', fontScale: 'huge' }));
    expect(loadPrefs()).toMatchObject({ theme: 'system', fontScale: 'medium' });
  });
  test('깨진 파일·이상한 값이면 기본값으로', () => {
    mockStore.set(FILE, '{not json');
    expect(loadPrefs().calendarMode).toBe('month');
    mockStore.set(FILE, JSON.stringify({ calendarMode: 'year' }));
    expect(loadPrefs().calendarMode).toBe('month');
  });
  test('한 줄 보기 설정을 저장하고 다시 읽는다, 이상한 값은 기본값(크게)', () => {
    savePrefs({ listCompact: true });
    expect(loadPrefs().listCompact).toBe(true);
    mockStore.set(FILE, JSON.stringify({ listCompact: 'yes' }));
    expect(loadPrefs().listCompact).toBe(false);
  });
});

describe('prefs 음력 표시', () => {
  test('음력 표시를 저장하고 다시 읽는다, 이상한 값은 기본값(꺼짐)', () => {
    savePrefs({ showLunar: true });
    expect(loadPrefs().showLunar).toBe(true);
    mockStore.set(FILE, JSON.stringify({ showLunar: 'on' }));
    expect(loadPrefs().showLunar).toBe(false);
  });
});

describe('prefs 일정 보내기 방식(1.2.1 나라별 메신저)', () => {
  test('옛 값 kakao(1.2.0까지)는 messenger로 읽고, 다른 설정은 그대로', () => {
    mockStore.set(FILE, JSON.stringify({ sendVia: 'kakao', sendName: '아들', calendarMode: 'week' }));
    const p = loadPrefs();
    expect(p.sendVia).toBe('messenger');
    expect(p.sendName).toBe('아들');
    expect(p.calendarMode).toBe('week');
  });
  test('옛 값을 읽은 뒤 다른 설정을 저장하면 파일에도 messenger로 바뀐다', () => {
    mockStore.set(FILE, JSON.stringify({ sendVia: 'kakao' }));
    savePrefs({ sendName: '엄마' });
    expect(JSON.parse(mockStore.get(FILE)!).sendVia).toBe('messenger');
  });
  test('sms·messenger는 그대로, 처음·이상한 값은 auto(나라 기본)', () => {
    savePrefs({ sendVia: 'sms' });
    expect(loadPrefs().sendVia).toBe('sms');
    savePrefs({ sendVia: 'messenger' });
    expect(loadPrefs().sendVia).toBe('messenger');
    savePrefs({ sendVia: 'share' });
    expect(loadPrefs().sendVia).toBe('share');
    mockStore.set(FILE, JSON.stringify({ sendVia: 'line' }));
    expect(loadPrefs().sendVia).toBe('auto');
    mockStore.clear();
    expect(loadPrefs().sendVia).toBe('auto');
  });
});

describe('새 버전 안내 [나중에] 날짜(1.2.3)', () => {
  test('날짜 형식만 받고, 이상한 값은 빈 값', () => {
    savePrefs({ updateLaterDay: '2026-11-25' });
    expect(loadPrefs().updateLaterDay).toBe('2026-11-25');
    savePrefs({ updateLaterDay: 'x' as string });
    expect(loadPrefs().updateLaterDay).toBe('');
  });
});
