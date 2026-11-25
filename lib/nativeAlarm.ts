// Android 전용 네이티브 정확 알람(modules/mallo-alarm) 래퍼.
//
// 전역 규칙(CLAUDE.md): Android는 Expo 알림 + 네이티브 AlarmManager 두 경로를 예약/취소/재스케줄에서
// 항상 함께 처리한다. 이 파일은 네이티브 쪽 호출을 한 곳에 모아 iOS·모듈 미빌드(Expo Go, jest)에서는
// 전부 조용히 no-op이 되게 한다. notifications.ts 밖에서 직접 쓰지 말 것.
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import type { AlarmMode } from './notifications';

type NativeScheduleOptions = {
  tone: string;
  /** 일정 시각(ms) — 울림 카드에 크게 보여 줄 시각. 0 = 모름 */
  eventAtMs: number;
  /** 미리 알림 분(0 = 정각, -1 = 모름) */
  leadMin: number;
  /** 일정 내용 원문(미리 알림 본문의 "30분 뒤 · " 앞말 없이) */
  content: string;
  /** 5분 후 다시로 다시 거는 것 — 카드 띠가 "다시 알림" */
  snoozed: boolean;
};

type MalloAlarmNative = {
  /** 동기 함수 인자 8개 한도라 소리·일정 정보는 opts로(네이티브 MalloAlarmModule.ScheduleOptions) */
  schedule(key: string, recordId: string, triggerAtMs: number, title: string, body: string, soundOn: boolean, vibOn: boolean, opts: NativeScheduleOptions): void;
  cancel(keys: string[]): void;
  cancelByRecordId(recordId: string): void;
  cancelAll(): void;
  stopRinging(recordId: string | null): void;
  getRingingRecordId(): string | null;
  canScheduleExact(): boolean;
  openExactAlarmSettings(): void;
  canDrawOverlays(): boolean;
  requestOverlayPermission(): void;
  canUseFullScreenIntent?(): boolean;
  openFullScreenIntentSettings?(): void;
  setLabels?(stop: string, snooze: string, ringing: string, app: string): void;
  setRingLabels?(labels: Record<string, string>): void;
  setVoice?(recordId: string, path: string): void;
  clearVoices?(): void;
  listScheduled(): Array<{ key: string; recordId: string; at: number }>;
  consumeOpenRecordId?(): string | null;
  showRingScreen?(): boolean;
  refreshRingFront?(): void;
  isIgnoringBatteryOptimizations?(): boolean;
  openBatteryOptimizationSettings?(): void;
  openNotificationSettings?(): void;
  addListener?(event: 'onOpenRecord', listener: () => void): { remove(): void };
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
  /** 알람 소리 id(lib/alarmSounds.ts SoundId). 네이티브가 원장에 같이 적어 재부팅 복구·스누즈도 같은 소리로 울린다 */
  tone?: string;
  /** 울림 카드용(1.2.3): 일정 시각·미리 알림 분(0 = 정각)·일정 내용 원문. 없으면 카드가 띠 없이 울린 시각을 보여 준다 */
  eventAt?: Date;
  leadMin?: number;
  content?: string;
  snoozed?: boolean;
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
      params.mode !== 'sound',
      {
        tone: params.tone ?? 'default',
        eventAtMs: params.eventAt?.getTime() ?? 0,
        leadMin: params.leadMin ?? -1,
        content: params.content ?? '',
        snoozed: params.snoozed ?? false,
      }
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

/**
 * Android 14+ "전체 화면 알림" 허용 여부 — 꺼져 있으면 잠금·화면 꺼짐 상태에서도 울림 화면이 안 뜨고 배너만 뜬다
 * (Play가 알람·전화 앱이 아니면 설치 때 끌 수 있다). 13 이하·네이티브 없으면 true(안내 불필요).
 */
export function canUseFullScreenIntent(): boolean {
  const native = getNative();
  if (!native?.canUseFullScreenIntent) return true;
  try { return native.canUseFullScreenIntent(); } catch { return true; }
}

export function openFullScreenIntentSettings(): void {
  const native = getNative();
  if (!native?.openFullScreenIntentSettings) return;
  try { native.openFullScreenIntentSettings(); } catch {}
}

/**
 * 네이티브 울림 화면·알림 버튼 글자를 앱 언어에 맞춘다. 네이티브는 앱 언어 설정을 모르므로(잠금해제 전·앱 미기동
 * 상태에서도 울린다) 언어가 정해지거나 바뀔 때마다 넘겨 저장해 둔다. iOS·구버전 네이티브는 no-op.
 */
export function setNativeAlarmLabels(labels: { stop: string; snooze: string; ringing: string; app: string; ring?: Record<string, string> }): void {
  const native = getNative();
  if (!native?.setLabels) return;
  try { native.setLabels(labels.stop, labels.snooze, labels.ringing, labels.app); } catch {}
  // 울림 카드 글자(띠·오늘/내일·끄기·앱 언어) — lib/ringCard.ts ringCardLabels()
  if (labels.ring && native.setRingLabels) {
    try { native.setRingLabels(labels.ring); } catch {}
  }
}

// [VOICE_ALARM] 보류된 기능 (lib/voiceAlarm.ts 스위치로 꺼짐)
/** "내 목소리" 알람: 이 일정이 울릴 때 쓸 녹음 파일(null이면 기본 알람음). lib/voiceAlarm.ts 밖에서 직접 쓰지 말 것. */
export function setNativeAlarmVoice(recordId: string, uri: string | null): void {
  const native = getNative();
  if (!native?.setVoice) return;
  try { native.setVoice(recordId, uri ?? ''); } catch {}
}

export function clearNativeAlarmVoices(): void {
  const native = getNative();
  if (!native?.clearVoices) return;
  try { native.clearVoices(); } catch {}
}

/**
 * 네이티브 알람 알림을 눌러 앱이 열렸으면 그 일정 ID를 한 번만 돌려준다(읽으면 비운다). 없으면 null.
 * 앱이 꺼져 있다가 열린 경우(시작 시)와 이미 켜져 있던 경우(onOpenRecord 이벤트 뒤) 모두 이것으로 읽는다.
 */
export function consumeNativeOpenRecordId(): string | null {
  const native = getNative();
  if (!native?.consumeOpenRecordId) return null;
  try { return native.consumeOpenRecordId(); } catch { return null; }
}

/** 앱이 켜져 있는 동안 네이티브 알람 알림을 눌렀을 때 부른다. iOS·구버전 네이티브는 아무것도 안 함. */
export function addNativeOpenRecordListener(listener: () => void): { remove(): void } {
  const native = getNative();
  if (!native?.addListener) return { remove() {} };
  try { return native.addListener('onOpenRecord', listener); } catch { return { remove() {} }; }
}

/** 지금 네이티브로 울리는 일정 ID(울리는 중이 아니거나 iOS면 null) */
export function nativeRingingRecordId(): string | null {
  const native = getNative();
  if (!native) return null;
  try { return native.getRingingRecordId() ?? null; } catch { return null; }
}

/**
 * 울리는 중이면 울림 화면(끄기·5분 후)을 맨 앞에 띄운다 — 알림 본문을 눌러 앱이 열렸을 때 끄지 않고 끄기 화면으로 보낸다.
 * 울리는 중이 아니거나 iOS·구버전 네이티브면 false.
 */
export function showNativeRingScreen(): boolean {
  const native = getNative();
  if (!native?.showRingScreen) return false;
  try { return native.showRingScreen(); } catch { return false; }
}

/**
 * 앱이 앞으로 올 때 부른다(Android) — 울리는 도중 "다른 앱 위에 표시"를 켰으면 그 슬롯부터 울림 화면이 가려져도 다시 올라오게 한다.
 * 울리는 중이 아니거나 권한이 없으면 네이티브가 아무것도 안 한다. iOS·구버전 네이티브는 no-op.
 */
export function refreshNativeRingFront(): void {
  const native = getNative();
  if (!native?.refreshRingFront) return;
  try { native.refreshRingFront(); } catch {}
}

/** 배터리 최적화에서 빠져 있는지(Android). iOS·네이티브 없으면 true(안내 불필요) */
export function isIgnoringBatteryOptimizations(): boolean {
  const native = getNative();
  if (!native?.isIgnoringBatteryOptimizations) return true;
  try { return native.isIgnoringBatteryOptimizations(); } catch { return true; }
}

/** 배터리 최적화 목록 화면(세이람을 찾아 "최적화 안 함"으로). 바로 묻는 창은 Play 선언이 필요해 쓰지 않는다 */
export function openBatteryOptimizationSettings(): void {
  const native = getNative();
  if (!native?.openBatteryOptimizationSettings) return;
  try { native.openBatteryOptimizationSettings(); } catch {}
}

/** Android 앱 알림 설정 화면을 연다. 열었으면 true(iOS·네이티브 없으면 false — 호출자가 앱 설정으로) */
export function openNativeNotificationSettings(): boolean {
  const native = getNative();
  if (!native?.openNotificationSettings) return false;
  try { native.openNotificationSettings(); return true; } catch { return false; }
}
