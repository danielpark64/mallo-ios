// 1.2.4 버그 30·31 재발 방지 — 재동기화가 "5분 후 다시"(스누즈)를 남길지, 결과 표시가 알람을 끄는지
import { baseOfRecordId, silencedByOutcome, snoozePlan, snoozeStillDue, willRearm } from '../snoozeKeep';
import { outcomeStopsAlarms } from '../outcome';
import type { ScheduleRecord } from '../storage';

const NOW = new Date(2026, 10, 25, 9, 3).getTime();
const rec = (id: string, minFromNow: number, extra: Partial<ScheduleRecord> = {}) =>
  ({ id, scheduleAt: NOW + minFromNow * 60_000, hasTime: true, ...extra }) as any;

describe('snoozePlan / snoozeStillDue (버그 31)', () => {
  const records = [
    rec('past', -3),                                          // 9:00에 울려 5분 후 다시를 누른 일정
    rec('done', -3, { outcome: { kind: 'skipped' } }),       // 결과를 표시한 일정
    rec('moved', -3, { outcome: { kind: 'moved', nextId: 'x' } }),
    rec('soon', 30),                                          // 앞으로 정각이 다시 걸리는 일정
    rec('nodate', -3, { needsDate: true }),
  ];
  const plan = snoozePlan(records, NOW);

  test('남길 일정 = 남아 있고 결과 표시가 없는 일정, 다시 걸리는 일정 = 앞으로의 정각', () => {
    expect(plan.keepBase).toEqual(['past', 'soon', 'nodate']);
    expect(plan.rearmBase).toEqual(['soon']);
  });
  test('지난 일정의 정각 스누즈는 남긴다 — 앱을 다시 열어도 사라지지 않음', () => {
    expect(snoozeStillDue('past', plan)).toBe(true);
  });
  test('지난 일정의 미리 알림 스누즈도 남긴다', () => {
    expect(snoozeStillDue('past#pre30', plan)).toBe(true);
  });
  test('앞으로 올 일정의 미리 알림 스누즈는 남긴다(정각은 아직 안 울렸다)', () => {
    expect(snoozeStillDue('soon#pre30', plan)).toBe(true);
  });
  test('앞으로 정각이 다시 걸리는 일정의 정각 스누즈는 지운다(새 정각 알람이 울린다)', () => {
    expect(snoozeStillDue('soon', plan)).toBe(false);
  });
  test('지운 일정의 스누즈는 지운다', () => {
    expect(snoozeStillDue('gone', plan)).toBe(false);
    expect(snoozeStillDue('gone#pre10', plan)).toBe(false);
  });
  test('결과를 표시한 일정·미룬 일정의 스누즈는 지운다(버그 30과 같은 기준)', () => {
    expect(snoozeStillDue('done', plan)).toBe(false);
    expect(snoozeStillDue('done#pre30', plan)).toBe(false);
    expect(snoozeStillDue('moved', plan)).toBe(false);
  });
  test('recordId가 비면 남기지 않는다', () => {
    expect(snoozeStillDue('', plan)).toBe(false);
  });
  test('willRearm은 resyncAlarms의 future 거르기와 같다', () => {
    expect(willRearm(rec('a', 1), NOW)).toBe(true);
    expect(willRearm(rec('a', 1, { hasTime: false }), NOW)).toBe(false);
    expect(willRearm(rec('a', 1, { needsDate: true }), NOW)).toBe(false);
    expect(willRearm(rec('a', 1, { outcome: { kind: 'moved' } }), NOW)).toBe(false);
    expect(willRearm(rec('a', 0), NOW)).toBe(false);
  });
  test('baseOfRecordId', () => {
    expect(baseOfRecordId('r1#pre30')).toBe('r1');
    expect(baseOfRecordId('r1')).toBe('r1');
  });
});

describe('결과 표시 (버그 30)', () => {
  test('결과가 있는 일정은 스누즈 응답에서 다시 걸지 않는다', () => {
    expect(silencedByOutcome({ outcome: { kind: 'skipped' } })).toBe(true);
    expect(silencedByOutcome({ outcome: { kind: 'partial' } })).toBe(true);
    expect(silencedByOutcome({ outcome: { kind: 'moved' } })).toBe(true);
    expect(silencedByOutcome({})).toBe(false);
    expect(silencedByOutcome(undefined)).toBe(false);
  });
  test('지난 일정에 표시하면 남은 알람을 정리한다', () => {
    expect(outcomeStopsAlarms(rec('a', -3), 'skipped', NOW)).toBe(true);
    expect(outcomeStopsAlarms(rec('a', -3), 'partial', NOW)).toBe(true);
  });
  test('미루기(moved)는 앞으로의 일정이어도 정리한다(새 일정 쪽에서만 울린다)', () => {
    expect(outcomeStopsAlarms(rec('a', 60), 'moved', NOW)).toBe(true);
  });
  test('아직 오지 않은 일정의 알람은 건드리지 않는다', () => {
    expect(outcomeStopsAlarms(rec('a', 60), 'skipped', NOW)).toBe(false);
  });
});
