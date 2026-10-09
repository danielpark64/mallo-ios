// 알람 예약/취소/Android 채널 — expo-notifications를 목으로 대체
import { Platform } from 'react-native';

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
import {
  cancelAlarmByRecordId,
  registerAndroidChannels,
  resyncAlarms,
  scheduleAlarm,
} from '../notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const future = (min: number) => new Date(Date.now() + min * 60_000);

beforeEach(() => jest.clearAllMocks());

describe('registerAndroidChannels', () => {
  test('iOS에서는 채널을 만들지 않는다', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await registerAndroidChannels();
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  test('Android에서는 모드별 채널 3개: 소리+진동 / 소리 / 진동', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await registerAndroidChannels();
    const calls = mocked.setNotificationChannelAsync.mock.calls;
    expect(calls.map((c) => c[0])).toEqual(['alarm_both', 'alarm_sound', 'alarm_vibe']);
    const byId = Object.fromEntries(calls.map((c) => [c[0], c[1]]));
    expect(byId.alarm_both).toMatchObject({ sound: 'alarm_long.wav', enableVibrate: true, importance: 7 });
    expect(byId.alarm_sound).toMatchObject({ sound: 'alarm_long.wav', enableVibrate: false });
    expect(byId.alarm_vibe).toMatchObject({ sound: null, enableVibrate: true });
  });
});

describe('scheduleAlarm', () => {
  test('이미 지난 시각이면 예약하지 않고 빈 배열', async () => {
    const ids = await scheduleAlarm('r1', '회의', new Date(Date.now() - 1000));
    expect(ids).toEqual([]);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('메인 + 1분 + 2분 슬롯 3개를 결정적 식별자로 예약한다', async () => {
    const at = future(10);
    const ids = await scheduleAlarm('r1', '회의', at, 'both');
    expect(ids).toEqual(['mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);
    const dates = mocked.scheduleNotificationAsync.mock.calls.map(
      (c) => (c[0].trigger as any).date.getTime() - at.getTime()
    );
    expect(dates).toEqual([0, 60_000, 120_000]);
  });

  test('모드에 따라 소리 유무와 Android 채널이 달라진다', async () => {
    await scheduleAlarm('r1', '회의', future(10), 'vibe');
    const vibe = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(vibe.content.sound).toBeUndefined();
    expect((vibe.trigger as any).channelId).toBe('alarm_vibe');

    jest.clearAllMocks();
    await scheduleAlarm('r1', '회의', future(10), 'sound');
    const sound = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(sound.content.sound).toBe('alarm_long.wav');
    expect((sound.trigger as any).channelId).toBe('alarm_sound');
  });
});

describe('cancelAlarmByRecordId', () => {
  test('해당 recordId의 예약만 취소한다', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'mallo_a_0', content: { data: { recordId: 'a' } } },
      { identifier: 'mallo_a_1', content: { data: { recordId: 'a' } } },
      { identifier: 'mallo_b_0', content: { data: { recordId: 'b' } } },
    ] as any);
    await cancelAlarmByRecordId('a');
    const cancelled = mocked.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0]);
    expect(cancelled.sort()).toEqual(['mallo_a_0', 'mallo_a_1']);
  });
});

describe('resyncAlarms', () => {
  const base = { transcript: '', hasTime: true as const };
  test('전부 취소 후, 시간 있는 미래 일정만 가까운 순으로 재등록', async () => {
    const now = Date.now();
    await resyncAlarms([
      { id: 'late', content: 'c', scheduleAt: now + 3_600_000, ...base },
      { id: 'past', content: 'c', scheduleAt: now - 1000, ...base },
      { id: 'nodate', content: 'c', scheduleAt: null, ...base },
      { id: 'notime', content: 'c', scheduleAt: now + 60_000, transcript: '', hasTime: false },
      { id: 'soon', content: 'c', scheduleAt: now + 600_000, ...base },
    ]);
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    const ids = mocked.scheduleNotificationAsync.mock.calls.map((c) => c[0].identifier);
    expect(ids).toEqual(['mallo_soon_0', 'mallo_soon_1', 'mallo_soon_2', 'mallo_late_0', 'mallo_late_1', 'mallo_late_2']);
  });

  test('iOS 64개 제한: 예산 60개 → 최대 20건까지만 등록', async () => {
    const now = Date.now();
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`, content: 'c', scheduleAt: now + (i + 1) * 60_000, ...base,
    }));
    await resyncAlarms(many);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(60);
  });
});
