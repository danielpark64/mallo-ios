// ─── 달력 화면 확대 계산 (사진처럼 두 손가락으로) ───────────────────────────────────
// 2026-10-18 사용자: "칸이 넓어지는 게 아니고, 날짜를 누르지 않고 화면을 확대해서 작은 글씨를 보고 싶다".
// 변환은 왼쪽 위 기준(transformOrigin 'left top'): 화면 위치 = t + s × 내용 위치.
// 확대 중 손가락 중심이 가리키던 내용이 손가락 아래에 그대로 남도록 t를 다시 계산한다.

export type Zoom = { s: number; tx: number; ty: number };
export const ZOOM_MAX = 3;
type Pt = { x: number; y: number };

/** 화면 밖으로 밀려나지 않게: tx ∈ [W(1-s), 0], ty ∈ [H(1-s), 0] */
export function clampZoom(z: Zoom, W: number, H: number): Zoom {
  const s = Math.min(ZOOM_MAX, Math.max(1, z.s));
  if (s === 1) return { s: 1, tx: 0, ty: 0 };
  const tx = Math.min(0, Math.max(W * (1 - s), z.tx));
  const ty = Math.min(0, Math.max(H * (1 - s), z.ty));
  return { s, tx: tx === 0 ? 0 : tx, ty: ty === 0 ? 0 : ty };
}

/** 두 손가락: 시작 때 상태·중심(f0) → 지금 중심(f1)과 거리 비율(ratio) */
export function pinchZoom(start: Zoom, f0: Pt, f1: Pt, ratio: number, W: number, H: number): Zoom {
  const s = Math.min(ZOOM_MAX, Math.max(1, start.s * ratio));
  // 시작 때 손가락 아래 있던 내용 위치
  const qx = (f0.x - start.tx) / start.s;
  const qy = (f0.y - start.ty) / start.s;
  return clampZoom({ s, tx: f1.x - s * qx, ty: f1.y - s * qy }, W, H);
}

/** 확대한 상태에서 한 손가락으로 옆으로 밀기(위아래는 목록 스크롤) */
export function panZoom(start: Zoom, dx: number, W: number, H: number): Zoom {
  return clampZoom({ ...start, tx: start.tx + dx }, W, H);
}
