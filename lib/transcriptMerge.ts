// ─── 음성 인식 결과 이어 붙이기 ───────────────────────────────────────────────
// 인식기는 결과를 여러 방식으로 준다(기기·OS·언어마다 다름, 2026-10-13 32 실측):
//  - 부분 결과(partial): 지금까지 말한 것을 누적해서 계속 다시 준다.
//  - 확정 결과(final): 한 문장을 여러 조각으로 나눠 **마지막 조각만** 담아 줄 때가 있다
//      예) partial "dentist tomorrow at 3:00 p.m. remind me 30 minutes before"
//          final   "remind me 30 minutes before"   ← 앞 조각(날짜)이 빠짐
//  - 말이 끝난 뒤 조용하면 빈 결과가 온다.
// 예전 코드는 매번 마지막 결과로 화면 글을 덮어써서, 확정 결과가 오면 앞 문장이 사라지고
// 말을 마친 뒤 몇 초 기다리면 글이 통째로 비었다("인식 실패"). 여기서는 한 번 들은 말은 절대 지우지 않는다.

export type MergeState = { committed: string[]; current: string };

export const emptyMerge = (): MergeState => ({ committed: [], current: '' });

const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();

/** 화면에 보여줄 전체 글 */
export function mergedText(st: MergeState): string {
  return [...st.committed, st.current].filter(Boolean).join(' ');
}

/** 부분 결과: 빈 결과는 무시. 이미 확정한 말을 포함해 누적으로 다시 오면 그 확정분을 대체한다(중복 방지). */
export function applyPartial(st: MergeState, text: string): MergeState {
  const t = norm(text);
  if (!t) return st;
  const committed = [...st.committed];
  const last = committed[committed.length - 1];
  if (last && t.startsWith(last)) committed.pop();
  return { committed, current: t };
}

/** 확정 결과: 마지막 조각만 담겨 왔으면(진행 중이던 누적 글의 꼬리이거나 훨씬 짧으면) 누적 글을 확정한다. */
export function applyFinal(st: MergeState, text: string): MergeState {
  const f = norm(text);
  const cur = st.current;
  const tailOnly = !!cur && !!f && cur.length > f.length && (cur.endsWith(f) || f.length < cur.length * 0.7);
  const cand = !f ? cur : tailOnly ? cur : f;
  if (!cand) return st;
  const committed = [...st.committed];
  const last = committed[committed.length - 1];
  if (last === cand) return { committed, current: '' };
  if (last && cand.startsWith(last)) committed.pop();
  committed.push(cand);
  return { committed, current: '' };
}

/** 인식 세션이 끝나 다시 시작될 때: 진행 중이던 부분 결과를 확정해 둔다 */
export function applySessionEnd(st: MergeState): MergeState {
  return st.current ? applyFinal(st, st.current) : st;
}
