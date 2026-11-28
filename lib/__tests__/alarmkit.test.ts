// iOS 26+ AlarmKit 경로 — 분기(usesAlarmKit 한 곳), 예약 UUID, 취소 원장 호출, 재동기화 정리를 검증한다.
// 네이티브 모듈(SayramAlarmKit·MalloAlarm)은 목으로 대체한다. Android 경로가 그대로인지도 함께 본다.
import { Platform } from 'react-native';

const mockAK = {
  isAvailable: jest.fn(() => true),
  authorizationState: jest.fn(() => 'authorized'),
  requestAuthorization: jest.fn(async () => 'authorized'),
  schedule: jest.fn(async (_o: any) => true),
  cancelKeys: jest.fn(async (_k: string[]) => 0),
  cancelForRecord: jest.fn(async (_r: string) => 0),
  cancelAll: jest.fn(async (_k: string[]) => 0),
  listScheduled: jest.fn(async () => []),
};
const mockMallo = {
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
  requireOptionalNativeModule: (name: string) =>
    name === 'SayramAlarmKit' ? mockAK : name === 'MalloAlarm' ? mockMallo : null,
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
import { alarmKitEnabled, alarmKitSound, alarmKitUuid, shouldAskAlarmKit, usesAlarmKit } from '../alarmkitRoute';
import {
  cancelAlarm,
  cancelAlarmByRecordId,
  cancelAlarmGroup,
  registerNotificationCategories,
  requestAlarmKitPermission,
  resyncAlarms,
  resyncAlarmsIfAlarmKitChanged,
  scheduleAlarm,
} from '../notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const future = (min: number) => new Date(Date.now() + min * 60_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockAK.isAvailable.mockReturnValue(true);
  mockAK.authorizationState.mockReturnValue('authorized');
  mockAK.schedule.mockImplementation(async () => true);
  jest.replaceProperty(Platform, 'OS', 'ios');
});

describe('경로 결정(순수 함수)', () => {
  test('iOS 26+ 허용일 때만 AlarmKit', () => {
    expect(alarmKitEnabled({ os: 'ios', available: true, auth: 'authorized' })).toBe(true);
    expect(alarmKitEnabled({ os: 'ios', available: true, auth: 'denied' })).toBe(false);
    expect(alarmKitEnabled({ os: 'ios', available: true, auth: 'notDetermined' })).toBe(false);
    expect(alarmKitEnabled({ os: 'ios', available: false, auth: 'unavailable' })).toBe(false);
    expect(alarmKitEnabled({ os: 'android', available: true, auth: 'authorized' })).toBe(false);
  });
  test('권한은 iOS 26+에서 아직 안 물었을 때만 묻는다', () => {
    expect(shouldAskAlarmKit({ os: 'ios', available: true, auth: 'notDetermined' })).toBe(true);
    expect(shouldAskAlarmKit({ os: 'ios', available: true, auth: 'denied' })).toBe(false);
    expect(shouldAskAlarmKit({ os: 'ios', available: false, auth: 'unavailable' })).toBe(false);
    expect(shouldAskAlarmKit({ os: 'android', available: false, auth: 'unavailable' })).toBe(false);
  });
  test('진동만도 AlarmKit(1.2.5, 교대알람 bfefbbf) — 내 목소리·모드 꺼짐만 Expo', () => {
    expect(usesAlarmKit('both', null, true)).toBe(true);
    expect(usesAlarmKit('sound', null, true)).toBe(true);
    expect(usesAlarmKit('vibe', null, true)).toBe(true);
    expect(usesAlarmKit('both', 'voice_x.caf', true)).toBe(false);
    expect(usesAlarmKit('both', null, false)).toBe(false);
    expect(usesAlarmKit('vibe', null, false)).toBe(false);
  });
  test('AlarmKit 소리: 진동만은 무음 30초(0.5초 무음은 꺼진 화면에서 진동 없음), 소리 알람은 고른 소리', () => {
    expect(alarmKitSound('vibe', 'snd_marimba.caf')).toBe('silent_30s.wav');
    expect(alarmKitSound('both', 'snd_marimba.caf')).toBe('snd_marimba.caf');
    expect(alarmKitSound('sound', 'alarm_long.wav')).toBe('alarm_long.wav');
  });
  test('예약 UUID: 같은 슬롯·같은 시각은 같고, 다르면 다르다', () => {
    const RE = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
    const t = 1_800_000_000_000;
    const u = alarmKitUuid('mallo_r1_0', t);
    expect(u).toMatch(RE);
    expect(alarmKitUuid('mallo_r1_0', t)).toBe(u);
    expect(alarmKitUuid('mallo_r1_0', t + 60_000)).not.toBe(u);
    expect(alarmKitUuid('mallo_r1_pre10', t)).not.toBe(u);
    expect(alarmKitUuid('mallo_r2_0', t)).not.toBe(u);
    const seen = new Set<string>();
    for (let r = 0; r < 60; r++) for (const s of ['0', 'pre5', 'pre10', 'pre30', 'pre60']) for (let d = 0; d < 5; d++)
      seen.add(alarmKitUuid(`mallo_r${r}_${s}`, t + d * 86_400_000));
    expect(seen.size).toBe(60 * 5 * 5);
  });
});

