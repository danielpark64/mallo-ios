// 새 달력(연속 스크롤 한 달 보기)의 칸 배치 계산: 주 나누기, 기간 막대 줄(lane) 배치, 하루짜리 일정 묶기
import { monthWeeks, weekBars, singleDayIndex, type CalEvent } from '../calendarKit/monthLayout';

const d = (m: number, day: number) => new Date(2026, m - 1, day);

test('2026년 10월은 1일이 목요일 → 첫 주 앞 4칸 비고, 5주', () => {
  const w = monthWeeks(2026, 9);
  expect(w.length).toBe(5);
  expect(w[0].slice(0, 4)).toEqual([null, null, null, null]);
  expect(w[0][4]?.getDate()).toBe(1);
  expect(w[4][6]?.getDate()).toBe(31);
});

test('기간 막대: 주 안에서 시작·끝 칸, 주를 넘으면 잘라서 양쪽에 이어짐 표시', () => {
  const vac: CalEvent = { id: 'v', title: '가족 휴가', start: d(10, 22), end: d(10, 26) };
  const weeks = monthWeeks(2026, 9);
  const w4 = weekBars([vac], weeks[3]); // 18~24일 주
  expect(w4).toEqual([{ id: 'v', title: '가족 휴가', startCol: 4, endCol: 6, lane: 0, fromPrev: false, toNext: true }]);
  const w5 = weekBars([vac], weeks[4]); // 25~31일 주
  expect(w5).toEqual([{ id: 'v', title: '가족 휴가', startCol: 0, endCol: 1, lane: 0, fromPrev: true, toNext: false }]);
});

test('겹치는 기간 막대는 다른 줄로', () => {
  const a: CalEvent = { id: 'a', title: 'A', start: d(10, 19), end: d(10, 22) };
  const b: CalEvent = { id: 'b', title: 'B', start: d(10, 21), end: d(10, 23) };
  const c: CalEvent = { id: 'c', title: 'C', start: d(10, 23), end: d(10, 24) };
  const bars = weekBars([a, b, c], monthWeeks(2026, 9)[3]);
  const lane = Object.fromEntries(bars.map((x) => [x.id, x.lane]));
  expect(lane).toEqual({ a: 0, b: 1, c: 0 }); // C는 A가 끝난 뒤라 0번 줄 재사용
});

test('하루짜리 일정은 날짜별로, 시간순', () => {
  const ev: CalEvent[] = [
    { id: '2', title: '치과', start: d(10, 21), end: d(10, 21), time: 16 * 60 },
    { id: '1', title: '무릎', start: d(10, 21), end: d(10, 21), time: 11 * 60 },
    { id: 'v', title: '휴가', start: d(10, 22), end: d(10, 26) },
  ];
  const idx = singleDayIndex(ev);
  expect(idx.get('2026-10-21')?.map((e) => e.id)).toEqual(['1', '2']);
  expect(idx.has('2026-10-22')).toBe(false); // 기간 일정은 막대로만
});

// ── 확대·축소(두 손가락·달 제목 두 번 탭): 작게(점) / 보통 / 크게 ──
import { densityAfterPinch, densityAfterDoubleTap, cellMetrics } from '../calendarKit/monthLayout';
describe('달력 확대·축소', () => {
  test('벌리면 한 단계 크게, 오므리면 한 단계 작게, 조금 움직인 건 무시', () => {
    expect(densityAfterPinch(1, 100, 160)).toBe(2);
    expect(densityAfterPinch(1, 160, 100)).toBe(0);
    expect(densityAfterPinch(1, 100, 110)).toBe(1);
    expect(densityAfterPinch(2, 100, 200)).toBe(2); // 끝에서 멈춤
    expect(densityAfterPinch(0, 200, 100)).toBe(0);
  });
  test('두 번 탭: 작게→보통→크게→보통…(크게에서 누르면 보통으로)', () => {
    expect(densityAfterDoubleTap(0)).toBe(1);
    expect(densityAfterDoubleTap(1)).toBe(2);
    expect(densityAfterDoubleTap(2)).toBe(1);
  });
  test('칸 높이: 작게 < 보통 < 크게, 글자 배율을 곱한다, 작게는 이름 없이 점', () => {
    const [a, b, c] = [0, 1, 2].map((d) => cellMetrics(d as 0 | 1 | 2, 1));
    expect(a.cellH).toBeLessThan(b.cellH);
    expect(b.cellH).toBeLessThan(c.cellH);
    expect(a.showNames).toBe(false);
    expect(b.showNames).toBe(true);
    expect(cellMetrics(1, 1.3).cellH).toBeGreaterThan(b.cellH);
  });
});
