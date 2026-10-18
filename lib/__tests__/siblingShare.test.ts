// 교대알람 자동 공유(v2): 두 앱만 깔려 있으면 버튼 없이. 한쪽 설정만 켜도 서로 보인다(2026-10-18 사용자 지시)
import { buildEventsPayload, shareEnabled, readSiblingShiftsFrom } from '../siblingShare';
import type { ScheduleRecord } from '../storage';

const rec = (id: string, at: Date, extra: Partial<ScheduleRecord> = {}): ScheduleRecord => ({
  id, uri: 'file:///x.m4a', durationSec: 3, transcript: '비밀 녹음 원문', content: `일정${id}`, scheduleAt: at.getTime(),
  scheduleDisplay: '', hasDate: true, hasTime: true, createdAt: 1, ...extra,
});

test('한쪽만 켜도 공유', () => {
  expect(shareEnabled(false, null)).toBe(false);
  expect(shareEnabled(true, null)).toBe(true);
  expect(shareEnabled(false, { share: true })).toBe(true);
  expect(shareEnabled(false, { share: false })).toBe(false);
});

test('내보내는 일정: 날짜·끝나는 날·시각·이름만(녹음 경로·원문은 내보내지 않음), 지난 한 달~앞으로 1년', () => {
  const now = new Date(2026, 9, 18, 12);
  const p = buildEventsPayload([
    rec('a', new Date(2026, 9, 20, 14, 30)),
    rec('b', new Date(2026, 9, 22), { hasTime: false, endAt: new Date(2026, 9, 26).getTime(), content: '가족 휴가' }),
    rec('old', new Date(2026, 7, 1, 9)),
    rec('far', new Date(2028, 0, 1, 9)),
    rec('undated', new Date(0), { scheduleAt: null }),
  ], now);
  const body = JSON.parse(p);
  expect(body.v).toBe(1);
  expect(body.e).toEqual([
    { d: '2026-10-20', h: 14 * 60 + 30, n: '일정a' },
    { d: '2026-10-22', e: '2026-10-26', n: '가족 휴가' },
  ]);
  expect(p).not.toContain('비밀 녹음 원문');
  expect(p).not.toContain('file://');
});

test('교대알람 창구에서 읽기: 공유가 꺼져 있으면 null, 켜져 있으면 근무표', async () => {
  const shifts = JSON.stringify({ f: '2026-10-18', l: ['초번'], c: ['#4F8EF7'], o: [0], d: '00', t: 5 });
  const read = (cfg: string | null) => (name: string) => (name === 'config' ? cfg : name === 'shifts' ? shifts : null);
  expect(await readSiblingShiftsFrom(read(null), false)).toBeNull(); // 교대알람 없음·양쪽 꺼짐
  expect(await readSiblingShiftsFrom(read(JSON.stringify({ share: false })), false)).toBeNull();
  expect((await readSiblingShiftsFrom(read(JSON.stringify({ share: true })), false))?.labels).toEqual(['초번']);
  expect((await readSiblingShiftsFrom(read(null), true))?.days).toEqual([0, 0]);
});

test('내용이 비어 있으면 녹음 원문 대신 •', () => {
  const p = buildEventsPayload([rec('x', new Date(2026, 9, 20, 9), { content: '' })], new Date(2026, 9, 18));
  expect(JSON.parse(p).e[0].n).toBe('•');
});