describe('예약 분기(scheduleAlarm)', () => {
  test('AlarmKit 모드: 미리 알림 + 정각 1개만 AlarmKit, Expo는 하나도 안 건다', async () => {
    const at = future(60);
    const ids = await scheduleAlarm('r1', '치과', at, 'both', { remindBefore: [10] });
    expect(ids).toEqual(['mallo_r1_pre10', 'mallo_r1_0']);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockMallo.schedule).not.toHaveBeenCalled();
    expect(mockAK.schedule).toHaveBeenCalledTimes(2);
    const [pre, main] = mockAK.schedule.mock.calls.map((c) => c[0]);
    expect(pre).toMatchObject({ key: 'mallo_r1_pre10', recordId: 'r1#pre10', baseRecordId: 'r1', fireMs: at.getTime() - 10 * 60_000 });
    expect(main).toMatchObject({ key: 'mallo_r1_0', recordId: 'r1', baseRecordId: 'r1', fireMs: at.getTime(), title: '치과' });
    expect(main.id).toBe(alarmKitUuid('mallo_r1_0', at.getTime()));
  });
  test('울림 화면 [5분 후 다시](1.2.4): 정각·미리 알림 모두 버튼 글자와 5분을 넘기고, 일반 예약은 스누즈 표시 없음', async () => {
    await scheduleAlarm('r1', '치과', future(60), 'both', { remindBefore: [10] });
    for (const c of mockAK.schedule.mock.calls) {
      expect(c[0]).toMatchObject({ snoozeText: '5분 후 다시', snoozeMin: 5, snooze: false });
    }
  });
  test('JS가 5분 후로 다시 건 슬롯은 snooze 표시 — 미리 알림 스누즈도 원래 일정 id(baseRecordId)로 남는다(버그 31)', async () => {
    await scheduleAlarm('r1#pre30', '치과', future(5), 'both', { single: true, snoozeOf: { eventAt: future(30), leadMin: 30 } });
    expect(mockAK.schedule.mock.calls[0][0]).toMatchObject({ key: 'mallo_r1#pre30_0', recordId: 'r1#pre30', baseRecordId: 'r1', snooze: true });
  });
  test('같은 일정을 다시 걸면 같은 UUID(덮어쓰기)', async () => {
    const at = future(30);
    await scheduleAlarm('r1', 'a', at, 'sound');
    await scheduleAlarm('r1', 'a', at, 'sound');
    const [a, b] = mockAK.schedule.mock.calls.map((c) => c[0].id);
    expect(a).toBe(b);
  });
  test('진동만(vibe)도 AlarmKit 모드면 AlarmKit 정각 1슬롯 + 무음 30초, Expo는 안 건다(1.2.5)', async () => {
    const ids = await scheduleAlarm('r1', 'a', future(30), 'vibe', { remindBefore: [10] });
    expect(mockAK.schedule).toHaveBeenCalledTimes(2);
    for (const c of mockAK.schedule.mock.calls) expect(c[0].sound).toBe('silent_30s.wav');
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(ids).toEqual(['mallo_r1_pre10', 'mallo_r1_0']);
  });
  test('권한 거부·iOS 26 미만이면 Expo 그대로', async () => {
    mockAK.authorizationState.mockReturnValue('denied');
    await scheduleAlarm('r1', 'a', future(30), 'both');
    mockAK.isAvailable.mockReturnValue(false);
    await scheduleAlarm('r2', 'a', future(30), 'both');
    expect(mockAK.schedule).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(6);
  });
  test('AlarmKit 예약이 실패한 슬롯만 Expo로 대신 건다', async () => {
    mockAK.schedule.mockImplementation(async () => false);
    const ids = await scheduleAlarm('r1', 'a', future(60), 'both', { remindBefore: [10] });
    expect(ids).toEqual(['mallo_r1_pre10', 'mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(4);
  });
  test('Android는 AlarmKit을 전혀 부르지 않고 Expo+네이티브 그대로', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const ids = await scheduleAlarm('r1', 'a', future(60), 'both', { remindBefore: [10] });
    expect(ids).toEqual(['mallo_r1_pre10', 'mallo_r1_0', 'mallo_r1_1', 'mallo_r1_2']);
    expect(mockMallo.schedule).toHaveBeenCalledTimes(4);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(4);
    await cancelAlarmGroup('r1', ids);
    await resyncAlarms([]);
    for (const f of [mockAK.schedule, mockAK.cancelKeys, mockAK.cancelForRecord, mockAK.cancelAll, mockAK.isAvailable]) {
      expect(f).not.toHaveBeenCalled();
    }
  });
});

