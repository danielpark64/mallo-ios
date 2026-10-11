// 단어칩 범위선택 순수 로직: 좌표→칩 매핑, 범위 정규화/확장, 재생 중 단어 판정
import { activeSegmentIndex, extendRange, findChipAt, hasUsableTimestamps, normalizeRange, rangeText, synthesizeSegmentTimes } from '../wordRange';

// 두 줄 배치: 0,1,2번은 첫 줄(y=0), 3,4번은 둘째 줄(y=30)
const layouts = [
  { x: 0, y: 0, width: 40, height: 25 },
  { x: 44, y: 0, width: 50, height: 25 },
  { x: 98, y: 0, width: 30, height: 25 },
  { x: 0, y: 30, width: 60, height: 25 },
  { x: 64, y: 30, width: 40, height: 25 },
];

describe('findChipAt', () => {
  test('칩 안을 누르면 그 칩', () => {
    expect(findChipAt(layouts, 50, 10)).toBe(1);
    expect(findChipAt(layouts, 70, 40)).toBe(4);
  });
  test('같은 줄 칩 사이 여백이면 가장 가까운 칩', () => {
    expect(findChipAt(layouts, 41, 10)).toBe(0); // 0번 오른쪽 끝에서 1px
    expect(findChipAt(layouts, 43, 10)).toBe(1); // 1번 왼쪽 끝에서 1px
  });
  test('줄 오른쪽 바깥으로 끌면 그 줄의 마지막 칩', () => {
    expect(findChipAt(layouts, 300, 10)).toBe(2);
    expect(findChipAt(layouts, 300, 45)).toBe(4);
  });
  test('어느 줄에도 걸치지 않으면 null', () => {
    expect(findChipAt(layouts, 10, 100)).toBeNull();
    expect(findChipAt([], 10, 10)).toBeNull();
  });
  test('아직 onLayout이 안 온 칩(undefined)은 무시', () => {
    expect(findChipAt([undefined, layouts[1]], 50, 10)).toBe(1);
  });
});

describe('normalizeRange / extendRange', () => {
  test('역순으로 끌어도 start ≤ end', () => {
    expect(normalizeRange(3, 1)).toEqual({ start: 1, end: 3 });
    expect(normalizeRange(2, 2)).toEqual({ start: 2, end: 2 });
  });
  test('범위 밖 단어 탭 → 그쪽으로 확장, 안쪽 탭 → 그대로', () => {
    const r = { start: 1, end: 2 };
    expect(extendRange(r, 4)).toEqual({ start: 1, end: 4 });
    expect(extendRange(r, 0)).toEqual({ start: 0, end: 2 });
    expect(extendRange(r, 2)).toBe(r);
  });
});

const segs = [
  { segment: '내일', startTimeMillis: 0, endTimeMillis: 500 },
  { segment: '오후', startTimeMillis: 600, endTimeMillis: 1000 },
  { segment: '세시', startTimeMillis: 1100, endTimeMillis: 1600 },
];

describe('rangeText / activeSegmentIndex', () => {
  test('범위 미리보기 문자열', () => {
    expect(rangeText(segs, { start: 1, end: 2 })).toBe('오후 세시');
  });
  test('단어 사이 공백(500~600ms)에서도 직전 단어가 활성으로 유지된다', () => {
    expect(activeSegmentIndex(segs, 550)).toBe(0);
    expect(activeSegmentIndex(segs, 1200)).toBe(2);
  });
  test('첫 단어 시작 전이면 -1', () => {
    expect(activeSegmentIndex([{ ...segs[0], startTimeMillis: 100 }], 50)).toBe(-1);
  });
});

describe('hasUsableTimestamps / synthesizeSegmentTimes', () => {
  const degenerate = [
    { segment: '오늘', startTimeMillis: 303, endTimeMillis: 303 },
    { segment: '8', startTimeMillis: 303, endTimeMillis: 303 },
    { segment: '시', startTimeMillis: 303, endTimeMillis: 303 },
    { segment: '반에', startTimeMillis: 303, endTimeMillis: 303 },
  ];
  test('모든 단어가 같은 시각·길이 0이면(iOS가 단어 시각을 안 준 녹음) 쓸 수 없다고 판정', () => {
    expect(hasUsableTimestamps(degenerate)).toBe(false);
    expect(hasUsableTimestamps([])).toBe(false);
  });
  test('길이가 양수인 단어가 절반 이상이면 쓸 만하다', () => {
    expect(hasUsableTimestamps(segs)).toBe(true);
    expect(hasUsableTimestamps([segs[0], degenerate[0]])).toBe(true);
    expect(hasUsableTimestamps([segs[0], degenerate[0], degenerate[1]])).toBe(false);
  });
  test('글자 수 비례로 구간을 배분한다 (오늘2·8·시·반에2 = 6글자, 0~6000ms)', () => {
    const out = synthesizeSegmentTimes(degenerate, 0, 6000);
    expect(out.map((s) => [s.startTimeMillis, s.endTimeMillis])).toEqual([
      [0, 2000], [2000, 3000], [3000, 4000], [4000, 6000],
    ]);
    expect(out[0].segment).toBe('오늘');
  });
  test('시작 시각이 0이 아니어도 이어서 배분되고, 공백은 글자 수에서 뺀다', () => {
    const out = synthesizeSegmentTimes([{ segment: '알려 줘', startTimeMillis: 0, endTimeMillis: 0 }, degenerate[1]], 1000, 4000);
    expect(out.map((s) => [s.startTimeMillis, s.endTimeMillis])).toEqual([[1000, 3250], [3250, 4000]]); // 알려줘(3)·8(1) = 3:1
  });
});
