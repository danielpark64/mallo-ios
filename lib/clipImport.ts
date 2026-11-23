// ─── 복사한 것 붙이기 ──────────────────────────────────────────────────────────
// 버튼을 누를 때만 클립보드를 읽는다(앱이 앞에 올 때 자동으로 읽지 않는다 — iOS 붙여넣기 허락 창이 남발되지 않게).
// 이미지 → 사진 첨부(줄인 한 장), URL 한 줄 → 링크 첨부, 글 → 메모 첨부, 비었으면 empty.
import * as Clipboard from 'expo-clipboard';
import type { Attachment } from './storage';

export type ClipContent =
  | { kind: 'image' }
  | { kind: 'link'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'empty' };

/** 메모로 남기는 글의 최대 길이 — 긴 메일을 통째로 붙여도 일정 파일이 커지지 않게 */
export const MAX_MEMO_CHARS = 5000;

const URL_RE = /^https?:\/\/[^\s<>"]+$/i;

/** 공백 없는 http(s) 주소 한 줄인가 */
export function isSingleUrl(s: string): boolean {
  const v = s.trim();
  return v.length <= 2048 && URL_RE.test(v);
}

/** 붙인 글 정리: 줄바꿈 통일, 보이지 않는 글자 제거, 앞뒤 공백, 길이 제한 */
export function cleanClipText(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_MEMO_CHARS);
}

/** 클립보드 상태 → 붙일 종류. 이미지가 먼저, 다음이 URL 한 줄, 그다음 글 */
export function classifyClip(p: { hasImage?: boolean; url?: string | null; text?: string | null }): ClipContent {
  if (p.hasImage) return { kind: 'image' };
  const text = cleanClipText(p.text);
  if (text && isSingleUrl(text)) return { kind: 'link', url: text };
  const url = (p.url ?? '').trim();
  if (!text && url && isSingleUrl(url)) return { kind: 'link', url };
  if (text) return { kind: 'text', text };
  return { kind: 'empty' };
}

/** 지금 클립보드를 읽어 분류한다. 이미지면 내용은 읽지 않는다(네이티브가 줄여서 바로 저장) */
export async function readClipboard(opts: { allowImage?: boolean } = {}): Promise<ClipContent> {
  const allowImage = opts.allowImage !== false;
  try {
    // has*는 내용을 읽지 않아 iOS 허락 창이 뜨지 않는다
    if (allowImage && (await Clipboard.hasImageAsync().catch(() => false))) return { kind: 'image' };
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text?.trim()) return classifyClip({ text });
    // 사파리 등에서 주소만 복사하면 글이 비고 URL만 있을 수 있다(iOS)
    const hasUrl = await Clipboard.hasUrlAsync().catch(() => false);
    const url = hasUrl ? await Clipboard.getUrlAsync().catch(() => null) : null;
    return classifyClip({ url });
  } catch {
    return { kind: 'empty' };
  }
}

function newMemoRef(now: number): string {
  return `txt:${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 첫 줄을 짧게 — 타일·목록에 보이는 이름 */
export function memoTitle(text: string, max = 40): string {
  const line = (text.split('\n').find((l) => l.trim()) ?? '').trim().replace(/\s+/g, ' ');
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

export function makeTextAttachment(text: string, now = Date.now()): Attachment {
  const body = cleanClipText(text);
  return { ref: newMemoRef(now), kind: 'text', name: memoTitle(body), text: body, size: null, mime: 'text/plain', addedAt: now };
}

export function makeLinkAttachment(url: string, now = Date.now()): Attachment {
  const u = url.trim();
  let host = u;
  try { host = u.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] || u; } catch {}
  return { ref: newMemoRef(now), kind: 'link', name: host, text: u, size: null, mime: null, addedAt: now };
}

/** 같은 글·주소를 이미 붙였으면 다시 붙이지 않는다(실수로 두 번 누름) */
export function hasSameMemo(list: Attachment[] | undefined, kind: 'text' | 'link', text: string): boolean {
  const v = kind === 'link' ? text.trim() : cleanClipText(text);
  return (list ?? []).some((a) => a.kind === kind && (a.text ?? '') === v);
}