describe('취소 원장', () => {
  test('cancelAlarm: 같은 식별자로 AlarmKit 원장도 취소', async () => {
    await cancelAlarm(['mallo_r1_pre10', 'mallo_r1_0']);
    expect(mockAK.cancelKeys).toHaveBeenCalledWith(['mallo_r1_pre10', 'mallo_r1_0']);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });
  test('cancelAlarmByRecordId: recordId로 원장 취소', async () => {
    await cancelAlarmByRecordId('r1');
    expect(mockAK.cancelForRecord).toHaveBeenCalledWith('r1');
  });
  test('cancelAlarmGroup: 정각 + 모든 미리 알림 recordId까지 원장에서 지운다', async () => {
    await cancelAlarmGroup('r1', ['mallo_r1_0']);
    expect(mockAK.cancelKeys).toHaveBeenCalledWith(['mallo_r1_0']);
    const recs = mockAK.cancelForRecord.mock.calls.map((c) => c[0]);
    expect(recs).toContain('r1');
    expect(recs).toContain('r1#pre10');
    expect(recs).toContain('r1#pre60');
  });
  test('권한을 꺼도(Expo 방식) 취소는 원장까지 항상 부른다', async () => {
    mockAK.authorizationState.mockReturnValue('denied');
    await cancelAlarmGroup('r1', ['mallo_r1_0']);
    expect(mockAK.cancelKeys).toHaveBeenCalled();
    expect(mockAK.cancelForRecord).toHaveBeenCalled();
  });
});

