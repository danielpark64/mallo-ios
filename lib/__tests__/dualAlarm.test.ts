// Android 이중 알람: Expo 예약과 네이티브 AlarmManager(modules/mallo-alarm)가
// 예약/취소/재스케줄 모두에서 함께 호출되는지 — 네이티브 모듈을 jest에서 목으로 대체해 검증
import { Platform } from 'react-native';

const mockNative = {
  schedule: jest.fn(),
  cancel: jest.fn(),
  cancelByRecordId: jest.fn(),
  cancelAll: jest.fn(),
  cancelAllKeepSnooze: jest.fn(),
  stopRinging: jest.fn(),
  getRingingRecordId: jest.fn(() => null),
  canScheduleExact: jest.fn(() => true),
  openExactAlarmSettings: jest.fn(),
  listScheduled: jest.fn(() => []),
};
// 테스트별로 "모듈 없음(iOS/미빌드)" 상황을 흉내 낼 수 있게 스위치를 둔다
let mockNativeAvailable = true;

jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: (name: string) =>
    name === 'MalloAlarm' && mockNativeAvailable ? mockNative : null,
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async ({ identifier }: { identifier: string }) => identifier),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { MAX: 7 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidAudioUsage: { ALARM: 4 },
}));

import * as Notifications from 'expo-notifications';
import { EXPO_FALLBACK_GRACE_MS, isNativeAlarmAvailable } from '../nativeAlarm';
import { cancelAlarm, cancelAlarmByRecordId, cancelAlarmGroup, resyncAlarms, scheduleAlarm } from '../notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const future = (min: number) => new Date(Date.now() + min * 60_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeAvailable = true;
  jest.replaceProperty(Platform, 'OS', 'android');
});

describe('네이티브 모듈 가용성', () => {
  test('iOS에서는 네이티브 모듈이 있어도 쓰지 않는다', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(isNativeAlarmAvailable()).toBe(false);
  });
  test('Android인데 모듈이 없으면(미빌드) false', () => {
    mockNativeAvailable = false;
    expect(isNativeAlarmAvailable()).toBe(false);
  });
  test('Android + 모듈 있음 → true', () => {
    expect(isNativeAlarmAvailable()).toBe(true);
  });
});

