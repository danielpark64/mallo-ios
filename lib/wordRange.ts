// ─── 단어칩 범위선택 순수 로직 (상세 화면 구간재생용) ───────────────────────────────
// 손가락 위치 → 칩 인덱스 변환, 범위 정규화/확장. UI와 분리해 단위 테스트 가능하게 둔다.
import type { TranscriptSegment } from './storage';

export type ChipLayout = { x: number; y: number; width: number; height: number };
export type WordRange = { start: number; end: number };

/**
 * 손가락 위치(칩 컨테이너 기준 좌표)에 해당하는 칩 인덱스.
 * - 칩 안이면 그 칩
 * - 같은 줄의 칩 사이 여백이면 가장 가까운 칩 (끌기 중 손가락이 칩 사이에 머물러도 선택이 끊기지 않게)
 * - 어느 줄에도 걸치지 않으면 null
 */
export function findChipAt(
  layouts: ReadonlyArray<ChipLayout | undefined>,
  x: number,
  y: number,
  slop = 6,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  layouts.forEach((l, idx) => {
    if (!l) return;
    const inRow = y >= l.y - slop && y <= l.y + l.height + slop;
    if (!inRow) return;
    const dist = x < l.x ? l.x - x : x > l.x + l.width ? x - (l.x + l.width) : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
  });
  return best;
}

/** 두 인덱스를 start ≤ end 순서로 */
export function normalizeRange(a: number, b: number): WordRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** 기존 범위 밖의 단어를 탭하면 그쪽으로 확장, 안쪽이면 그대로 */
export function extendRange(range: WordRange, idx: number): WordRange {
  if (idx < range.start) return { start: idx, end: range.end };
  if (idx > range.end) return { start: range.start, end: idx };
  return range;
}

/** 범위에 해당하는 단어들을 공백으로 이어 붙인 미리보기 문자열 */
export function rangeText(segments: ReadonlyArray<TranscriptSegment>, range: WordRange): string {
  return segments
    .slice(range.start, range.end + 1)
    .map((s) => s.segment)
    .join(' ');
}

/** "지금까지 시작된 마지막 단어" — 단어 사이 발음 공백에서도 하이라이트가 끊기지 않게 */
export function activeSegmentIndex(
  segments: ReadonlyArray<TranscriptSegment>,
  currentMs: number,
): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (currentMs >= segments[i].startTimeMillis) return i;
  }
  return -1;
}

/**
 * 단어 타임스탬프가 쓸 만한지. iOS 음성인식이 단어별 시각을 안 주는 경우가 있어(모든 단어가 같은
 * 시작 시각, 길이 0 — 2026-10-12 폰 녹음 4건 중 3건) 그대로 쓰면 하이라이트가 마지막 단어에 고정되고
 * 단어 탭이 0초 구간을 재생해 아무 소리도 안 난다. 길이가 양수인 단어가 절반 이상이어야 쓸 만한 것으로 본다.
 */
export function hasUsableTimestamps(segments: ReadonlyArray<TranscriptSegment>): boolean {
  if (segments.length === 0) return false;
  const withLength = segments.filter((s) => s.endTimeMillis > s.startTimeMillis).length;
  return withLength * 2 >= segments.length;
}

/** [startMs, endMs] 구간을 글자 수 비례로 단어에 배분해 타임스탬프를 합성한다 (근사치) */
export function synthesizeSegmentTimes(
  segments: ReadonlyArray<TranscriptSegment>,
  startMs: number,
  endMs: number,
): TranscriptSegment[] {
  const span = Math.max(0, endMs - startMs);
  const weights = segments.map((s) => Math.max(1, s.segment.replace(/\s/g, '').length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = startMs;
  return segments.map((s, i) => {
    const d = (span * weights[i]) / total;
    const out = { ...s, startTimeMillis: Math.round(t), endTimeMillis: Math.round(t + d) };
    t += d;
    return out;
  });
}
