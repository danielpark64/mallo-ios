// ─── 알람 소리 고르기 (1.2.0) ─────────────────────────────────────────────────
// 순수 함수만(React Native·네이티브 import 금지, jest에서 그대로 돈다). 소리 표는 이 파일 한 곳이다.
//
// - 'default' = 지금까지 쓰던 소리(iOS alarm_long.wav / Android 네이티브 mallo_alarm.wav · Expo 채널 alarm_long.wav)
// - 나머지 6개 = 교대알람과 같은 CC0 소리를 29초 이하로 자른 파일
//     iOS:     앱 번들 snd_<id>.caf (IMA4, plugins/withIosAlarmSounds.js가 넣는다 — 알림 소리는 30초 이하만 됨)
//     Android: modules/mallo-alarm/android/src/main/res/raw/snd_<id>.m4a (네이티브 AlarmTones.kt가 같은 표를 가진다)
// - 일정의 alarmSound가 없으면 설정의 기본 소리를 따른다(설정을 바꾸면 resyncAlarms로 모두 다시 건다).
// - 진동만(vibe) 일정은 소리와 무관하게 지금 경로 그대로(무음).

export const TONE_IDS = ['digital_beep', 'bell_march', 'old_clock', 'marimba', 'gentle_piano', 'music_box'] as const;
export type ToneId = (typeof TONE_IDS)[number];
export type SoundId = 'default' | ToneId;
export const SOUND_IDS: readonly SoundId[] = ['default', ...TONE_IDS];

/** 화면 이름(키 = 한국어 원문, lib/i18n/sound.ts가 번역) */
export const SOUND_LABEL: Record<SoundId, string> = {
  default: '세이람 기본음',
  digital_beep: '디지털 비프',
  bell_march: '종소리 행진',
  old_clock: '옛날 자명종',
  marimba: '마림바',
  gentle_piano: '잔잔한 피아노',
  music_box: '오르골 왈츠',
};

export function isSoundId(x: unknown): x is SoundId {
  return typeof x === 'string' && (SOUND_IDS as readonly string[]).includes(x);
}

// 설정의 기본 소리 — 앱 시작·설정 변경 때 App이 넣어 준다(voiceAlarm.setVoiceAlarmDefault와 같은 방식)
let defaultSound: SoundId = 'default';
export function setDefaultAlarmSound(id: string | null | undefined): void {
  defaultSound = isSoundId(id) ? id : 'default';
}
export function getDefaultAlarmSound(): SoundId {
  return defaultSound;
}

/** 이 일정이 실제로 울릴 소리: 일정에 따로 고른 값(알 수 없는 값이면 무시) → 설정 기본 → 'default' */
export function resolveAlarmSound(recordSound?: string | null, def: SoundId = defaultSound): SoundId {
  if (isSoundId(recordSound)) return recordSound;
  return isSoundId(def) ? def : 'default';
}

/** iOS 알림·AlarmKit에 넘길 앱 번들 소리 파일 이름 */
export function iosSoundFile(id: SoundId): string {
  return id === 'default' ? 'alarm_long.wav' : `snd_${id}.caf`;
}

/** Android Expo 채널 소리(res/raw 이름으로 찾는다 — 확장자는 무시됨) */
export function androidSoundFile(id: SoundId): string {
  return id === 'default' ? 'alarm_long.wav' : `snd_${id}.m4a`;
}

/**
 * Android Expo 알림 채널 id — 채널은 한 번 만들면 소리가 고정되므로 모드 × 소리마다 따로 둔다.
 * 규칙: 진동만 = 'alarm_vibe'(소리 없음, 소리와 무관하게 하나) · 기본 소리 = 예전 그대로 'alarm_both'/'alarm_sound'
 *       · 고른 소리 = 'alarm_both_<id>'/'alarm_sound_<id>' (예: alarm_both_marimba). 옛 채널 3개는 그대로 쓴다.
 */
export function androidChannelId(mode: 'both' | 'sound' | 'vibe', id: SoundId): string {
  if (mode === 'vibe') return 'alarm_vibe';
  return id === 'default' ? `alarm_${mode}` : `alarm_${mode}_${id}`;
}

/** 미리듣기 재생 소스: Android는 res/raw 이름(expo-audio가 scheme 없는 이름을 raw 리소스로 찾는다), iOS는 번들 파일 이름 */
export function previewName(id: SoundId, os: string): string {
  if (os === 'android') return id === 'default' ? 'alarm_long' : `snd_${id}`;
  return iosSoundFile(id);
}

/** 일정 소리 고르기 목록: '기본(설정을 따름)' 뒤에 소리들. 설정이 '세이람 기본음'이 아니면 그 소리도 따로 고를 수 있게 넣는다 */
export function recordSoundChoices(def: SoundId): SoundId[] {
  return def === 'default' ? [...TONE_IDS] : ['default', ...TONE_IDS];
}
