// ─── 일정에 사진·파일 붙이기 ───────────────────────────────────────────────────
// 원본을 앱 안으로 복사하지 않는다(저장 공간 최소 규칙). 네이티브 모듈(modules/sayram-attach)이
// 고른 항목의 위치만 돌려주고, 미리보기는 메모리에서만 만든다(디스크 캐시 없음).
//   Android: content:// 위치 + 영구 열람 권한 — 첨부를 빼거나 일정을 지우면 권한을 반납한다
//   iOS: 사진은 사진 보관함 id(보려면 사진 접근 권한), 파일은 보안 북마크
// 다른 폰으로 백업을 옮기면 위치가 맞지 않아 열리지 않는다(백업 화면에 안내).
// 예외: 붙여넣은 이미지("app:")는 원본이 없으니 줄인 JPEG 한 장을 mallo 폴더에 두고 백업에도 넣는다.
// 메모·링크("txt:")는 글을 첨부 안에 그대로 담는다(네이티브를 거치지 않는다).
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
  /** 클립보드 이미지를 긴 변 px로 줄여 mallo 폴더에 JPEG로 저장. 이미지가 없으면 null */
  saveClipboardImage?(px: number): Promise<ClipImage | null>;
  /** 사진 첨부에서 글자 인식(폰 안에서만). lang = 앱 언어 */
  recognizeText?(ref: string, lang: string): Promise<OcrResult>;
};
type ClipImage = { ref: string; name: string; size?: number | null; mime?: string | null };
export type OcrResult = { status: 'ok' | 'empty' | 'notReady' | 'failed'; text: string };
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

/** 메모·링크 — 글만 있고 열 원본이 없는 첨부 */
export const isMemo = (a: Pick<Attachment, 'kind'>) => a.kind === 'text' || a.kind === 'link';

/** 붙여넣은 이미지 파일 이름 모양 — records.json·녹음(rec_*.m4a)은 절대 여기에 걸리지 않는다 */
export const CLIP_FILE_RE = /^clip_\d+\.jpg$/;

/** 붙여넣은 이미지("app:clip_<숫자>.jpg")면 그 파일 이름. 다른 이름은 지우기·백업·복원에서 무시 */
export function appFileName(ref: string): string | null {
  if (!ref.startsWith('app:')) return null;
  const n = ref.slice(4);
  return CLIP_FILE_RE.test(n) ? n : null;
}

// 지금 미리보기에 띄운(아직 저장 안 한) 첨부 — 남는 clip 정리에서 빼 준다
let heldRefs = new Set<string>();
export function holdClipRefs(refs: string[]) { heldRefs = new Set(refs.filter((r) => !!appFileName(r))); }
export const clipRefsInUse = () => heldRefs;

export const CLIP_KEEP_MS = 10 * 60_000;

/** 지울 clip 파일 이름 — 어느 일정에도 없고, 미리보기에 쓰지 않고, 만든 지 10분 지난 것만(시각을 모르면 남김) */
export function orphanClipNames(
  files: { name: string; mtime?: number | null }[], records: ScheduleRecord[], inUse: Set<string>, now = Date.now(),
): string[] {
  const used = new Set<string>();
  for (const r of records) for (const a of r.attachments ?? []) { const n = appFileName(a.ref); if (n) used.add(n); }
  for (const ref of inUse) { const n = appFileName(ref); if (n) used.add(n); }
  return files
    .filter((f) => CLIP_FILE_RE.test(f.name) && !used.has(f.name) && f.mtime != null && f.mtime > 0 && now - f.mtime >= CLIP_KEEP_MS)
    .map((f) => f.name);
}

export async function thumbnailOf(a: Attachment, px = 160): Promise<string | null> {
  if (isMemo(a)) return null;
  try { return (await native?.thumbnail(a.ref, px)) ?? null; } catch { return null; }
}

export async function loadImageOf(a: Attachment, px = 1600): Promise<string | null> {
  try { return (await native?.loadImage(a.ref, px)) ?? null; } catch { return null; }
}

export async function attachmentExists(a: Attachment): Promise<boolean> {
  if (isMemo(a)) return true;
  try { return !!(await native?.exists(a.ref)); } catch { return false; }
}

/** 파일을 다른 앱(Android) / 미리보기(iOS)로 연다. 못 열면 false */
export async function openAttachment(a: Attachment): Promise<boolean> {
  if (isMemo(a)) return false;
  try { return !!(await native?.open(a.ref, a.mime ?? null)); } catch { return false; }
}

/** 클립보드 이미지를 사진 첨부로 — 기존 사진 크게 보기와 같은 긴 변(1600)으로 줄여 한 장만 저장 */
export async function saveClipboardImage(now = Date.now()): Promise<Attachment | null> {
  if (!native?.saveClipboardImage) return null;
  try {
    const r = await native.saveClipboardImage(CLIP_IMAGE_PX);
    if (!r?.ref || !appFileName(r.ref)) return null;
    return { ref: r.ref, kind: 'photo', name: r.name || '', size: r.size ?? null, mime: r.mime ?? 'image/jpeg', addedAt: now };
  } catch { return null; }
}
export const CLIP_IMAGE_PX = 1600;

export const ocrSupported = () => !!native?.recognizeText;

/** 사진 첨부의 글자를 폰 안에서 읽는다. Android는 Play 서비스 모델이 아직 없으면 notReady */
export async function recognizeText(a: Attachment, lang: string): Promise<OcrResult> {
  if (!native?.recognizeText || a.kind !== 'photo') return { status: 'failed', text: '' };
  try {
    const r = await native.recognizeText(a.ref, lang);
    const text = (r?.text ?? '').trim();
    if (r?.status === 'notReady' || r?.status === 'failed') return { status: r.status, text: '' };
    return text ? { status: 'ok', text } : { status: 'empty', text: '' };
  } catch { return { status: 'failed', text: '' }; }
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

/** 빠진 첨부의 영구 열람 권한 반납(Android, 앱당 개수 제한이 있다). iOS는 할 일 없음. 붙여넣은 이미지 파일은 지운다 */
export function releaseUnused(removed: Attachment[], remaining: ScheduleRecord[]) {
  if (!native) return;
  // 메모·링크는 반납할 것이 없다. 붙여넣은 이미지("app:")는 네이티브가 그 파일을 지운다
  // "app:"인데 clip 이름이 아니면(records.json 등) 넘기지 않는다
  const ok = removed.filter((a) => !isMemo(a) && (!a.ref.startsWith('app:') || !!appFileName(a.ref)));
  for (const ref of unusedRefs(ok, remaining)) {
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
