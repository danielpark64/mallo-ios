import { carryDefaultDate, dropOutcome, isMovedAway, linkCarry, outcomeTag, setOutcome, syncCarryDate, unlinkDeleted } from '../outcome';
import type { ScheduleRecord } from '../storage';

const rec = (id: string, extra: Partial<ScheduleRecord> = {}): ScheduleRecord => ({
  id, uri: '', durationSec: 0, transcript: '', content: id,
  scheduleAt: new Date(2026, 9, 20, 15, 0).getTime(), scheduleDisplay: '', hasDate: true, hasTime: true,
  createdAt: 0, ...extra,
});

describe('지난 일정의 결과', () => {
  it('표시가 없으면 꼬리표도 없다(= 한 것)', () => {
    expect(outcomeTag(rec('a'))).toBe('');
  });

  it('못 했어요 → "못 함", 다시 잡은 날짜가 있으면 "→ 10월 25일"이 붙는다', () => {
    expect(outcomeTag(rec('a', { outcome: { kind: 'skipped' } }))).toBe('못 함');
    const at = new Date(2026, 9, 25, 15, 0).getTime();
    expect(outcomeTag(rec('a', { outcome: { kind: 'moved', nextId: 'b', nextAt: at } }))).toBe('바뀜 → 10월 25일');
  });

  it('같은 일정에만 표시하고, 지우면 다시 한 것이 된다', () => {
    const list = [rec('a'), rec('b')];
    const marked = setOutcome(list, 'a', 'partial');
    expect(marked[0].outcome).toEqual({ kind: 'partial' });
    expect(marked[1].outcome).toBeUndefined();
    expect(setOutcome(marked, 'a', null)[0].outcome).toBeUndefined();
  });

  it('종류만 바꾸면 다시 잡은 일정 연결은 남는다', () => {
    const list = [rec('a', { outcome: { kind: 'partial', nextId: 'b', nextAt: 1, nextHasTime: true } })];
    expect(setOutcome(list, 'a', 'moved')[0].outcome).toEqual({ kind: 'moved', nextId: 'b', nextAt: 1, nextHasTime: true });
    expect(setOutcome(list, 'a', 'skipped', false)[0].outcome).toEqual({ kind: 'skipped' });
  });

  it('다시 잡으면 원래 일정에 새 날짜가, 새 일정에 원래 일정이 이어진다', () => {
    const next = rec('b', { scheduleAt: new Date(2026, 9, 23, 15, 0).getTime() });
    const out = linkCarry([next, rec('a')], 'a', 'moved', next);
    expect(out.find((r) => r.id === 'a')!.outcome).toEqual({ kind: 'moved', nextId: 'b', nextAt: next.scheduleAt, nextHasTime: true });
    expect(out.find((r) => r.id === 'b')!.carriedFrom).toBe('a');
  });

  it('그사이 원래 일정이 지워졌으면 잇지 않는다', () => {
    const next = rec('b');
    expect(linkCarry([next], 'a', 'moved', next)).toEqual([next]);
  });

  it('다시 잡은 일정의 날짜를 고치면 원래 일정의 "→ 날짜"도 따라간다', () => {
    const newAt = new Date(2026, 9, 27, 9, 0).getTime();
    const list = [
      rec('a', { outcome: { kind: 'moved', nextId: 'b', nextAt: 1 } }),
      rec('b', { carriedFrom: 'a', scheduleAt: newAt }),
    ];
    expect(syncCarryDate(list, 'b')[0].outcome!.nextAt).toBe(newAt);
    expect(syncCarryDate(list, 'a')).toBe(list); // 원래 일정을 고친 건 상관없다
  });

  it('일정을 지우면 양쪽 연결이 끊기고 결과 표시는 남는다', () => {
    const list = [
      rec('a', { outcome: { kind: 'moved', nextId: 'b', nextAt: 1 } }),
      rec('c', { carriedFrom: 'x' }),
    ];
    expect(unlinkDeleted(list, 'b')[0].outcome).toEqual({ kind: 'moved' });
    expect(unlinkDeleted(list, 'x')[1].carriedFrom).toBeUndefined();
  });

  it('다시 잡는 기본 날짜는 내일, 원래 시각(시간 미정이면 9시)', () => {
    const now = new Date(2026, 9, 22, 20, 0);
    expect(carryDefaultDate(rec('a'), now)).toEqual(new Date(2026, 9, 23, 15, 0));
    expect(carryDefaultDate(rec('a', { hasTime: false }), now)).toEqual(new Date(2026, 9, 23, 9, 0));
  });

  it('아직 오지 않은 일정을 미루면 기본 날짜는 그 일정 다음 날', () => {
    const now = new Date(2026, 9, 18, 8, 0);
    expect(carryDefaultDate(rec('a'), now)).toEqual(new Date(2026, 9, 21, 15, 0));
  });

  it('바뀜(미룸)만 알람을 끈다', () => {
    expect(isMovedAway(rec('a', { outcome: { kind: 'moved' } }))).toBe(true);
    expect(isMovedAway(rec('a', { outcome: { kind: 'partial' } }))).toBe(false);
    expect(isMovedAway(rec('a'))).toBe(false);
  });
});

describe('dropOutcome', () => {
  it('표시를 지우면 다시 잡은 일정의 "← 원래 일정" 연결도 끊고, 일정 자체는 남긴다', () => {
    const list = [
      rec('a', { outcome: { kind: 'moved', nextId: 'b', nextAt: 1 } }),
      rec('b', { carriedFrom: 'a' }),
    ];
    const out = dropOutcome(list, 'a');
    expect(out[0].outcome).toBeUndefined();
    expect(out[1].carriedFrom).toBeUndefined();
    expect(out).toHaveLength(2);
  });
});
