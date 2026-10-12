// 전체 백업/복원: 폴더 생성·녹음 복사·목록·복원 병합·경로 재배치 — expo-file-system 인메모리 대체
const mockStore = new Map<string, string>(); // 파일 uri → 내용
const mockDirs = new Set<string>();          // 디렉터리 uri

jest.mock('expo-file-system', () => {
  const join = (parts: any[]) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: any[]) { this.uri = join(parts); }
    get exists() { return mockDirs.has(this.uri); }
    create() { mockDirs.add(this.uri); }
    delete() {
      mockDirs.delete(this.uri);
      for (const k of Array.from(mockStore.keys())) if (k.startsWith(this.uri + '/')) mockStore.delete(k);
      for (const d of Array.from(mockDirs)) if (d.startsWith(this.uri + '/')) mockDirs.delete(d);
    }
    list() {
      const out: any[] = [];
      for (const d of mockDirs) if (d.startsWith(this.uri + '/') && !d.slice(this.uri.length + 1).includes('/')) out.push(new Directory(d));
      for (const f of mockStore.keys()) if (f.startsWith(this.uri + '/') && !f.slice(this.uri.length + 1).includes('/')) out.push(new File(f));
      return out;
    }
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
jest.mock('expo-file-system/legacy', () => ({ StorageAccessFramework: {}, EncodingType: { Base64: 'base64' } }));

import { audioNamesOf, backupName, createBackup, deleteBackup, listBackups, mergeRecords, parseBackupDate, restoreBackup } from '../backup';
import type { ScheduleRecord } from '../storage';

const rec = (id: string, uri: string, appendUri?: string): ScheduleRecord => ({
  id, uri, durationSec: 3, transcript: '', content: `일정 ${id}`,
  scheduleAt: 1_000_000 + Number(id), scheduleDisplay: '', hasDate: true, hasTime: true, createdAt: 1,
  appends: appendUri ? [{ id: `${id}a`, uri: appendUri, durationSec: 1, transcript: '', content: '추가', createdAt: 1 }] : undefined,
});

beforeEach(() => { mockStore.clear(); mockDirs.clear(); mockDirs.add('doc/mallo'); jest.restoreAllMocks(); });

describe('backupName / audioNamesOf / mergeRecords', () => {
  test('백업 이름에 날짜·시각이 들어가고 다시 읽어낼 수 있다', () => {
    const name = backupName(new Date(2026, 9, 12, 7, 5));
    expect(name).toBe('말로백업_2026-10-12_0705');
    expect(new Date(parseBackupDate(name)).getHours()).toBe(7);
    expect(parseBackupDate('이상한이름')).toBe(0);
  });
  test('메인·추가 녹음 파일명을 중복 없이 모은다 (빈 uri 제외)', () => {
    const names = audioNamesOf([rec('1', 'doc/mallo/rec_1.m4a', 'doc/mallo/rec_1_a.m4a'), rec('2', ''), rec('3', 'doc/mallo/rec_1.m4a')]);
    expect(names.sort()).toEqual(['rec_1.m4a', 'rec_1_a.m4a']);
  });
  test('같은 id는 건너뛰고 새 것만 앞에 더한다', () => {
    const r = mergeRecords([rec('1', '')], [rec('1', ''), rec('2', '')]);
    expect(r.records.map((x) => x.id)).toEqual(['2', '1']);
    expect([r.added, r.skipped]).toEqual([1, 1]);
  });
});

describe('createBackup / listBackups / restoreBackup / deleteBackup', () => {
  test('백업 폴더에 records.json과 존재하는 녹음만 복사된다', () => {
    mockStore.set('doc/mallo/rec_1.m4a', 'A'); // rec_2는 파일 없음
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 12, 7, 5).getTime());
    jest.useFakeTimers({ now: new Date(2026, 9, 12, 7, 5) });
    const b = createBackup([rec('1', 'doc/mallo/rec_1.m4a'), rec('2', 'doc/mallo/rec_2.m4a')]);
    jest.useRealTimers();
    expect(b.name).toBe('말로백업_2026-10-12_0705');
    expect(b.count).toBe(2);
    expect(b.audioFiles).toBe(1);
    expect(mockStore.get(`doc/mallo-backups/${b.name}/rec_1.m4a`)).toBe('A');
    expect(JSON.parse(mockStore.get(`doc/mallo-backups/${b.name}/records.json`)!)).toHaveLength(2);
    const list = listBackups();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: b.name, count: 2, audioFiles: 1 });
  });

  test('복원: 다른 폰 경로의 uri를 현재 폴더로 바꾸고, 없는 녹음만 복사하며, 기존 일정은 유지한다', () => {
    // 다른 폰에서 만든 백업 폴더를 흉내 낸다
    const dir = 'doc/mallo-backups/말로백업_2026-10-01_0900';
    mockDirs.add('doc/mallo-backups'); mockDirs.add(dir);
    const foreign = [
      rec('10', 'file:///other-phone/Documents/mallo/rec_10.m4a', 'file:///other-phone/Documents/mallo/rec_10_a.m4a'),
      rec('11', 'file:///other-phone/Documents/mallo/rec_11.m4a'),
    ];
    mockStore.set(`${dir}/records.json`, JSON.stringify(foreign));
    mockStore.set(`${dir}/rec_10.m4a`, 'ten');
    mockStore.set(`${dir}/rec_10_a.m4a`, 'ten-a');
    // rec_11.m4a는 백업에 없음
    mockStore.set('doc/mallo/rec_10.m4a', 'already-here'); // 이미 있는 파일은 덮어쓰지 않음

    const existing = [rec('10', 'doc/mallo/rec_10.m4a'), rec('5', '')];
    const r = restoreBackup(dir, existing);
    expect([r.added, r.skipped, r.missingAudio]).toEqual([1, 1, 1]);
    expect(r.records.map((x) => x.id)).toEqual(['11', '10', '5']);
    expect(r.records[0].uri).toBe('doc/mallo/rec_11.m4a'); // 경로 재배치
    expect(mockStore.get('doc/mallo/rec_10.m4a')).toBe('already-here');
    expect(mockStore.get('doc/mallo/rec_10_a.m4a')).toBe('ten-a');
  });

  test('삭제하면 목록에서 사라진다', () => {
    const b = createBackup([rec('1', '')]);
    expect(listBackups()).toHaveLength(1);
    deleteBackup(b.uri);
    expect(listBackups()).toHaveLength(0);
  });
});
