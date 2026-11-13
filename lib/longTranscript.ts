// ─── [LONGREC 시험판] 긴 녹음 받아쓰기 — 문단으로 쌓기 ──────────────────────────────
// 회의·강의처럼 긴 녹음은 글이 수천 자가 되므로, 한 덩어리 문자열로 계속 다시 만들지 않고
// "말한 시각 + 문단"으로 쌓는다. 인식기가 끊겨 다시 시작하거나(아이폰 약 1분, Android는 말이 멈출 때)
// 말이 잠깐 멈춘 뒤 부분 결과가 처음부터 다시 올 때마다 문단이 하나 끝난다.
// 일정 녹음의 lib/transcriptMerge.ts와 같은 원칙: 한 번 들은 말은 지우지 않는다.

export type LongPara = {
  /** 녹음 시작 기준, 이 문단을 말하기 시작한 시각(ms) */
  atMs: number;
  text: string;
};

export type LongState = {
  paras: LongPara[];
  /** 지금 말하는 중인 문단(아직 바뀔 수 있다) */
  current: string;
  currentAtMs: number;
};

export const emptyLong = (): LongState => ({ paras: [], current: '', currentAtMs: 0 });

const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();

/** 인식 결과는 말보다 조금 늦게 온다 — 문단 시각을 그만큼 당긴다 */
const RESULT_LAG_MS = 500;
const stamp = (nowMs: number) => Math.max(0, nowMs - RESULT_LAG_MS);

/**
 * 부분 결과가 "처음부터 다시" 온 것인가 — 말이 멈춘 뒤 인식기가 앞 문장을 버리고 새로 시작할 때.
 * 글이 절반 밑으로 줄고 첫머리도 다르면 새 문장으로 본다(인식기가 앞 단어를 고쳐 쓰는 것과 구분).
 */
export function isRestart(cur: string, next: string): boolean {
  if (cur.length < 12 || next.length >= cur.length * 0.5) return false;
  const head = next.slice(0, Math.min(6, next.length));
  return !cur.startsWith(head);
}

function commit(st: LongState, text: string, atMs: number): LongState {
  const cand = norm(text);
  if (!cand) return { ...st, current: '' };
  const paras = [...st.paras];
  const last = paras[paras.length - 1];
  if (last && last.text === cand) return { paras, current: '', currentAtMs: 0 };
  // 확정한 문단을 포함해 더 길게 다시 오면 그 문단을 바꿔 쓴다(중복 방지) — 시각은 먼저 것을 지킨다
  if (last && cand.startsWith(last.text)) {
    paras[paras.length - 1] = { atMs: last.atMs, text: cand };
  } else {
    paras.push({ atMs, text: cand });
  }
  return { paras, current: '', currentAtMs: 0 };
}

/** 부분 결과 */
export function longPartial(st: LongState, text: string, nowMs: number): LongState {
  const t = norm(text);
  if (!t) return st;
  if (!st.current) {
    // 방금 확정한 문단을 포함해 누적으로 다시 오면 그 문단을 되살려 이어 쓴다
    const last = st.paras[st.paras.length - 1];
    if (last && t.startsWith(last.text)) {
      return { paras: st.paras.slice(0, -1), current: t, currentAtMs: last.atMs };
    }
    return { ...st, current: t, currentAtMs: stamp(nowMs) };
  }
  if (isRestart(st.current, t)) {
    const done = commit(st, st.current, st.currentAtMs);
    return { ...done, current: t, currentAtMs: stamp(nowMs) };
  }
  return { ...st, current: t };
}

/** 확정 결과 — 마지막 조각만 담겨 오면(진행 중이던 글의 꼬리이거나 훨씬 짧으면) 진행 중이던 글을 확정한다 */
export function longFinal(st: LongState, text: string, nowMs: number): LongState {
  const f = norm(text);
  const cur = st.current;
  const tailOnly = !!cur && !!f && cur.length > f.length && (cur.endsWith(f) || f.length < cur.length * 0.7);
  const cand = !f ? cur : tailOnly ? cur : f;
  if (!cand) return st;
  return commit(st, cand, cur ? st.currentAtMs : stamp(nowMs));
}

/** 인식 세션이 끝났을 때(다시 시작하기 전·녹음 종료) — 진행 중이던 글을 확정한다 */
export function longSessionEnd(st: LongState): LongState {
  return st.current ? commit(st, st.current, st.currentAtMs) : st;
}

/** 화면·저장용 문단 목록(진행 중인 문단 포함) */
export function longParas(st: LongState): LongPara[] {
  return st.current ? [...st.paras, { atMs: st.currentAtMs, text: st.current }] : st.paras;
}

/** "5:07" / "1:02:33" */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function charCount(paras: LongPara[]): number {
  return paras.reduce((n, p) => n + p.text.length, 0);
}
