// ─── 음성 인식이 "아예 못 쓰는" 오류인가 ─────────────────────────────────────────
// 아이폰은 Siri·받아쓰기가 꺼져 있으면 인식기가 'service-not-allowed'(Recognizer is unavailable)로 거절한다.
// 이때 다시 시도해도 계속 거절되므로(0.2초마다 재시작 → 폰에 부담, "준비 중…"에서 멈춘 것처럼 보임 — 2026-10-21 폰)
// 재시도를 멈추고 화면에 설정 방법을 알린다. Mac의 iPhone 미러링이 연결돼 있어도 같은 오류가 난다(2026-10-21 원인).
// 글이 비면 일정이 저장되지 않으므로 '녹음은 저장된다'고 약속하지 않는다.
const BLOCKED = new Set(['service-not-allowed', 'not-allowed', 'language-not-supported']);

export function isSttBlockedError(code: string | undefined | null): boolean {
  return !!code && BLOCKED.has(code);
}

/** 음성 인식을 못 쓸 때 녹음 화면에 보여 줄 안내(번역 키) — iOS는 확인할 설정과 미러링까지 */
export function sttBlockedNotice(os: string): string {
  return os === 'ios'
    ? '음성 인식을 쓸 수 없어요. 설정 › 일반 › 키보드 › 받아쓰기가 켜져 있는지 확인해 주세요. Mac의 iPhone 미러링이 연결돼 있으면 마이크를 쓸 수 없어요.'
    : '음성 인식을 쓸 수 없어요. 잠시 후 다시 해 보세요.';
}
