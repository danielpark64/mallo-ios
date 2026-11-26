// 알람 화면 권한 안내: 무엇을 먼저 묻는지, 얼마나 자주 묻는지
import { ASK_INTERVAL_MS, nextAlarmScreenNeed, shouldAskAfterSave, shouldAskAlarmScreen, type AlarmScreenEnv } from '../alarmScreenAsk';

const android = (fullScreenIntent: boolean, overlay: boolean): AlarmScreenEnv => ({ os: 'android', fullScreenIntent, overlay, alarmKit: 'unavailable' });
const ios = (alarmKit: AlarmScreenEnv['alarmKit']): AlarmScreenEnv => ({ os: 'ios', fullScreenIntent: true, overlay: true, alarmKit });

test('Android: 전체 화면 알림을 먼저, 그다음 다른 앱 위에 표시', () => {
  expect(nextAlarmScreenNeed(android(false, false))).toBe('fsi');
  expect(nextAlarmScreenNeed(android(true, false))).toBe('overlay');
  expect(nextAlarmScreenNeed(android(false, true))).toBe('fsi');
  expect(nextAlarmScreenNeed(android(true, true))).toBeNull();
});

test('이미 물은 것은 건너뛴다(설정에서 돌아와 이어 묻기)', () => {
  expect(nextAlarmScreenNeed(android(false, false), ['fsi'])).toBe('overlay');
  expect(nextAlarmScreenNeed(android(false, false), ['fsi', 'overlay'])).toBeNull();
});

test('iOS: AlarmKit을 거부한 경우만 묻는다', () => {
  expect(nextAlarmScreenNeed(ios('denied'))).toBe('alarmkit');
  expect(nextAlarmScreenNeed(ios('notDetermined'))).toBeNull(); // 시작 흐름이 시스템 창으로 묻는다
  expect(nextAlarmScreenNeed(ios('authorized'))).toBeNull();
  expect(nextAlarmScreenNeed(ios('unavailable'))).toBeNull(); // iOS 26 미만
});

test('다가오는 알람이 있을 때만, 3일에 한 번', () => {
  const now = 1_800_000_000_000;
  expect(shouldAskAlarmScreen(0, now, false)).toBe(false);
  expect(shouldAskAlarmScreen(0, now, true)).toBe(true);
  expect(shouldAskAlarmScreen(now - 1000, now, true)).toBe(false);
  expect(shouldAskAlarmScreen(now - ASK_INTERVAL_MS, now, true)).toBe(true);
  expect(shouldAskAlarmScreen(now + 60_000, now, true)).toBe(true); // 시계를 되돌린 경우
});

test('알림 권한이 꺼져 있으면 가장 먼저, 배터리 최적화는 묻지 않는다(설정 화면 줄만)', () => {
  const env = { ...android(false, false), notifications: false };
  expect(nextAlarmScreenNeed(env)).toBe('notif');
  expect(nextAlarmScreenNeed(env, ['notif'])).toBe('fsi');
  expect(nextAlarmScreenNeed(env, ['notif', 'fsi'])).toBe('overlay');
  expect(nextAlarmScreenNeed(env, ['notif', 'fsi', 'overlay'])).toBeNull();
  // 배터리 최적화에 묶여 있어도(예전 battery: false 값) 시작·저장 안내에는 안 나온다
  expect(nextAlarmScreenNeed({ ...android(true, true), battery: false } as AlarmScreenEnv)).toBeNull();
  // 모르는 값(undefined)은 켜진 것으로 본다
  expect(nextAlarmScreenNeed(android(true, true))).toBeNull();
  // iOS: 알림 꺼짐은 묻는다
  expect(nextAlarmScreenNeed({ ...ios('authorized'), notifications: false })).toBe('notif');
  expect(nextAlarmScreenNeed(ios('authorized'))).toBeNull();
});

test('알람 저장 직후: 알람이 걸렸고 이번 실행에서 안 물었을 때만', () => {
  expect(shouldAskAfterSave(true, false)).toBe(true);
  expect(shouldAskAfterSave(true, true)).toBe(false);
  expect(shouldAskAfterSave(false, false)).toBe(false);
  // 1.2.4: 앱을 껐다 켜도 하루 안에 다시 물은 적이 있으면 저장 직후엔 안 묻는다
  const now = 1_800_000_000_000;
  expect(shouldAskAfterSave(true, false, now - 60_000, now)).toBe(false);
  expect(shouldAskAfterSave(true, false, now - 25 * 3600_000, now)).toBe(true);
  expect(shouldAskAfterSave(true, false, now + 60_000, now)).toBe(true); // 시계를 되돌린 경우
});
