// 일정 화면에서 날짜·알림을 고치거나 되돌릴 때 알람 두 경로를 다시 거는지 — lib/notifications.ts 진입점 호출을 본다
jest.mock('../notifications', () => ({
  cancelAlarmGroup: jest.fn(async () => {}),
  scheduleAlarm: jest.fn(async (id: string) => [`n-${id}`]),
}));
import { cancelAlarmGroup, scheduleAlarm } from '../notifications';
import { alarmTimeOf, rearmAlarms, rearmToRecord } from '../rearm';
import type { ScheduleRecord } from '../storage';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 22, 9, 0).getTime();
const rec: ScheduleRecord = {
  id: 'r1', uri: '', durationSec: 0, transcript: '', content: '회의',
  scheduleAt: NOW + DAY, scheduleDisplay: '', hasDate: true, hasTime: true,
  alarmMode: 'vibe', remindBefore: [30], exactAlarm: true, createdAt: 1, notifIds: ['old1'],
};

beforeEach(() => jest.clearAllMocks());

test('날짜를 바꾸면 옛 알람 묶음을 먼저 끄고 새 시각으로 다시 건다', async () => {
  const at = new Date(NOW + 2 * DAY);
  const ids = await rearmAlarms('r1', ['old1'], { content: '회의', at, alarmMode: 'sound', remindBefore: [60], exactAlarm: false });
  expect(cancelAlarmGroup).toHaveBeenCalledWith('r1', ['old1']);
  expect(scheduleAlarm).toHaveBeenCalledWith('r1', '회의', at, 'sound', expect.objectContaining({ remindBefore: [60], exactAlarm: false }));
  expect((cancelAlarmGroup as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((scheduleAlarm as jest.Mock).mock.invocationCallOrder[0]);
  expect(ids).toEqual(['n-r1']);
});

test('울릴 시각이 없으면(지난 시각·날짜 미정) 끄기만 한다', async () => {
  const ids = await rearmAlarms('r1', ['old1'], { content: '회의', at: null });
  expect(cancelAlarmGroup).toHaveBeenCalledTimes(1);
  expect(scheduleAlarm).not.toHaveBeenCalled();
  expect(ids).toBeUndefined();
});

test('되돌리기: 지금 알람을 끄고 바꾸기 전 값(모드·미리 알림·정각)으로 다시 건다', async () => {
  await rearmToRecord(rec, ['cur1'], NOW);
  expect(cancelAlarmGroup).toHaveBeenCalledWith('r1', ['cur1']);
  expect(scheduleAlarm).toHaveBeenCalledWith('r1', '회의', new Date(NOW + DAY), 'vibe', expect.objectContaining({ remindBefore: [30], exactAlarm: true }));
});

test('되돌린 값이 지난 일정·날짜 미정·시간 미정·미룸이면 다시 걸지 않는다', () => {
  expect(alarmTimeOf(rec, NOW)).toEqual(new Date(NOW + DAY));
  expect(alarmTimeOf({ ...rec, scheduleAt: NOW - 1 }, NOW)).toBeNull();
  expect(alarmTimeOf({ ...rec, needsDate: true }, NOW)).toBeNull();
  expect(alarmTimeOf({ ...rec, hasTime: false }, NOW)).toBeNull();
  expect(alarmTimeOf({ ...rec, outcome: { kind: 'moved', nextId: 'n', nextAt: NOW + 3 * DAY } }, NOW)).toBeNull();
});
