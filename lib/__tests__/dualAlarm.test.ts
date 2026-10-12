// Android 이중 알람: Expo 예약과 네이티브 AlarmManager(modules/mallo-alarm)가
// 예약/취소/재스케줄 모두에서 함께 호출되는지 — 네이티브 모듈을 jest에서 목으로 대체해 검증
import { Platform } from 'react-native';

const mockNative = {
  schedule: jest.fn(),
  cancel: jest.fn(),
  cancelByRecordId: jest.fn(),
  cancelAll: jest.fn(),
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
    expect(nativeCalls[0].slice(3)).toEqual(['말로', '회의', true, true]);

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
    expect(mockNative.schedule.mock.calls[0].slice(5)).toEqual([true, false]);
    jest.clearAllMocks();
    await scheduleAlarm('r1', '회의', future(10), 'vibe');
    expect(mockNative.schedule.mock.calls[0].slice(5)).toEqual([false, true]);
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

describe('resyncAlarms — 전체 재스케줄', () => {
  test('Expo 전체 취소 + 네이티브 전체 취소 후, 미래 일정을 두 경로에 다시 건다', async () => {
    const now = Date.now();
    await resyncAlarms([
      { id: 'soon', content: 'c', transcript: '', scheduleAt: now + 600_000, hasTime: true },
      { id: 'past', content: 'c', transcript: '', scheduleAt: now - 1000, hasTime: true },
    ]);
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mockNative.cancelAll).toHaveBeenCalledTimes(1);
    expect(mockNative.schedule.mock.calls.map((c) => c[0])).toEqual(['mallo_soon_0', 'mallo_soon_1', 'mallo_soon_2']);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    // 취소가 예약보다 먼저
    const cancelOrder = mockNative.cancelAll.mock.invocationCallOrder[0];
    const firstSchedule = mockNative.schedule.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(firstSchedule);
  });
});

describe('미리 알림 — 네이티브·Expo 두 경로, 정각과 독립', () => {
  beforeEach(() => { Platform.OS = 'android'; mockNativeAvailable = true; });
  test('30분 전은 recordId "r1#pre30"으로 네이티브(정각 T-30분)와 Expo(+유예)에 걸리고, 정각 3슬롯은 "r1"', async () => {
    const at = future(120);
    const ids = await scheduleAlarm('r1', '치과', at, 'both', { remindBefore: [30] });
    expect(ids).toEqual(['mallo_r1_pre30', 'mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);
    const n = mockNative.schedule.mock.calls;
    expect(n[0].slice(0, 5)).toEqual(['mallo_r1_pre30', 'r1#pre30', at.getTime() - 30 * 60_000, '말로 · 미리 알림', '30분 뒤 · 치과']);
    expect(n[1][1]).toBe('r1');
    const expoPre = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect((expoPre.trigger as any).date.getTime()).toBe(at.getTime() - 30 * 60_000 + EXPO_FALLBACK_GRACE_MS);
  });
  test('하루 전은 전날 20:00에 네이티브 예약', async () => {
    const at = new Date(Date.now() + 3 * 86_400_000);
    await scheduleAlarm('r1', '치과', at, 'vibe', { remindBefore: [1440], exactAlarm: false });
    const t = new Date(mockNative.schedule.mock.calls[0][2]);
    expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([new Date(at.getTime() - 86_400_000).getDate(), 20, 0]);
    expect(mockNative.schedule).toHaveBeenCalledTimes(1); // 정각 꺼짐 → pre만
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
