// ─── 녹음 파일 검사: "파일은 있는데 소리가 없는" 녹음을 저장 직전에 잡는다 ──────────────
// 2026-10-18 폰: 녹음 도중 오디오 세션이 바뀌어 녹음기가 0.2초 만에 멈췄는데도 파일(57KB, 대부분 빈 칸)이
// 만들어져 그대로 저장됐다 → ▶를 눌러도 무음. 같은 증상이 다시 와도 조용히 넘어가지 않도록
// 저장 전에 MP4(m4a) 안의 실제 소리 상자(mdat) 크기를 읽어 본다.
import { File } from 'expo-file-system';

/** offset부터 len바이트를 돌려주는 읽기 함수 (실제 파일·테스트용 배열 모두 같은 모양) */
export type ByteReader = (offset: number, len: number) => Uint8Array;

/** MP4 최상위 상자를 훑어 mdat(소리 데이터) 내용 바이트 합을 돌려준다. MP4가 아니면 null(판단 안 함) */
export function mdatBytes(read: ByteReader, size: number): number | null {
  if (size < 16) return null;
  let offset = 0;
  let total = 0;
  let sawFtyp = false;
  let guard = 0;
  while (offset + 8 <= size && guard++ < 64) {
    const h = read(offset, 16);
    if (h.length < 8) return null;
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let boxSize = dv.getUint32(0);
    const name = String.fromCharCode(h[4], h[5], h[6], h[7]);
    let header = 8;
    if (boxSize === 1) {
      if (h.length < 16) return null;
      boxSize = Number(dv.getBigUint64(8));
      header = 16;
    } else if (boxSize === 0) {
      boxSize = size - offset; // 파일 끝까지
    }
    if (boxSize < header || offset + boxSize > size) return null; // 상자 크기가 엉망 → 판단하지 않는다
    if (offset === 0) {
      if (name !== 'ftyp') return null;
      sawFtyp = true;
    }
    if (name === 'mdat') total += boxSize - header;
    offset += boxSize;
  }
  return sawFtyp ? total : null;
}

/** 1초 넘게 녹음했는데 소리가 1KB도 안 되면 빈 녹음. 조용한 정상 녹음을 버리지 않도록 기준은 아주 낮게 둔다 */
export function isRecordingEmpty(mdat: number | null, durationSec: number): boolean {
  if (mdat == null || durationSec < 1) return false;
  return mdat < 1000;
}

/** 실제 녹음 파일 검사. 읽다가 실패하면 판단하지 않는다(false) — 멀쩡한 녹음을 버리는 쪽이 더 나쁘다 */
export function recordedFileIsEmpty(uri: string, durationSec: number): boolean {
  try {
    const f = new File(uri);
    if (!f.exists) return false;
    const size = f.size ?? 0;
    const handle = f.open();
    try {
      const read: ByteReader = (offset, len) => {
        handle.offset = offset;
        return handle.readBytes(Math.min(len, Math.max(0, size - offset)));
      };
      return isRecordingEmpty(mdatBytes(read, size), durationSec);
    } finally {
      try { handle.close(); } catch {}
    }
  } catch {
    return false;
  }
}
