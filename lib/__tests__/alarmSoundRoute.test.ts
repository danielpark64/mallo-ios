// 알람 소리 고르기(1.2.0): 고른 소리가 모든 알람 경로(Android Expo 채널·네이티브, iOS Expo·AlarmKit)에
// 똑같이 넘어가는지, 진동만은 무음 그대로인지, 재동기화가 일정 소리·설정 기본을 따르는지 본다.
import { Platform } from 'react-native';

let mockAKAuth = 'denied';
const mockAK = {
  isAvailable: jest.fn(() => true),
  authorizationState: jest.fn(() => mockAKAuth),
  requestAuthorization: jest.fn(async () => 'authorized'),
  schedule: jest.fn(async (_o: any) => true),
  cancelKeys: jest.fn(async () => 0),
  cancelForRecord: jest.fn(async () => 0),
  cancelAll: jest.fn(async () => 0),
  listScheduled: jest.fn(async () => []),
};
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
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: (name: string) => (name === 'MalloAlarm' ? mockNative : name === 'SayramAlarmKit' ? mockAK : null),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async ({ identifier }: { identifier: string }) => identifier),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { MAX: 7 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidAudioUsage: { ALARM: 4 },
}));

import * as Notifications from 'expo-notifications';
import { registerAndroidChannels, resyncAlarms, scheduleAlarm } from '../notifications';
import { setDefaultAlarmSound } from '../alarmSounds';

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const future = (min: number) => new Date(Date.now() + min * 60_000);
const expoCalls = () => mocked.scheduleNotificationAsync.mock.calls.map((c: any) => c[0]);
const nativeTones = () => mockNative.schedule.mock.calls.map((c) => c[7]);

beforeEach(async () => {
  jest.clearAllMocks();
  mockAKAuth = 'denied';
  setDefaultAlarmSound('default');
  jest.replaceProperty(Platform, 'OS', 'android');
  await registerAndroidChannels(); // 이번 실행의 채널 기억을 비운다
  mocked.setNotificationChannelAsync.mockClear();
});

describe('Android', () => {
  test('고른 소리: 정각 3슬롯·미리 알림 모두 같은 소리 채널과 네이티브 소리 id', async () => {
    await scheduleAlarm('r1', '치과', future(120), 'both', { remindBefore: [30], alarmSound: 'marimba' });
    const calls = expoCalls();
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c.trigger.channelId).toBe('alarm_both_marimba');
      expect(c.content.sound).toBe('snd_marimba.m4a');
    }
    expect(nativeTones()).toEqual(['marimba', 'marimba', 'marimba', 'marimba']);
    // 채널은 처음 한 번만 만든다(소리 파일·알람 용도)
    const made = mocked.setNotificationChannelAsync.mock.calls.filter((c) => c[0] === 'alarm_both_marimba');
    expect(made).toHaveLength(1);
    expect(made[0][1]).toEqual(expect.objectContaining({ sound: 'snd_marimba.m4a', enableVibrate: true }));
    await scheduleAlarm('r2', '약', future(200), 'both', { alarmSound: 'marimba' });
    expect(mocked.setNotificationChannelAsync.mock.calls.filter((c) => c[0] === 'alarm_both_marimba')).toHaveLength(1);
  });

  test('소리만 모드는 진동 없는 소리 채널', async () => {
    await scheduleAlarm('r1', '회의', future(60), 'sound', { alarmSound: 'bell_march' });
    expect(expoCalls()[0].trigger.channelId).toBe('alarm_sound_bell_march');
    const made = mocked.setNotificationChannelAsync.mock.calls.find((c) => c[0] === 'alarm_sound_bell_march')!;
    expect(made[1]).toEqual(expect.objectContaining({ enableVibrate: false }));
  });

  test('진동만은 소리를 골랐어도 예전 무음 경로 그대로', async () => {
    await scheduleAlarm('r1', '조용히', future(60), 'vibe', { alarmSound: 'marimba' });
    for (const c of expoCalls()) {
      expect(c.trigger.channelId).toBe('alarm_vibe');
      expect(c.content.sound).toBeUndefined();
    }
    expect(mockNative.schedule.mock.calls[0].slice(5, 7)).toEqual([false, true]);
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  test('일정에 소리가 없으면 설정 기본, 설정도 기본음이면 예전 채널 그대로', async () => {
    await scheduleAlarm('r1', 'a', future(60), 'both');
    expect(expoCalls()[0].trigger.channelId).toBe('alarm_both');
    expect(expoCalls()[0].content.sound).toBe('alarm_long.wav');
    expect(nativeTones()[0]).toBe('default');
    jest.clearAllMocks();
    setDefaultAlarmSound('old_clock');
    await scheduleAlarm('r2', 'b', future(60), 'both');
    expect(expoCalls()[0].trigger.channelId).toBe('alarm_both_old_clock');
    expect(nativeTones()[0]).toBe('old_clock');
  });

  test('재동기화: 일정마다 자기 소리, 없는 일정은 설정 기본', async () => {
    setDefaultAlarmSound('gentle_piano');
    const rec = (id: string, extra: object) => ({
      id, content: id, transcript: '', scheduleAt: future(60 + Number(id.slice(1))).getTime(), hasTime: true, ...extra,
    });
    await resyncAlarms([rec('r1', { alarmSound: 'music_box' }), rec('r2', {}), rec('r3', { alarmSound: 'default' })]);
    const byRecord: Record<string, string[]> = {};
    for (const c of mockNative.schedule.mock.calls) (byRecord[c[1]] ??= []).push(c[7]);
    expect(byRecord).toEqual({
      r1: ['music_box', 'music_box', 'music_box'],
      r2: ['gentle_piano', 'gentle_piano', 'gentle_piano'],
      r3: ['default', 'default', 'default'],
    });
  });
});

describe('iOS', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));

  test('Expo 알림은 앱 번들 CAF 이름', async () => {
    await scheduleAlarm('r1', '치과', future(60), 'both', { remindBefore: [10], alarmSound: 'digital_beep' });
    for (const c of expoCalls()) expect(c.content.sound).toBe('snd_digital_beep.caf');
    expect(mockNative.schedule).not.toHaveBeenCalled();
  });

  test('AlarmKit(iOS 26+)도 같은 소리 파일, 기본이면 alarm_long.wav', async () => {
    mockAKAuth = 'authorized';
    await scheduleAlarm('r1', '치과', future(60), 'both', { remindBefore: [30], alarmSound: 'old_clock' });
    expect(mockAK.schedule).toHaveBeenCalledTimes(2);
    for (const c of mockAK.schedule.mock.calls) expect(c[0].sound).toBe('snd_old_clock.caf');
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    mockAK.schedule.mockClear();
    await scheduleAlarm('r2', 'b', future(60), 'sound');
    expect(mockAK.schedule.mock.calls[0][0].sound).toBe('alarm_long.wav');
  });

  test('진동만은 iOS에서도 무음(AlarmKit도 안 씀)', async () => {
    mockAKAuth = 'authorized';
    await scheduleAlarm('r1', 'a', future(60), 'vibe', { alarmSound: 'marimba' });
    expect(mockAK.schedule).not.toHaveBeenCalled();
    for (const c of expoCalls()) expect(c.content.sound).toBeUndefined();
  });
});
