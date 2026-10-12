// 날짜·시간 없이 녹음했을 때: 오늘(시간 미정) + needsDate 꼬리표, 알람 없음
import { fallbackToToday } from '../autoDate';

test('오늘 자정 날짜, 시간 미정, needsDate=true', () => {
  const r = fallbackToToday(new Date(2026, 9, 12, 23, 40));
  expect([r.date.getFullYear(), r.date.getMonth(), r.date.getDate(), r.date.getHours()]).toEqual([2026, 9, 12, 0]);
  expect(r.hasDate).toBe(true);
  expect(r.hasTime).toBe(false);
  expect(r.needsDate).toBe(true);
  expect(r.display).toContain('10월 12일');
});
