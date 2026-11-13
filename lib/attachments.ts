// ─── 일정에 사진·파일 붙이기 ───────────────────────────────────────────────────
// 원본을 앱 안으로 복사하지 않는다(저장 공간 최소 규칙). 네이티브 모듈(modules/sayram-attach)이
// 고른 항목의 위치만 돌려주고, 미리보기는 메모리에서만 만든다(디스크 캐시 없음).
//   Android: content:// 위치 + 영구 열람 권한 — 첨부를 빼거나 일정을 지우면 권한을 반납한다
//   iOS: 사진은 사진 보관함 id(보려면 사진 접근 권한), 파일은 보안 북마크
// 다른 폰으로 백업을 옮기면 위치가 맞지 않아 열리지 않는다(백업 화면에 안내).
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { Attachment, ScheduleRecord } from './storage';

export const MAX_ATTACHMENTS = 20;

type PickResult = { items: Omit<Attachment, 'addedAt'>[]; denied?: boolean; hidden?: number; limited?: boolean };
type Native = {
  pick(kind: 'photo' | 'file', max: number): Promise<PickResult>;
  thumbnail(ref: string, px: number): Promise<string | null>;
  loadImage(ref: string, px: number): Promise<string | null>;
  exists(ref: string): Promise<boolean>;
  open(ref: string, mime: string | null): boolean | Promise<boolean>;
  release(ref: string): void;
  photoAccess?(): string;
};
const native = requireOptionalNativeModule<Native>('SayramAttach');

export const attachSupported = () => !!native;

/** iOS 사진 접근 상태(authorized·limited·denied·notDetermined). Android는 'authorized' */
export function photoAccess(): string {
  try { return native?.photoAccess?.() ?? 'authorized'; } catch { return 'authorized'; }
}

/** 사진·파일 고르기. 고른 게 없으면 빈 목록. iOS 사진 권한을 거절했으면 denied */
export async function pickAttachments(kind: 'photo' | 'file', room: number, now = Date.now()): Promise<{ items: Attachment[]; denied: boolean; hidden: number }> {
  if (!native || room <= 0) return { items: [], denied: false, hidden: 0 };
  const r = await native.pick(kind, Math.min(room, 10));
  return {
    items: (r?.items ?? []).filter((x) => !!x?.ref).map((x, i) => ({ ...x, addedAt: now + i })),
    denied: !!r?.denied,
    hidden: r?.hidden ?? 0,
  };
}

export async function thumbnailOf(a: Attachment, px = 160): Promise<string | null> {
  try { return (await native?.thumbnail(a.ref, px)) ?? null; } catch { return null; }
}

export async function loadImageOf(a: Attachment, px = 1600): Promise<string | null> {
  try { return (await native?.loadImage(a.ref, px)) ?? null; } catch { return null; }
}

export async function attachmentExists(a: Attachment): Promise<boolean> {
  try { return !!(await native?.exists(a.ref)); } catch { return false; }
}

/** 파일을 다른 앱(Android) / 미리보기(iOS)로 연다. 못 열면 false */
export async function openAttachment(a: Attachment): Promise<boolean> {
  try { return !!(await native?.open(a.ref, a.mime ?? null)); } catch { return false; }
}

// ── 순수 함수(테스트) ──────────────────────────────────────────────────────────

/** 새로 고른 것을 붙인다 — 이미 붙은 것은 빼고, 최대 개수까지만 */
export function addAttachments(list: Attachment[] | undefined, picked: Attachment[]): Attachment[] {
  const cur = list ?? [];
  const have = new Set(cur.map((a) => a.ref));
  const fresh = picked.filter((a) => !have.has(a.ref) && (have.add(a.ref), true));
  return [...cur, ...fresh].slice(0, MAX_ATTACHMENTS);
}

/** 이 첨부들 중 남은 일정 어디에도 쓰이지 않는 위치만 — 같은 사진을 두 일정에 붙였으면 권한을 반납하면 안 된다 */
export function unusedRefs(removed: Attachment[], remaining: ScheduleRecord[]): string[] {
  const used = new Set(remaining.flatMap((r) => (r.attachments ?? []).map((a) => a.ref)));
  return [...new Set(removed.map((a) => a.ref))].filter((ref) => !used.has(ref));
}

/** 빠진 첨부의 영구 열람 권한 반납(Android, 앱당 개수 제한이 있다). iOS는 할 일 없음 */
export function releaseUnused(removed: Attachment[], remaining: ScheduleRecord[]) {
  if (!native) return;
  for (const ref of unusedRefs(removed, remaining)) {
    try { native.release(ref); } catch { /* 이미 없는 권한 */ }
  }
}

/** 크기 표시 "1.2 MB" */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || !(bytes >= 0)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
