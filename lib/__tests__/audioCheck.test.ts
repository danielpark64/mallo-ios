// 녹음 파일이 "있지만 소리가 없는" 상태를 저장 직전에 잡아내는 검사.
// 2026-10-18 폰: 11월 일정 2건의 m4a가 57KB인데 실제 소리(mdat)는 62바이트(0.2초) — ▶를 눌러도 아무 소리도 안 났다.
import { mdatBytes, isRecordingEmpty } from '../audioCheck';

/** MP4 상자(atom) 하나: 크기 4바이트 + 이름 4바이트 + 내용 */
function atom(name: string, payloadLen: number): Uint8Array {
  const b = new Uint8Array(8 + payloadLen);
  new DataView(b.buffer).setUint32(0, 8 + payloadLen);
  for (let i = 0; i < 4; i++) b[4 + i] = name.charCodeAt(i);
  return b;
}
function file(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const reader = (b: Uint8Array) => (offset: number, len: number) => b.slice(offset, offset + len);

test('폰에서 나온 깨진 녹음 구조(ftyp·moov·free 56KB·mdat 62B)는 소리 54바이트로 읽는다', () => {
  const broken = file(atom('ftyp', 20), atom('moov', 581), atom('free', 56711), atom('mdat', 54));
  expect(broken.length).toBe(57398); // 폰 파일과 같은 크기
  expect(mdatBytes(reader(broken), broken.length)).toBe(54);
});

test('정상 녹음(소리 13만 바이트)은 그대로 읽는다', () => {
  const ok = file(atom('ftyp', 20), atom('moov', 2401), atom('free', 54891), atom('mdat', 132483));
  expect(mdatBytes(reader(ok), ok.length)).toBe(132483);
});

test('MP4가 아니거나 상자 크기가 엉망이면 판단하지 않는다(null) — 멀쩡한 녹음을 버리지 않기 위해', () => {
  const junk = new Uint8Array(100).fill(7);
  expect(mdatBytes(reader(junk), junk.length)).toBeNull();
  expect(mdatBytes(reader(new Uint8Array(0)), 0)).toBeNull();
});

test('mdat가 여러 개면 합친다', () => {
  const two = file(atom('ftyp', 20), atom('mdat', 3000), atom('moov', 100), atom('mdat', 2000));
  expect(mdatBytes(reader(two), two.length)).toBe(5000);
});

test('1초 넘게 말했는데 소리가 1KB도 안 되면 빈 녹음', () => {
  expect(isRecordingEmpty(54, 6)).toBe(true);
  expect(isRecordingEmpty(54, 9)).toBe(true);
  expect(isRecordingEmpty(132483, 10)).toBe(false);
  // 조용히 짧게 말한 정상 녹음까지 버리지 않도록 기준은 아주 낮게
  expect(isRecordingEmpty(4000, 2)).toBe(false);
  // 판단 불가(null)·1초 미만은 빈 녹음으로 보지 않는다
  expect(isRecordingEmpty(null, 9)).toBe(false);
  expect(isRecordingEmpty(54, 0)).toBe(false);
});
