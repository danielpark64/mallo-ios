// 서머타임이 있는 나라(9개 언어 출시)에서 하루가 23·25시간인 날에도 빈 날 계산이 하루 어긋나지 않아야 한다.
// (verify-fix 재현: 뉴욕 11/1~11/5 → 일정 있는 11/1이 빈 날로 들어갔다)
process.env.TZ = 'America/New_York';
import { emptyGapBetween } from '../dateUtils';

test('서머타임 끝나는 주(11/1 → 11/5): 11/2~11/4 · 3일', () => {
  const g = emptyGapBetween(new Date(2026, 10, 1), new Date(2026, 10, 5), new Date(2026, 9, 1));
  expect(g && [g.from.getDate(), g.to.getDate(), g.days]).toEqual([2, 4, 3]);
});
test('서머타임 시작하는 주(3/10 → 3/15): 3/11~3/14 · 4일', () => {
  const g = emptyGapBetween(new Date(2027, 2, 10), new Date(2027, 2, 15), new Date(2027, 2, 1));
  expect(g && [g.from.getDate(), g.to.getDate(), g.days]).toEqual([11, 14, 4]);
});