describe('scheduleAlarm — 두 경로 모두 예약', () => {
  test('슬롯 3개를 같은 키로 네이티브(정확, T)와 Expo(보조, T+유예)에 함께 건다', async () => {
    const at = future(10);
    const ids = await scheduleAlarm('r1', '회의', at, 'both');
    expect(ids).toEqual(['mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);

    expect(mockNative.schedule).toHaveBeenCalledTimes(3);
    const nativeCalls = mockNative.schedule.mock.calls;
    expect(nativeCalls.map((c) => c[0])).toEqual(['mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);
    expect(nativeCalls.map((c) => c[1])).toEqual(['r1', 'r1', 'r1']);
    expect(nativeCalls.map((c) => c[2] - at.getTime())).toEqual([0, 60_000, 120_000]);
    expect(nativeCalls[0].slice(3)).toEqual(['세이람', '회의', true, true, { tone: 'default', eventAtMs: at.getTime(), leadMin: 0, content: '회의', snoozed: false }]);
    // 울림 카드(1.2.3): +1·+2분 재알림도 일정 시각은 정각 그대로, 정각 알림(leadMin 0)
    expect(nativeCalls.map((c) => [c[7].eventAtMs, c[7].leadMin])).toEqual([[at.getTime(), 0], [at.getTime(), 0], [at.getTime(), 0]]);

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    const expoOffsets = mocked.scheduleNotificationAsync.mock.calls.map(
      (c) => (c[0].trigger as any).date.getTime() - at.getTime()
    );
    expect(expoOffsets).toEqual([
      EXPO_FALLBACK_GRACE_MS,
      60_000 + EXPO_FALLBACK_GRACE_MS,
      120_000 + EXPO_FALLBACK_GRACE_MS,
    ]);
  });

  test('모드 → 네이티브 soundOn/vibOn 매핑: sound=소리만, vibe=진동만', async () => {
    await scheduleAlarm('r1', '회의', future(10), 'sound');
    expect(mockNative.schedule.mock.calls[0].slice(5, 7)).toEqual([true, false]);
    jest.clearAllMocks();
    await scheduleAlarm('r1', '회의', future(10), 'vibe');
    expect(mockNative.schedule.mock.calls[0].slice(5, 7)).toEqual([false, true]);
  });

  test('네이티브가 없으면 Expo만, 유예 없이 정시에 건다', async () => {
    mockNativeAvailable = false;
    const at = future(10);
    await scheduleAlarm('r1', '회의', at);
    expect(mockNative.schedule).not.toHaveBeenCalled();
    const expoOffsets = mocked.scheduleNotificationAsync.mock.calls.map(
      (c) => (c[0].trigger as any).date.getTime() - at.getTime()
    );
    expect(expoOffsets).toEqual([0, 60_000, 120_000]);
  });

  test('네이티브 예약이 예외를 던져도 Expo 예약은 정시에 진행된다', async () => {
    mockNative.schedule.mockImplementation(() => { throw new Error('boom'); });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const at = future(10);
    const ids = await scheduleAlarm('r1', '회의', at);
    expect(ids).toHaveLength(3);
    expect((mocked.scheduleNotificationAsync.mock.calls[0][0].trigger as any).date.getTime()).toBe(at.getTime());
    warn.mockRestore();
    mockNative.schedule.mockReset();
  });

  test('지난 시각이면 어느 경로도 호출하지 않는다', async () => {
    await scheduleAlarm('r1', '회의', new Date(Date.now() - 1000));
    expect(mockNative.schedule).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('취소 — 두 경로 모두', () => {
  test('cancelAlarm(ids): Expo 식별자 취소 + 네이티브 같은 키 취소', async () => {
    await cancelAlarm(['mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);
    expect(mockNative.cancel).toHaveBeenCalledWith(['mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
  });

  test('cancelAlarmByRecordId: 네이티브 recordId 취소 + Expo 해당 예약만 취소', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'mallo_a_0', content: { data: { recordId: 'a' } } },
      { identifier: 'mallo_b_0', content: { data: { recordId: 'b' } } },
    ] as any);
    await cancelAlarmByRecordId('a');
    expect(mockNative.cancelByRecordId).toHaveBeenCalledWith('a');
    expect(mocked.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0])).toEqual(['mallo_a_0']);
  });

  test('iOS에서는 네이티브 취소를 부르지 않는다', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await cancelAlarm(['mallo_r1_0']);
    await cancelAlarmByRecordId('r1');
    expect(mockNative.cancel).not.toHaveBeenCalled();
    expect(mockNative.cancelByRecordId).not.toHaveBeenCalled();
  });
});

describe('resyncAlarms — 전체 재스케줄(스누즈는 남김, 1.2.4 버그 31)', () => {
  test('목록을 읽은 뒤에 걸린 예약(앱 시작과 동시에 건 스누즈)은 지우지 않는다', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'mallo_old_0', content: { data: { recordId: 'old' } } },
    ] as any);
    await resyncAlarms([]);
    expect(mocked.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(mocked.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0])).toEqual(['mallo_old_0']);
  });
  test('목록을 못 읽으면 예전처럼 전부 지운다', async () => {
    mocked.getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error('x'));
    await resyncAlarms([]);
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });
  test('Expo 전체 취소 + 네이티브는 스누즈만 남기고 비운 뒤, 미래 일정을 두 경로에 다시 건다', async () => {
    const now = Date.now();
    await resyncAlarms([
      { id: 'soon', content: 'c', transcript: '', scheduleAt: now + 600_000, hasTime: true },
      { id: 'past', content: 'c', transcript: '', scheduleAt: now - 1000, hasTime: true },
    ]);
    expect(mocked.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled(); // 전체 취소는 그 뒤 걸린 스누즈까지 지우므로 쓰지 않는다
    // 네이티브: 원장 통째 비우기(cancelAll) 대신, 남아 있는 일정의 스누즈(_z*·snoozed)는 남기는 취소
    expect(mockNative.cancelAll).not.toHaveBeenCalled();
    expect(mockNative.cancelAllKeepSnooze).toHaveBeenCalledWith(['soon', 'past'], ['soon']);
    // 지난 일정(past)의 정각은 다시 걸지 않는다 — 그 일정에 걸려 있던 스누즈는 위에서 남겼다
    expect(mockNative.schedule.mock.calls.map((c) => c[0])).toEqual(['mallo_soon_0', 'mallo_soon_1', 'mallo_soon_2']);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    // 취소가 예약보다 먼저
    const cancelOrder = mockNative.cancelAllKeepSnooze.mock.invocationCallOrder[0];
    const firstSchedule = mockNative.schedule.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(firstSchedule);
  });

  test('Expo: 남아 있는 일정의 스누즈 알림(data.snooze)은 남기고, 지운 일정·결과 표시 일정·일반 알림은 지운다', async () => {
    const now = Date.now();
    mocked.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'mallo_past_0', content: { data: { recordId: 'past', slotOffset: 0, snooze: true } } },
      { identifier: 'mallo_past#pre30_0', content: { data: { recordId: 'past#pre30', slotOffset: 0, snooze: true } } },
      { identifier: 'mallo_gone_0', content: { data: { recordId: 'gone', slotOffset: 0, snooze: true } } },
      { identifier: 'mallo_done_0', content: { data: { recordId: 'done', slotOffset: 0, snooze: true } } },
      { identifier: 'mallo_soon_0', content: { data: { recordId: 'soon', slotOffset: 0, snooze: true } } },
      { identifier: 'mallo_soon_pre10', content: { data: { recordId: 'soon#pre10', pre: 10 } } },
    ] as any);
    await resyncAlarms([
      { id: 'soon', content: 'c', transcript: '', scheduleAt: now + 600_000, hasTime: true },
      { id: 'past', content: 'c', transcript: '', scheduleAt: now - 60_000, hasTime: true },
      { id: 'done', content: 'c', transcript: '', scheduleAt: now - 60_000, hasTime: true, outcome: { kind: 'skipped' } },
    ]);
    expect(mocked.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(mocked.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0]).sort()).toEqual(
      ['mallo_done_0', 'mallo_gone_0', 'mallo_soon_0', 'mallo_soon_pre10'].sort()
    );
    // 결과 표시 일정은 남길 일정에서 빠진다(네이티브도 같은 규칙)
    expect(mockNative.cancelAllKeepSnooze).toHaveBeenCalledWith(['soon', 'past'], ['soon']);
  });

  test('옛 네이티브(cancelAllKeepSnooze 없음)면 예전처럼 원장을 통째로 비운다', async () => {
    const saved = mockNative.cancelAllKeepSnooze;
    delete (mockNative as any).cancelAllKeepSnooze;
    try {
      await resyncAlarms([]);
      expect(mockNative.cancelAll).toHaveBeenCalledTimes(1);
    } finally {
      (mockNative as any).cancelAllKeepSnooze = saved;
    }
  });
});

