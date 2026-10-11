// 전체 일정 조회 필터: 기간 프리셋 · 직접 선택(년/월/일) · 키워드
import { EMPTY_FILTER, describePeriod, filterRecords, isFilterActive, type RecordFilter } from '../filterRecords';
import type { ScheduleRecord } from '../storage';

const rec = (id: string, at: Date | null, content: string, appendText?: string): ScheduleRecord => ({
  id, uri: '', durationSec: 0, transcript: '', content,
  scheduleAt: at ? at.getTime() : null, scheduleDisplay: '', hasDate: at != null, hasTime: true, createdAt: 1,
  appends: appendText ? [{ id: 'a', uri: '', durationSec: 0, transcript: '', content: appendText, createdAt: 1 }] : undefined,
});

const now = new Date(2026, 9, 14, 12); // 2026-10-14 수
const records = [
  rec('today', new Date(2026, 9, 14, 15), '치과 예약'),
  rec('thisWeek', new Date(2026, 9, 17, 19), '친구들과 저녁'),
  rec('thisMonth', new Date(2026, 9, 3, 9), '회의'),
  rec('lastMonth', new Date(2026, 8, 20, 9), '병원 회의'),
  rec('nextYear', new Date(2027, 0, 5, 9), '신년회'),
  rec('undated', null, '언젠가 회의', '추가 메모 치과'),
];
const f = (patch: Partial<RecordFilter>): RecordFilter => ({ ...EMPTY_FILTER, ...patch });
const ids = (rs: ScheduleRecord[]) => rs.map((r) => r.id);

describe('기간 프리셋', () => {
  test('전체는 날짜 미정까지 모두', () => {
    expect(ids(filterRecords(records, EMPTY_FILTER, now))).toHaveLength(6);
  });
  test('오늘 / 이번 주(일~토) / 이번 달', () => {
    expect(ids(filterRecords(records, f({ preset: 'today' }), now))).toEqual(['today']);
    expect(ids(filterRecords(records, f({ preset: 'week' }), now))).toEqual(['today', 'thisWeek']);
    expect(ids(filterRecords(records, f({ preset: 'month' }), now))).toEqual(['today', 'thisWeek', 'thisMonth']);
  });
  test('기간 조건이 있으면 날짜 미정은 제외', () => {
    expect(ids(filterRecords(records, f({ preset: 'month' }), now))).not.toContain('undated');
  });
});

describe('직접 선택(년/월/일)', () => {
  test('년만, 월만, 일만, 조합', () => {
    expect(ids(filterRecords(records, f({ preset: 'custom', year: 2027 }), now))).toEqual(['nextYear']);
    expect(ids(filterRecords(records, f({ preset: 'custom', month: 9 }), now))).toEqual(['lastMonth']);
    expect(ids(filterRecords(records, f({ preset: 'custom', day: 3 }), now))).toEqual(['thisMonth']);
    expect(ids(filterRecords(records, f({ preset: 'custom', year: 2026, month: 10, day: 17 }), now))).toEqual(['thisWeek']);
  });
  test('전부 "전체"면 조건 없음과 같다', () => {
    expect(ids(filterRecords(records, f({ preset: 'custom' }), now))).toHaveLength(6);
    expect(isFilterActive(f({ preset: 'custom' }))).toBe(false);
  });
});

describe('키워드', () => {
  test('내용·전사·추가 메모를 모두 검색하고 기간과 AND로 결합', () => {
    expect(ids(filterRecords(records, f({ keyword: '회의' }), now))).toEqual(['thisMonth', 'lastMonth', 'undated']);
    expect(ids(filterRecords(records, f({ keyword: '치과' }), now))).toEqual(['today', 'undated']); // 추가 메모 매치
    expect(ids(filterRecords(records, f({ preset: 'month', keyword: '회의' }), now))).toEqual(['thisMonth']);
    expect(ids(filterRecords(records, f({ keyword: '  ' }), now))).toHaveLength(6);
  });
});

describe('isFilterActive / describePeriod', () => {
  test('활성 판정', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive(f({ preset: 'today' }))).toBe(true);
    expect(isFilterActive(f({ keyword: '회의' }))).toBe(true);
    expect(isFilterActive(f({ preset: 'custom', day: 3 }))).toBe(true);
  });
  test('칩 라벨', () => {
    expect(describePeriod(EMPTY_FILTER)).toBe('전체');
    expect(describePeriod(f({ preset: 'week' }))).toBe('이번 주');
    expect(describePeriod(f({ preset: 'custom', year: 2026, day: 15 }))).toBe('2026년 15일');
    expect(describePeriod(f({ preset: 'custom' }))).toBe('기간 선택');
  });
});
