// 재생기를 괜히 멈추면 0.1초 뒤 iOS 오디오 세션이 꺼져 막 켠 녹음·읽어 주기가 끊긴다 (2026-10-21 폰)
import { AUDIO_SETTLE_MS, pauseIfPlaying, waitAudioSettled } from '../audioPause';

const makePlayer = (playing: boolean) => ({ playing, pause: jest.fn() });

test('재생 중이 아니면 멈추지 않는다 (세션을 끄는 pause를 부르지 않음)', () => {
  const p = makePlayer(false);
  expect(pauseIfPlaying(p)).toBe(false);
  expect(p.pause).not.toHaveBeenCalled();
});

test('재생 중이면 멈추고, 재생을 막 요청해 아직 재생 중이 아닌 경우(knownPlaying)도 멈춘다', () => {
  const a = makePlayer(true);
  expect(pauseIfPlaying(a)).toBe(true);
  expect(a.pause).toHaveBeenCalledTimes(1);
  const b = makePlayer(false);
  expect(pauseIfPlaying(b, true)).toBe(true);
  expect(b.pause).toHaveBeenCalledTimes(1);
});

test('멈춘 직후에는 세션이 꺼질 때까지 기다리고, 시간이 지났으면 바로 끝난다', async () => {
  let now = 10_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  pauseIfPlaying(makePlayer(true));
  let done = false;
  const w = waitAudioSettled(() => now).then(() => { done = true; });
  await Promise.resolve();
  expect(done).toBe(false);
  await new Promise((r) => setTimeout(r, AUDIO_SETTLE_MS + 30));
  await w;
  expect(done).toBe(true);
  now += AUDIO_SETTLE_MS + 1;
  let quick = false;
  await waitAudioSettled(() => now).then(() => { quick = true; });
  expect(quick).toBe(true);
  jest.restoreAllMocks();
});