test('5분 후 다시(snoozeOf)로 건 Expo 알림에는 data.snooze 표시가 붙고, 일반 알람에는 없다', async () => {
  await scheduleAlarm('r1', '회의', future(5), 'both', { snoozeOf: { eventAt: future(-3), leadMin: 0 } });
  expect(mocked.scheduleNotificationAsync.mock.calls.map((c) => (c[0].content.data as any).snooze)).toEqual([true, true, true]);
  mocked.scheduleNotificationAsync.mockClear();
  await scheduleAlarm('r1', '회의', future(5), 'both');
  expect(mocked.scheduleNotificationAsync.mock.calls.map((c) => (c[0].content.data as any).snooze)).toEqual([undefined, undefined, undefined]);
});

test('결과 표시(버그 30): cancelAlarmGroup이 네이티브 스누즈 슬롯(recordId 단위)과 미리 알림 스누즈까지 정리한다', async () => {
  await cancelAlarmGroup('r1', ['mallo_r1_0']);
  const ids = mockNative.cancelByRecordId.mock.calls.map((c) => c[0]);
  expect(ids).toContain('r1');          // 원장의 _z* 스누즈 항목도 recordId가 r1이라 함께 내려간다
  expect(ids).toContain('r1#pre30');    // 미리 알림을 5분 후로 미룬 것
});

test('JS 쪽 5분 후(snoozeOf): 원래 일정 시각·몇 분 전과 snoozed를 넘겨 카드에 "다시 알림"', async () => {
  const orig = future(-3);
  const at = future(5);
  await scheduleAlarm('r1#pre30', '치과', at, 'both', { single: true, snoozeOf: { eventAt: orig, leadMin: 30 } });
  expect(mockNative.schedule.mock.calls[0][7]).toEqual({ tone: 'default', eventAtMs: orig.getTime(), leadMin: 30, content: '치과', snoozed: true });
  mockNative.schedule.mockClear();
  await scheduleAlarm('r2', '회의', at, 'both', { single: true, snoozeOf: { eventAt: null, leadMin: 0 } });
  expect(mockNative.schedule.mock.calls[0][7]).toMatchObject({ eventAtMs: 0, snoozed: true }); // 일정 시각 모름 → 띠 없이
});

