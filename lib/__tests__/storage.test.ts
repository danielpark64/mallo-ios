// records.json 저장/백업/복구 — expo-file-system을 인메모리로 대체
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
    copySync(dest: File) { mockStore.set(dest.uri, mockStore.get(this.uri) ?? ''); }
  }
  return { Directory, File, Paths: { document: 'doc', cache: 'cache' } };
});

import { loadRecords, saveRecords, type ScheduleRecord } from '../storage';

const MAIN = 'doc/mallo/records.json';
const BAK = 'doc/mallo/records.bak.json';

const rec = (id: string): ScheduleRecord => ({
  id, uri: '', durationSec: 0, transcript: '', content: `일정 ${id}`,
  scheduleAt: 1_000_000, scheduleDisplay: '', hasDate: true, hasTime: true, createdAt: 1,
});

beforeEach(() => mockStore.clear());

describe('saveRecords / loadRecords', () => {
  test('최초 실행: 파일이 없으면 빈 배열', () => {
    expect(loadRecords()).toEqual([]);
  });

  test('저장하면 본 파일에 기록되고 다시 읽힌다', () => {
    saveRecords([rec('a')]);
    expect(mockStore.has(MAIN)).toBe(true);
    expect(loadRecords().map((r) => r.id)).toEqual(['a']);
  });

  test('두 번째 저장부터 직전 정상본이 백업으로 남는다', () => {
    saveRecords([rec('a')]);
    expect(mockStore.has(BAK)).toBe(false); // 첫 저장: 백업할 이전본 없음
    saveRecords([rec('a'), rec('b')]);
    expect(JSON.parse(mockStore.get(BAK)!).map((r: ScheduleRecord) => r.id)).toEqual(['a']);
    expect(JSON.parse(mockStore.get(MAIN)!).map((r: ScheduleRecord) => r.id)).toEqual(['a', 'b']);
  });

  test('본 파일이 깨지면(쓰기 중 크래시) 백업본으로 복구한다', () => {
    saveRecords([rec('a')]);
    saveRecords([rec('a'), rec('b')]);
    mockStore.set(MAIN, '[{"id":"a"},{"id":"b"'); // 잘린 JSON
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadRecords().map((r) => r.id)).toEqual(['a']);
    warn.mockRestore();
  });

  test('본 파일이 배열이 아니면 백업으로, 백업도 없으면 빈 배열', () => {
    mockStore.set(MAIN, '{"oops":true}');
    expect(loadRecords()).toEqual([]);
    mockStore.set(BAK, JSON.stringify([rec('z')]));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadRecords().map((r) => r.id)).toEqual(['z']);
    warn.mockRestore();
  });

  test('정상적으로 비운 목록([])은 백업으로 되돌리지 않는다', () => {
    saveRecords([rec('a')]);
    saveRecords([]); // 사용자가 전부 삭제 → 백업엔 ['a']가 남아 있음
    expect(loadRecords()).toEqual([]);
  });
});
