// 알람 화면 권한 안내: 무엇을 먼저 묻는지, 얼마나 자주 묻는지
import { ASK_INTERVAL_MS, nextAlarmScreenNeed, shouldAskAlarmScreen, type AlarmScreenEnv } from '../alarmScreenAsk';

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