describe('재동기화', () => {
  const rec = (id: string, min: number, mode: 'both' | 'vibe' = 'both') => ({
    id, content: id, transcript: id, scheduleAt: future(min).getTime(), hasTime: true, alarmMode: mode,
  });
  test('Expo 전체 취소 + AlarmKit 전체 정리(남은 일정 id 전달) 뒤 다시 건다', async () => {
    const order: string[] = [];
    mocked.getAllScheduledNotificationsAsync.mockImplementationOnce(async () => { order.push('expoAll'); return []; });
    mockAK.cancelAll.mockImplementationOnce(async () => { order.push('akAll'); return 0; });
    mockAK.schedule.mockImplementation(async () => { order.push('ak'); return true; });
    await resyncAlarms([rec('a', 30), rec('b', 60, 'vibe'), { ...rec('old', -60) }]);
    expect(mockAK.cancelAll).toHaveBeenCalledWith(['a', 'b', 'old'], ['a', 'b']); // 남길 일정, 앞으로 정각이 다시 걸리는 일정(1.2.4)
    expect(order.slice(0, 3)).toEqual(['expoAll', 'akAll', 'ak']);
    expect(mockAK.schedule).toHaveBeenCalledTimes(2); // a·b 모두(진동만도 AlarmKit, 1.2.5)
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  test('결과를 표시한 일정·지운 일정은 남길 일정에서 빠진다 — 카운트다운 중인 스누즈도 지워진다(버그 30·31)', async () => {
    await resyncAlarms([rec('past', -3), { ...rec('done', -3), outcome: { kind: 'partial' } }, rec('soon', 30)]);
    expect(mockAK.cancelAll).toHaveBeenCalledWith(['past', 'soon'], ['soon']);
  });
  test('결과 표시 때 쓰는 cancelAlarmGroup은 AlarmKit 원장에서 정각·미리 알림 recordId를 모두 지운다(카운트다운 중 포함)', async () => {
    await cancelAlarmGroup('r1');
    const ids = mockAK.cancelForRecord.mock.calls.map((c) => c[0]);
    expect(ids).toContain('r1');
    expect(ids).toContain('r1#pre30');
  });
  test('64개 예산: AlarmKit으로 걸린 슬롯은 Expo 예산에서 빼지 않는다', async () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ ...rec(`r${i}`, 60 + i), remindBefore: [10] }));
    await resyncAlarms(many);
    expect(mockAK.schedule).toHaveBeenCalledTimes(140); // 일정마다 미리 알림 1 + 정각 1
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  test('64개 예산: AlarmKit 실패로 Expo로 넘어간 슬롯은 예산에서 뺀다', async () => {
    mockAK.schedule.mockImplementation(async () => false);
    const many = Array.from({ length: 30 }, (_, i) => rec(`r${i}`, i + 1));
    await resyncAlarms(many);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(60); // 20건 × 3슬롯
  });
  test('64개 예산: 진동만도 AlarmKit이라 Expo 예산과 무관하게 모두 건다(1.2.5)', async () => {
    const vibes = Array.from({ length: 25 }, (_, i) => rec(`v${i}`, i + 1, 'vibe'));
    const sounds = Array.from({ length: 30 }, (_, i) => rec(`s${i}`, 100 + i));
    await resyncAlarms([...vibes, ...sounds]);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockAK.schedule).toHaveBeenCalledTimes(55);
  });
  test('겹친 재동기화(iOS AlarmKit): 새 호출이 시작되면 앞 호출은 남은 예약을 멈춘다', async () => {
    const order: string[] = [];
    let release!: () => void;
    mockAK.schedule.mockImplementationOnce(async (o: any) => {
      order.push(`ak:${o.key}`);
      await new Promise<void>((r) => { release = r; });
      return true;
    });
    mockAK.schedule.mockImplementation(async (o: any) => { order.push(`ak:${o.key}`); return true; });
    mockAK.cancelAll.mockImplementation(async () => { order.push('akAll'); return 0; });
    const first = resyncAlarms([rec('a', 30), rec('b', 60), rec('c', 90)]);
    await new Promise((r) => setTimeout(r, 0));
    const second = resyncAlarms([]);
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['akAll', 'ak:mallo_a_0', 'akAll']); // b·c는 다시 걸리지 않는다
  });
  test('겹친 재동기화(Android): Expo·네이티브 모두 앞 호출의 남은 슬롯을 걸지 않는다', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    let release!: () => void;
    mocked.scheduleNotificationAsync.mockImplementationOnce(async ({ identifier }: any) => {
      await new Promise<void>((r) => { release = r; });
      return identifier;
    });
    const first = resyncAlarms([rec('a', 30), rec('b', 60)]);
    await new Promise((r) => setTimeout(r, 0));
    const second = resyncAlarms([]);
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([first, second]);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1); // a의 정각 슬롯 하나(이미 보낸 것)만
    expect(mockMallo.schedule).toHaveBeenCalledTimes(1);
    expect(mockMallo.cancelAll).toHaveBeenCalledTimes(2);
  });
  test('앞으로 올 때 권한 상태가 바뀌었으면 재동기화, 그대로면 안 한다', async () => {
    await resyncAlarms([]);
    jest.clearAllMocks();
    expect(await resyncAlarmsIfAlarmKitChanged([])).toBe(false);
    expect(mocked.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    mockAK.authorizationState.mockReturnValue('denied');
    expect(await resyncAlarmsIfAlarmKitChanged([])).toBe(true);
    expect(mockAK.cancelAll).toHaveBeenCalled();
    expect(await resyncAlarmsIfAlarmKitChanged([])).toBe(false);
  });
  test('권한 요청은 아직 안 물었을 때만', async () => {
    mockAK.authorizationState.mockReturnValue('denied');
    await requestAlarmKitPermission();
    expect(mockAK.requestAuthorization).not.toHaveBeenCalled();
    mockAK.authorizationState.mockReturnValue('notDetermined');
    await requestAlarmKitPermission();
    expect(mockAK.requestAuthorization).toHaveBeenCalledTimes(1);
  });
});

test('iOS 알림 카테고리 customDismissAction 유지(워치 연동)', async () => {
  await registerNotificationCategories();
  expect(mocked.setNotificationCategoryAsync).toHaveBeenCalledWith('alarm', expect.any(Array), { customDismissAction: true });
});
