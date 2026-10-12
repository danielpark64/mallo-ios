// Android 전용 네이티브 정확 알람(modules/mallo-alarm) 래퍼.
//
// 전역 규칙(CLAUDE.md): Android는 Expo 알림 + 네이티브 AlarmManager 두 경로를 예약/취소/재스케줄에서
// 항상 함께 처리한다. 이 파일은 네이티브 쪽 호출을 한 곳에 모아 iOS·모듈 미빌드(Expo Go, jest)에서는
// 전부 조용히 no-op이 되게 한다. notifications.ts 밖에서 직접 쓰지 말 것.
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import type { AlarmMode } from './notifications';

type MalloAlarmNative = {
  schedule(key: string, recordId: string, triggerAtMs: number, title: string, body: string, soundOn: boolean, vibOn: boolean): void;
  cancel(keys: string[]): void;
  cancelByRecordId(recordId: string): void;
  cancelAll(): void;
  stopRinging(recordId: string | null): void;
  getRingingRecordId(): string | null;
  canScheduleExact(): boolean;
  openExactAlarmSettings(): void;
  canDrawOverlays(): boolean;
  requestOverlayPermission(): void;
  listScheduled(): Array<{ key: string; recordId: string; at: number }>;
};

/**
 * 네이티브가 정확히(T) 울리면 보조 경로인 Expo 예약은 이 유예만큼 뒤(T+유예)에 걸어 둔다.
 * 네이티브 리시버가 발화 직후 같은 식별자의 Expo 예약을 지우므로 평소엔 알림이 하나만 뜨고,
 * 네이티브가 어떤 이유로 못 울렸을 때만 Expo가 유예 뒤에 대신 울린다(둘 다 T에 걸면 경쟁으로 중복됨).
 */
export const EXPO_FALLBACK_GRACE_MS = 20_000;

function getNative(): MalloAlarmNative | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireOptionalNativeModule<MalloAlarmNative>('MalloAlarm');
  } catch {
    return null;
  }
}

export function isNativeAlarmAvailable(): boolean {
  return getNative() != null;
}

export function scheduleNativeAlarm(params: {
  key: string;
  recordId: string;
  at: Date;
  title: string;
  body: string;
  mode: AlarmMode;
}): boolean {
  const native = getNative();
  if (!native) return false;
  try {
    native.schedule(
      params.key,
      params.recordId,
      params.at.getTime(),
      params.title,
      params.body,
      params.mode !== 'vibe',
      params.mode !== 'sound'
    );
    return true;
  } catch (e) {
    console.warn('네이티브 알람 예약 실패:', e);
    return false;
  }
}

export function cancelNativeAlarms(keys: string[]): void {
  const native = getNative();
  if (!native || keys.length === 0) return;
  try { native.cancel(keys); } catch (e) { console.warn('네이티브 알람 취소 실패:', e); }
}

export function cancelNativeAlarmsByRecordId(recordId: string): void {
  const native = getNative();
  if (!native) return;
  try { native.cancelByRecordId(recordId); } catch (e) { console.warn('네이티브 알람 취소 실패:', e); }
}

export function cancelAllNativeAlarms(): void {
  const native = getNative();
  if (!native) return;
  try { native.cancelAll(); } catch (e) { console.warn('네이티브 알람 전체 취소 실패:', e); }
}

export function stopNativeRinging(recordId?: string): void {
  const native = getNative();
  if (!native) return;
  try { native.stopRinging(recordId ?? null); } catch {}
}

/** Android 12에서 사용자가 정확 알람 권한을 꺼둔 경우 false. 13+는 USE_EXACT_ALARM으로 항상 true. */
export function canScheduleExactAlarms(): boolean {
  const native = getNative();
  if (!native) return true;
  try { return native.canScheduleExact(); } catch { return true; }
}

export function openExactAlarmSettings(): void {
  const native = getNative();
  if (!native) return;
  try { native.openExactAlarmSettings(); } catch {}
}

/**
 * "다른 앱 위에 표시" 권한. 화면이 켜진 채 다른 앱을 쓰는 중에도 전체화면 울림 팝업(AlarmRingActivity)을
 * 띄우려면 필요하다(잠금 화면·말로 전면일 때는 없어도 뜬다). 네이티브 없으면 true(안내 불필요).
 */
export function canDrawOverlays(): boolean {
  const native = getNative();
  if (!native) return true;
  try { return native.canDrawOverlays(); } catch { return true; }
}

export function requestOverlayPermission(): void {
  const native = getNative();
  if (!native) return;
  try { native.requestOverlayPermission(); } catch {}
}
