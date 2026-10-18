// 교대알람 → 세이람 근무표 가져오기(같은 폰, 인터넷 없이 앱끼리 URL로). 형식은 docs/shift-share-protocol.md
import { encodeShiftPayload, parseShiftImportUrl, shiftOn, SHIFT_REQUEST_URL } from '../shiftImport';

const sample = {
  from: '2026-10-18',
  labels: ['초번', '말번', '비번'],
  colors: ['#4F8EF7', '#F2994A', '#9AA0A6'],
  off: [false, false, true],
  // 18일부터: 초번 초번 말번 말번 비번 비번 (근무 없음) 초번
  days: [0, 0, 1, 1, 2, 2, -1, 0],
};

test('보낸 근무표를 그대로 읽는다', () => {
  const url = `mallo://import-shifts?v=1&p=${encodeShiftPayload(sample)}`;
  const got = parseShiftImportUrl(url)!;
  expect(got.from).toBe('2026-10-18');
  expect(got.labels).toEqual(['초번', '말번', '비번']);
  expect(got.days).toEqual(sample.days);
});

test('날짜별 근무: 범위 밖·근무 없는 날은 null', () => {
  const data = parseShiftImportUrl(`mallo://import-shifts?v=1&p=${encodeShiftPayload(sample)}`)!;
  expect(shiftOn(data, new Date(2026, 9, 18))).toEqual({ label: '초번', color: '#4F8EF7', off: false });
  expect(shiftOn(data, new Date(2026, 9, 22))?.label).toBe('비번');
  expect(shiftOn(data, new Date(2026, 9, 24))).toBeNull(); // -1
  expect(shiftOn(data, new Date(2026, 9, 17))).toBeNull(); // 범위 전
  expect(shiftOn(data, new Date(2026, 9, 26))).toBeNull(); // 범위 후
});

test('형식이 틀리면 null (다른 앱이 보낸 엉뚱한 주소 무시)', () => {
  expect(parseShiftImportUrl('mallo://import-shifts?v=2&p=xx')).toBeNull();
  expect(parseShiftImportUrl('mallo://something?v=1')).toBeNull();
  expect(parseShiftImportUrl('mallo://import-shifts?v=1&p=%7Bbroken')).toBeNull();
  const bad = encodeShiftPayload({ ...sample, days: [0, 9] }); // 없는 라벨 번호
  expect(parseShiftImportUrl(`mallo://import-shifts?v=1&p=${bad}`)).toBeNull();
});

test('요청 주소', () => {
  expect(SHIFT_REQUEST_URL).toBe('alarmapp://share-shifts?v=1&return=mallo');
});

// verify-fix 지적 반영: 잘못된 글자·없는 날짜는 통째로 거부, 배열은 라벨 수만큼, 보낸 시각(t)으로 옛 데이터 덮어쓰기 방지
import { isNewerThan } from '../shiftImport';
test('d에 잘못된 글자(대문자·이모지)가 있으면 거부', () => {
  const body = (d: string) => encodeURIComponent(JSON.stringify({ f: '2026-10-18', l: ['초번'], c: ['#4F8EF7'], o: [0], d }));
  expect(parseShiftImportUrl(`mallo://import-shifts?v=1&p=${body('0A0')}`)).toBeNull();
  expect(parseShiftImportUrl(`mallo://import-shifts?v=1&p=${body('0😀')}`)).toBeNull();
  expect(parseShiftImportUrl(`mallo://import-shifts?v=1&p=${body('0-0')}`)).not.toBeNull();
});
test('없는 날짜(13월 45일)는 거부, 색·쉬는 날 배열은 라벨 수만큼 자른다', () => {
  const p = (f: string, c: string[], o: number[]) =>
    `mallo://import-shifts?v=1&p=${encodeURIComponent(JSON.stringify({ f, l: ['초번'], c, o, d: '0' }))}`;
  expect(parseShiftImportUrl(p('2026-13-45', ['#4F8EF7'], [0]))).toBeNull();
  const got = parseShiftImportUrl(p('2026-10-18', Array(500).fill('#4F8EF7'), Array(500).fill(1)))!;
  expect(got.colors.length).toBe(1);
  expect(got.off.length).toBe(1);
});
test('보낸 시각 t: 저장된 것보다 새것만 받는다(같은 링크로 다시 열려도 옛 근무표가 덮어쓰지 않게)', () => {
  const u = (t: number) => `mallo://import-shifts?v=1&p=${encodeShiftPayload({ ...sample, sentAt: t })}`;
  const a = parseShiftImportUrl(u(1000))!;
  expect(a.sentAt).toBe(1000);
  expect(isNewerThan(a, null)).toBe(true);
  expect(isNewerThan(a, { ...a, sentAt: 1000 })).toBe(false);
  expect(isNewerThan(a, { ...a, sentAt: 2000 })).toBe(false);
  expect(isNewerThan(parseShiftImportUrl(u(3000))!, { ...a, sentAt: 2000 })).toBe(true);
});
