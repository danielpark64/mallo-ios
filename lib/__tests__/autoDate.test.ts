// 날짜·시간 없이 녹음했을 때: 녹음을 시작한 날짜·시각 + needsDate 꼬리표, 알람 없음
import { recordedAtStamp } from '../autoDate';

test('녹음 시작 시각(분 단위)으로 저장하고 needsDate=true', () => {
  const r = recordedAtStamp(new Date(2026, 9, 14, 15, 12, 47));
  expect([r.date.getMonth(), r.date.getDate(), r.date.getHours(), r.date.getMinutes(), r.date.getSeconds()]).toEqual([9, 14, 15, 12, 0]);
  expect(r.hasDate).toBe(true);
  expect(r.hasTime).toBe(true);
  expect(r.needsDate).toBe(true);
  expect(r.display).toContain('10월 14일');
  expect(r.display).toContain('3:12');
});
