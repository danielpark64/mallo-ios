// ─── "내 목소리" 알람 ─────────────────────────────────────────────────────────
// [VOICE_ALARM] ★ 보류된 기능 — 상용 빌드에서는 꺼져 있다 (2026-10-13 결정: 효용에 비해 복잡해 지금은 넣지 않는다).
//   코드는 지우지 않고 남겨 두었다. 다시 켜려면:
//     1) 아래 VOICE_ALARM.enabled 를 true 로
//     2) modules/mallo-voice-sound/expo-module.config.json 의 "platforms" 를 ["ios"] 로 되돌리고 pod install
//     3) lib/helpContent.ts 의 [VOICE_ALARM] 주석 문단을 되살리고 번역 확인
//   관련 코드는 전부 "[VOICE_ALARM]" 으로 검색된다 (JS·Kotlin·Swift).
//   꺼져 있는 동안: 설정 항목·칩·🎙 아이콘이 보이지 않고, 모든 알람은 기본 알람음으로 울리며,
//   예약할 때마다 예전에 걸어 둔 목소리 정보는 지워진다.
// 알람이 울릴 때 기본 알람음 대신 그 일정을 말한 녹음 앞부분을 들려준다. 기본은 꺼짐(기본 알람음).
// 설정(알람 소리)이 모든 일정에 적용되고, 일정마다 칩으로 바꾼 것만 예외다:
// record.voiceAlarm 이 비어 있으면 설정을 따르고, true/false 가 있으면 그 일정은 그 값으로 고정.
//
// - Android: 네이티브 알람 서비스가 직접 재생하므로 "이 일정은 이 파일" 한 줄만 네이티브에 적어 둔다.
//   (보조 경로인 Expo 알림은 채널 소리라 기본 알람음 그대로 — 네이티브가 못 울린 드문 경우에만 들린다)
// - iOS: 알림 소리는 Library/Sounds 안의 wav/caf(30초 이하)만 되므로 녹음을 변환해 두고 그 이름을 알림에 지정한다.
// - 녹음 파일이 없는 일정(직접 입력, Android 12 이하)은 대상이 아니다 → 항상 기본 알람음.
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { isNativeAlarmAvailable, setNativeAlarmVoice, clearNativeAlarmVoices } from './nativeAlarm';

type VoiceSoundNative = {
  makeSound(srcUri: string, name: string, maxVoiceSec: number): Promise<string>;
  removeSound(name: string): void;
  pruneSounds(keepNames: string[]): void;
  hasSound(name: string): boolean;
};

/** [VOICE_ALARM] 기능 스위치. 객체로 둔 것은 테스트에서 켜 볼 수 있게 하기 위해서다 */
export const VOICE_ALARM = { enabled: false };

/** 알람에 들려줄 녹음 길이(초). 그보다 길면 앞부분만 */
export const VOICE_ALARM_MAX_SEC = 10;

function iosNative(): VoiceSoundNative | null {
  if (Platform.OS !== 'ios') return null;
  try { return requireOptionalNativeModule<VoiceSoundNative>('MalloVoiceSound'); } catch { return null; }
}

const soundName = (recordId: string) => `voice_${recordId.replace(/[^A-Za-z0-9_-]/g, '_')}`;

/** 이 기기에서 기능을 쓸 수 있는가 (칩·설정 항목을 보여줄지) */
export function voiceAlarmSupported(): boolean {
  if (!VOICE_ALARM.enabled) return false;
  if (Platform.OS === 'android') return isNativeAlarmAvailable();
  return iosNative() != null;
}

type VoiceCapable = { uri?: string | null; voiceAlarm?: boolean; alarmMode?: string };

// 설정값(알람 소리 = 내 목소리). 앱 시작·설정 변경 때 App이 넣어 준다.
let defaultOn = false;
export function setVoiceAlarmDefault(on: boolean): void { defaultOn = on; }

/** 이 일정의 선택: 일정에 따로 정한 값이 있으면 그 값, 없으면 설정 */
export function voiceAlarmOn(r: { voiceAlarm?: boolean } | null | undefined): boolean {
  return r?.voiceAlarm ?? defaultOn;
}

/** 일정에 저장할 값: 설정과 같으면 비워서(undefined) 나중에 설정을 바꿀 때 따라가게 한다 */
export function voiceAlarmToStore(chosen: boolean): boolean | undefined {
  return chosen === defaultOn ? undefined : chosen;
}

/** 이 일정이 실제로 목소리로 울릴 조건이면 녹음 경로, 아니면 null */
export function voiceUriOf(r: VoiceCapable | null | undefined): string | null {
  if (!VOICE_ALARM.enabled) return null;
  if (!r || !voiceAlarmOn(r) || !r.uri) return null;
  if (r.alarmMode === 'vibe') return null;
  return r.uri;
}

/**
 * 예약 직전에 호출. 목소리로 울릴 일정이면 준비하고, 아니면 이전에 걸어 둔 것을 지운다.
 * 반환값은 iOS 알림에 넣을 소리 파일 이름(없으면 null → 기본 알람음). 어떤 실패도 기본 알람음으로 떨어진다.
 */
export async function prepareVoiceAlarm(recordId: string, voiceUri: string | null | undefined): Promise<string | null> {
  const baseId = recordId.split('#')[0]; // 미리 알림(id#preN)도 같은 일정의 소리를 쓴다
  if (!VOICE_ALARM.enabled) voiceUri = null; // 꺼져 있으면 항상 기본 알람음(예전에 걸어 둔 것도 지운다)
  if (Platform.OS === 'android') {
    setNativeAlarmVoice(baseId, voiceUri || null);
    return null;
  }
  const native = iosNative();
  if (!native) return null;
  const name = soundName(baseId);
  try {
    if (!voiceUri) { native.removeSound(name); return null; }
    if (native.hasSound(name)) return `${name}.wav`; // 일정의 메인 녹음은 바뀌지 않으므로 한 번만 만든다
    return await native.makeSound(voiceUri, name, VOICE_ALARM_MAX_SEC);
  } catch (e) {
    console.warn('목소리 알람 소리 준비 실패:', e);
    return null;
  }
}

/** 일정을 지울 때 */
export function removeVoiceAlarm(recordId: string): void {
  if (Platform.OS === 'android') { setNativeAlarmVoice(recordId, null); return; }
  try { iosNative()?.removeSound(soundName(recordId)); } catch {}
}

/** 전체 재동기화 시작 때: 남아 있는 것을 정리한다 (keepIds = 목소리로 울릴 일정들) */
export function resetVoiceAlarms(keepIds: string[]): void {
  if (Platform.OS === 'android') { clearNativeAlarmVoices(); return; }
  try { iosNative()?.pruneSounds(keepIds.map(soundName)); } catch {}
}