describe('미리 알림 — 네이티브·Expo 두 경로, 정각과 독립', () => {
  beforeEach(() => { Platform.OS = 'android'; mockNativeAvailable = true; });
  test('30분 전은 recordId "r1#pre30"으로 네이티브(정각 T-30분)와 Expo(+유예)에 걸리고, 정각 3슬롯은 "r1"', async () => {
    const at = future(120);
    const ids = await scheduleAlarm('r1', '치과', at, 'both', { remindBefore: [30] });
    expect(ids).toEqual(['mallo_r1_pre30', 'mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);
    const n = mockNative.schedule.mock.calls;
    expect(n[0].slice(0, 5)).toEqual(['mallo_r1_pre30', 'r1#pre30', at.getTime() - 30 * 60_000, '세이람 · 미리 알림', '30분 뒤 · 치과']);
    expect(n[1][1]).toBe('r1');
    // 울림 카드(1.2.3): 미리 알림은 일정 시각·30분·내용 원문(본문의 "30분 뒤 · " 없이)을 넘긴다
    expect(n[0][7]).toEqual({ tone: 'default', eventAtMs: at.getTime(), leadMin: 30, content: '치과', snoozed: false });
    const expoPre = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect((expoPre.trigger as any).date.getTime()).toBe(at.getTime() - 30 * 60_000 + EXPO_FALLBACK_GRACE_MS);
  });
  test('하루 전은 전날 20:00에 네이티브 예약', async () => {
    const at = new Date(Date.now() + 3 * 86_400_000);
    await scheduleAlarm('r1', '치과', at, 'vibe', { remindBefore: [1440], exactAlarm: false });
    const t = new Date(mockNative.schedule.mock.calls[0][2]);
    expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([new Date(at.getTime() - 86_400_000).getDate(), 20, 0]);
    expect(mockNative.schedule).toHaveBeenCalledTimes(1); // 정각 꺼짐 → pre만
    // 하루 전 알림은 전날 20:00에 울려도 카드에는 일정 시각을 보여 주도록 eventAt을 따로 넘긴다
    expect(mockNative.schedule.mock.calls[0][7]).toMatchObject({ eventAtMs: at.getTime(), leadMin: 1440 });
  });
  test('네이티브가 없으면(iOS) 미리 알림도 Expo 단일 경로·정시', async () => {
    Platform.OS = 'ios'; mockNativeAvailable = false;
    const at = future(120);
    await scheduleAlarm('r1', '치과', at, 'both', { remindBefore: [30] });
    expect(mockNative.schedule).not.toHaveBeenCalled();
    expect((mocked.scheduleNotificationAsync.mock.calls[0][0].trigger as any).date.getTime()).toBe(at.getTime() - 30 * 60_000);
  });
  test('미리 알림 끄기는 "r1#pre30"만 취소하고 정각 "r1"은 남긴다', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'mallo_r1_pre30', content: { data: { recordId: 'r1#pre30' } } },
      { identifier: 'mallo_r1_0', content: { data: { recordId: 'r1' } } },
    ] as any);
    await cancelAlarmByRecordId('r1#pre30');
    expect(mockNative.cancelByRecordId).toHaveBeenCalledWith('r1#pre30');
    expect(mocked.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0])).toEqual(['mallo_r1_pre30']);
  });
  test('cancelAlarmGroup: 저장된 식별자 + 정각 + 미리 알림 4종을 recordId 단위로 모두 정리', async () => {
    await cancelAlarmGroup('r1', ['mallo_r1_pre30', 'mallo_r1_0']);
    expect(mockNative.cancel).toHaveBeenCalledWith(['mallo_r1_pre30', 'mallo_r1_0']);
    expect(mockNative.cancelByRecordId.mock.calls.map((c) => c[0])).toEqual(['r1', 'r1#pre10', 'r1#pre30', 'r1#pre60', 'r1#pre1440']);
  });
});
