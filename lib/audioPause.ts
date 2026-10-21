// ─── 재생기 멈춤과 오디오 세션 꺼짐 ─────────────────────────────────────────────
// expo-audio(iOS)는 플레이어를 pause()할 때마다 0.1초 뒤 오디오 세션을 끈다(그때 재생 중인 플레이어가 없으면).
// 세이람은 녹음·읽어 주기를 시작하기 직전에 늘 재생기를 멈췄는데, 재생 중이 아닐 때도 멈춰서
// 0.1초 뒤 세션이 꺼지며 막 켠 녹음기·읽어 주기(TTS)가 같이 꺼졌다 — 타이밍에 따라 되다 안 되다 했다
// (2026-10-21 폰: 녹음 파일 속 소리 0.07초, ▶ 읽어 주기가 눌러도 안 나다가 나다가).
// 그래서 ① 실제로 재생 중일 때만 멈추고 ② 멈췄으면 세션이 꺼진 뒤에 녹음·읽기를 시작한다.

import { Platform } from 'react-native';

/** expo-audio의 0.1초 지연 + 여유 */
export const AUDIO_SETTLE_MS = 250;

let lastPauseAt = 0;

/** 재생 중일 때만 멈춘다. knownPlaying: 재생을 막 요청해 아직 '재생 중'으로 안 바뀐 경우(우리 쪽 상태) */
export function pauseIfPlaying(player: { playing: boolean; pause: () => void }, knownPlaying = false): boolean {
  let playing = knownPlaying;
  try { playing = playing || !!player.playing; } catch {}
  if (!playing) return false;
  try { player.pause(); } catch {}
  lastPauseAt = Date.now();
  return true;
}

/** 방금 재생기를 멈췄으면 세션이 꺼질 때까지 기다린다 (아니면 바로 끝난다) */
export function waitAudioSettled(now: () => number = Date.now, os: string = Platform.OS): Promise<void> {
  if (os !== 'ios') return Promise.resolve(); // Android의 pause는 세션을 끄지 않는다
  const left = lastPauseAt + AUDIO_SETTLE_MS - now();
  return left > 0 ? new Promise((r) => setTimeout(r, left)) : Promise.resolve();
}
