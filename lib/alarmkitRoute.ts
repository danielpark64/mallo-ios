// iOS 26+ AlarmKit 경로 결정 — 순수 함수만(React Native·네이티브 import 금지, jest에서 그대로 돈다).
// 교대알람(AlarmApp fcc8938 src/utils/alarmkitRoute.ts)에서 옮겼다.
//
// 방식은 자동 전환이다(설정 항목 없음):
//   iOS 26 이상 + AlarmKit 권한 허용 → 소리 알람(both·sound)은 AlarmKit만(무음·집중 모드에서도 시계 앱처럼 울림)
//   거부 · 아직 안 물음 · iOS 26 미만 · 진동만(vibe) · Android → 지금까지의 Expo 알림(+Android 네이티브) 그대로
// ⚠️ 한 슬롯을 두 경로에 동시에 걸면 두 번 울린다 — 분기는 반드시 usesAlarmKit 하나로만 판단한다.

export type AlarmKitAuth = 'notDetermined' | 'denied' | 'authorized' | 'unavailable';
export type AlarmKitEnv = { os: string; available: boolean; auth: AlarmKitAuth };

export function alarmKitEnabled(env: AlarmKitEnv): boolean {
  return env.os === 'ios' && env.available && env.auth === 'authorized';
}

// 권한은 iOS 26+에서 아직 묻지 않았을 때 한 번만 요청한다(거부했으면 다시 묻지 않고 Expo 방식).
export function shouldAskAlarmKit(env: AlarmKitEnv): boolean {
  return env.os === 'ios' && env.available && env.auth === 'notDetermined';
}

// 진동만(vibe)은 Expo에 남긴다 — AlarmKit에는 "소리 없이 진동만"을 지정하는 API가 없다.
// [VOICE_ALARM] 내 목소리 소리 파일(voiceSound)이 있으면 그 파일을 쓰는 Expo 경로에 남긴다(보류 기능, 지금은 늘 null).
export function usesAlarmKit(mode: 'both' | 'sound' | 'vibe', voiceSound: string | null | undefined, enabled: boolean): boolean {
  return enabled && mode !== 'vibe' && !voiceSound;
}

// 예약 UUID — 같은 슬롯 식별자(mallo_<id>_0, mallo_<id>_pre30 …)·같은 발화 시각은 항상 같은 UUID.
// 겹쳐 돈 재예약이 같은 슬롯을 다시 걸면 덮어쓰게 되어 "같은 시각에 두 개"가 남지 않는다.
export function alarmKitUuid(key: string, fireMs: number): string {
  const s = `sayram:${key}:${Math.round(fireMs)}`;
  const part = (seed: number) => {
    let h = (0x811c9dc5 ^ seed) >>> 0; // FNV-1a 32비트, 씨앗을 바꿔 4번 → 128비트
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).toUpperCase().padStart(8, '0');
  };
  const hex = part(1) + part(2) + part(3) + part(4);
  const v = '89AB'[parseInt(hex[16], 16) & 3];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${v}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
