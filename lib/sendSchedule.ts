// ─── 일정 보내기 (메신저·문자로 링크 한 줄, 서버 없음) ─────────────────────────────
// 보내는 쪽: 일정 하나 → 링크 https://danielpark64.github.io/sayram/s/#v1.<페이로드>
//   - 1.2.2부터 이 주소(유니버설 링크·App Links)로 보낸다. 앱이 깔려 있으면 페이지 없이 바로 앱이 열린다
//   - 옛 주소 https://sayram-app.github.io/s/#v1.… 도 계속 받는다(이미 보낸 링크)
//   - '#' 뒤는 브라우저가 서버로 보내지 않는다 → 서버에 아무것도 남지 않는다(인터넷 권한도 필요 없음: 링크는 메신저·문자 앱이 연다)
//   - 안내 페이지(docs/s/index.html)가 '#' 뒤를 읽어 보여 주고 [세이람에서 열기] → mallo://receive?d=v1.<페이로드>
// 받는 쪽: 확인 시트에서 사용자가 [달력에 넣기]를 눌러야 저장된다(자동 저장·자동 발송 없음).
// 보내는 것은 글만: 내용·시각·미리 알림·정각 알림 여부·보낸 사람 이름·만든 시각(t)·일정 id.
// 목소리(녹음)·사진·첨부·원문(transcript)은 보내지 않는다.
// 형식 검사는 lib/shiftImport.ts(parseShiftBody)와 같은 방식 — 하나라도 틀리면 통째로 거절한다.
import { formatDisplay } from './parseSchedule';
import { normalizeRemind, type RemindBefore } from './reminders';
import { t as tr } from './i18n';
import type { ScheduleRecord } from './storage';

/** 보내는 링크의 안내 페이지 주소(공용 GitHub Pages — 유니버설 링크·App Links 도메인) */
export const SHARE_PAGE_URL = 'https://danielpark64.github.io/sayram/s/';
/** 1.2.1까지 보내던 옛 안내 페이지 주소(받기만 한다) */
export const LEGACY_SHARE_PAGE_URL = 'https://sayram-app.github.io/s/';
/** 받는 앱 주소 */
export const RECEIVE_URL_PREFIX = 'mallo://receive?d=';
export const PAYLOAD_VERSION = 'v1';
/** 세이람 스토어 주소 — 값은 lib/appInfo.ts 한 곳에(1.2.3). '업데이트가 필요해요'·'새 버전이 있어요'의 [업데이트]는 lib/storeLink.ts openStore를 쓴다 */
export { STORE_IOS as SAYRAM_APP_STORE_URL, STORE_ANDROID_WEB as SAYRAM_PLAY_STORE_URL } from './appInfo';
/** 이 앱이 읽을 줄 아는 가장 높은 형식 번호 — 이보다 큰 번호는 '업데이트가 필요해요' */
export const KNOWN_PAYLOAD_NUMBER = 1;

/** 링크에 넣는 내용 최대 글자 수(넘으면 잘라 '…'). 한국어 140자 ≈ 링크 700자 */
export const MAX_CONTENT = 140;
/** 보낸 사람 이름 최대 글자 수 */
export const MAX_NAME = 20;
/** 링크 전체 최대 길이 — 넘으면 내용을 더 줄인다 */
export const MAX_LINK = 1200;
/** 받을 때 페이로드(v1. 뒤) 최대 길이 — 이보다 길면 읽지도 않고 거절 */
export const MAX_PAYLOAD = 1600;
const MAX_ID = 40;

/** 링크 속 JSON(짧은 이름) */
export type SharePayload = {
  /** 일정 고유 id — 다시 보냈을 때 같은 일정인지 안다 */
  i: string;
  /** 내용 */
  c: string;
  /** 날짜 'YYYY-MM-DD' (보낸 사람 폰의 벽시계 기준 — 같은 "11월 25일 오후 3시"로 들어간다) */
  d: string;
  /** 시각(분, 0~1439). 없으면 시간 미정 */
  h?: number;
  /** 기간 일정의 끝나는 날 'YYYY-MM-DD' */
  e?: string;
  /** 미리 알림(분) */
  r?: number[];
  /** 0 = 정각 알림 끔(없으면 켬) */
  x?: 0;
  /** 보낸 사람 이름 */
  n?: string;
  /** 만든 시각(ms) */
  t: number;
};

/** 읽어 낸 받은 일정 */
export type SharedSchedule = {
  id: string;
  content: string;
  /** 일정 시각(시간 미정이면 그날 0시) */
  date: Date;
  hasTime: boolean;
  endDate?: Date;
  remindBefore: RemindBefore[];
  exactAlarm: boolean;
  from?: string;
  t: number;
};

// ── base64url (UTF-8) — Buffer·btoa 없이(Hermes·jest·브라우저 모두 같은 결과) ──────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    let cp = ch.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd; // 짝 없는 서로게이트는 대체 문자로
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

function utf8Decode(b: number[]): string | null {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    let cp: number;
    let n: number;
    if (c < 0x80) { cp = c; n = 0; }
    else if (c >= 0xc2 && c < 0xe0) { cp = c & 31; n = 1; }
    else if (c >= 0xe0 && c < 0xf0) { cp = c & 15; n = 2; }
    else if (c >= 0xf0 && c < 0xf5) { cp = c & 7; n = 3; }
    else return null;
    if (i + n >= b.length) return null; // 뒤 바이트가 모자람
    for (let k = 1; k <= n; k++) {
      const x = b[i + k];
      if (x == null || (x & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (x & 63);
    }
    if ((n === 2 && cp < 0x800) || (n === 3 && (cp < 0x10000 || cp > 0x10ffff)) || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    s += String.fromCodePoint(cp);
    i += n + 1;
  }
  return s;
}

export function toBase64Url(s: string): string {
  const b = utf8Bytes(s);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < b.length) out += B64[(n >> 6) & 63];
    if (i + 2 < b.length) out += B64[n & 63];
  }
  return out;
}

export function fromBase64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    const v = [...chunk].map((ch) => B64.indexOf(ch));
    const n = (v[0] << 18) | (v[1] << 12) | ((v[2] ?? 0) << 6) | (v[3] ?? 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return utf8Decode(bytes);
}

// ── 날짜 ────────────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' → 그날 0시. 없는 날짜(2026-02-30)면 null */
function parseYmd(s: unknown): Date | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

const DAY = 86_400_000;
/** 받을 수 있는 날짜 범위: 1년 전 ~ 5년 뒤 */
const PAST_LIMIT_DAYS = 366;
const FUTURE_LIMIT_DAYS = 366 * 5;
/** 기간 일정 최대 길이 */
const MAX_SPAN_DAYS = 366;

// ── 보내기 ──────────────────────────────────────────────────────────────────────
/** 보낼 내용: 메인 내용만(추가 엔트리·원문은 보내지 않는다) */
export function shareContentOf(r: Pick<ScheduleRecord, 'content' | 'transcript'>): string {
  return ((r.content || r.transcript || '').split('\n• ')[0] ?? '').replace(/\s+/g, ' ').trim();
}

function cut(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : chars.slice(0, Math.max(1, max - 1)).join('') + '…';
}

/** 보낼 수 있는 일정인가 — 날짜가 정해진 일정만(날짜를 안 정한 녹음은 보내지 않는다) */
export function canSend(r: Pick<ScheduleRecord, 'scheduleAt' | 'needsDate'>): boolean {
  return r.scheduleAt != null && !r.needsDate;
}

export function payloadFromRecord(r: ScheduleRecord, from: string | undefined, now: number = Date.now()): SharePayload {
  const at = new Date(r.scheduleAt ?? now);
  const name = (from ?? '').replace(/\s+/g, ' ').trim();
  const remind = normalizeRemind(r.remindBefore ?? []);
  return {
    // 받은 일정을 다시 보내면 처음 id를 이어 쓴다(같은 일정으로 알아보게)
    i: (r.received?.id ?? r.id).slice(0, MAX_ID),
    c: cut(shareContentOf(r), MAX_CONTENT),
    d: ymd(at),
    ...(r.hasTime ? { h: at.getHours() * 60 + at.getMinutes() } : {}),
    ...(r.endAt != null && r.endAt > (r.scheduleAt ?? 0) ? { e: ymd(new Date(r.endAt)) } : {}),
    ...(remind.length ? { r: remind } : {}),
    ...(r.exactAlarm === false ? { x: 0 as const } : {}),
    ...(name ? { n: cut(name, MAX_NAME) } : {}),
    t: now,
  };
}

export function encodePayload(p: SharePayload): string {
  return `${PAYLOAD_VERSION}.${toBase64Url(JSON.stringify(p))}`;
}

export function linkFor(p: SharePayload): string {
  return `${SHARE_PAGE_URL}#${encodePayload(p)}`;
}

/** 링크를 만든다. 길이 상한(MAX_LINK)을 넘으면 내용을 줄여 맞춘다 */
export function buildShareLink(r: ScheduleRecord, from: string | undefined, now: number = Date.now()): { link: string; payload: SharePayload } {
  let p = payloadFromRecord(r, from, now);
  let link = linkFor(p);
  let max = [...p.c].length;
  while (link.length > MAX_LINK && max > 8) {
    max = Math.max(8, Math.floor(max * 0.8));
    p = { ...p, c: cut(shareContentOf(r), max) };
    link = linkFor(p);
  }
  return { link, payload: p };
}

/** "11월 25일 (수) 오후 3:00" (기간이면 "~ 끝날") — 보내는 사람 언어로 */
export function whenText(s: Pick<SharedSchedule, 'date' | 'hasTime' | 'endDate'>): string {
  const head = formatDisplay(s.date, true, s.hasTime);
  return s.endDate ? `${head} ~ ${formatDisplay(s.endDate, true, false)}` : head;
}

/** 메신저용 글(카카오톡·LINE·WeChat·WhatsApp·공유 창 공통): 앱이 없어도 읽히는 안내 + 링크 */
export function messengerText(s: SharedSchedule, link: string, t: (k: string, p?: Record<string, string | number>) => string = tr): string {
  const head = s.from ? t('📅 {name}에게서 일정이 왔어요', { name: s.from }) : t('📅 세이람 일정이 도착했어요');
  return `${head}\n${whenText(s)}\n${s.content}\n\n${t('눌러서 세이람에 넣기 ▶')} ${link}`;
}

/** 문자용 글: 최대한 짧게(길면 장문 요금) */
export function smsText(s: SharedSchedule, link: string, t: (k: string, p?: Record<string, string | number>) => string = tr): string {
  return `[${t('세이람')}] ${whenText(s)} ${cut(s.content, 24)}\n${link}`;
}

// ── 받기 ────────────────────────────────────────────────────────────────────────
/** 페이로드 JSON 검사·변환 — 하나라도 틀리면 null */
export function parsePayloadBody(body: any, now: number = Date.now()): SharedSchedule | null {
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    if (typeof body.i !== 'string' || !/^[A-Za-z0-9_.:-]{1,40}$/.test(body.i)) return null;
    if (typeof body.c !== 'string' || [...body.c].length > MAX_CONTENT + 20) return null;
    const content = body.c.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
    if (!content) return null;
    const day = parseYmd(body.d);
    if (!day) return null;
    // 날짜 범위: 너무 옛날·너무 먼 미래는 받지 않는다
    const today = new Date(now);
    const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    if (day.getTime() < today0 - PAST_LIMIT_DAYS * DAY || day.getTime() > today0 + FUTURE_LIMIT_DAYS * DAY) return null;
    let hasTime = false;
    let date = day;
    if (body.h != null) {
      if (!Number.isInteger(body.h) || body.h < 0 || body.h > 1439) return null;
      hasTime = true;
      date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(body.h / 60), body.h % 60);
    }
    let endDate: Date | undefined;
    if (body.e != null) {
      const e = parseYmd(body.e);
      if (!e || e.getTime() <= day.getTime() || e.getTime() > day.getTime() + MAX_SPAN_DAYS * DAY) return null;
      endDate = e;
    }
    if (body.r != null && (!Array.isArray(body.r) || body.r.length > 8)) return null;
    const remindBefore = normalizeRemind(body.r ?? []);
    if (body.x != null && body.x !== 0) return null;
    let from: string | undefined;
    if (body.n != null) {
      if (typeof body.n !== 'string' || [...body.n].length > MAX_NAME + 5) return null;
      from = body.n.replace(/[\u0000-\u001f\u007f]/g, '').trim() || undefined;
    }
    // 만든 시각: 2020년 이후, 지금보다 하루 넘게 앞서지 않을 것(폰 시계 차이만 허용)
    if (typeof body.t !== 'number' || !Number.isFinite(body.t) || body.t < 1_577_836_800_000 || body.t > now + DAY) return null;
    return {
      id: body.i, content, date, hasTime,
      ...(endDate ? { endDate } : {}),
      remindBefore, exactAlarm: body.x !== 0,
      ...(from ? { from } : {}),
      t: body.t,
    };
  } catch {
    return null;
  }
}

/** 'v1.<base64url>' → 받은 일정. 옛 버전·새 버전·깨진 글은 null */
export function decodePayload(s: string, now: number = Date.now()): SharedSchedule | null {
  if (typeof s !== 'string' || s.length > MAX_PAYLOAD + 3) return null;
  const m = /^v(\d+)\.([A-Za-z0-9_-]+)$/.exec(s.trim());
  if (!m || `v${m[1]}` !== PAYLOAD_VERSION) return null;
  const json = fromBase64Url(m[2]);
  if (json == null) return null;
  try {
    return parsePayloadBody(JSON.parse(json), now);
  } catch {
    return null;
  }
}

/**
 * 받은 글 읽기 결과
 * - ok: true → 일정
 * - ok: false, needsUpdate: true → 'v<숫자>.' 모양인데 이 앱이 모르는 더 새 형식(앱을 업데이트하면 열림)
 * - ok: false (needsUpdate 없음) → 깨진 링크
 */
export type ReceiveParse =
  | { ok: true; data: SharedSchedule }
  | { ok: false; needsUpdate?: true };

/** 새 형식이 얼마나 길지 모르니 넉넉히 — 이보다 길면 새 형식이라도 깨진 것으로 본다 */
const MAX_FUTURE_PAYLOAD = 8000;

/** 'v<숫자>.<글>' 를 읽는다. 아는 번호(1)는 일정으로, 더 큰 번호는 업데이트 필요, 나머지는 깨진 링크 */
export function classifyPayload(s: string, now: number = Date.now()): ReceiveParse {
  if (typeof s !== 'string') return { ok: false };
  const t = s.trim();
  const m = /^v(\d{1,6})\.(\S+)$/.exec(t);
  if (m && Number(m[1]) > KNOWN_PAYLOAD_NUMBER) {
    // 뒤 글의 모양은 새 형식이 정하므로 따지지 않는다(길이만 본다)
    return t.length <= MAX_FUTURE_PAYLOAD ? { ok: false, needsUpdate: true } : { ok: false };
  }
  const data = decodePayload(t, now);
  return data ? { ok: true, data } : { ok: false };
}

/** 받는 https 주소: 새 주소(danielpark64.github.io/sayram/s/)·옛 주소(sayram-app.github.io/s/). '?…'(메신저가 붙이는 꼬리)·index.html 허용 */
const SHARE_PAGE_RE = /^https?:\/\/(?:danielpark64\.github\.io\/sayram\/s|sayram-app\.github\.io\/s)(?:\/(?:index\.html)?)?(?:\?[^#]*?)?(?:#|%23)(.*)$/i;

/** 받은 주소 읽기. 받기 주소가 아니면 null(다른 링크 처리로 넘긴다), 받기 주소인데 틀리면 { ok: false } */
export function parseReceiveUrl(url: string, now: number = Date.now()): ReceiveParse | null {
  if (typeof url !== 'string') return null;
  let raw: string | null = null;
  const u = url.trim();
  const m = /^mallo:\/\/receive\?(.*)$/i.exec(u);
  if (m) {
    for (const part of m[1].split('&')) {
      if (part.startsWith('d=')) raw = part.slice(2);
    }
    if (raw == null) return { ok: false };
  } else {
    // 안내 페이지 주소가 앱으로 바로 온 경우(유니버설 링크·App Links, 또는 옛 주소)
    const h = SHARE_PAGE_RE.exec(u);
    if (!h) return null;
    raw = h[1];
  }
  try { raw = decodeURIComponent(raw); } catch { return { ok: false }; }
  // 메신저·복사 과정에서 페이로드 뒤에 붙는 꼬리(?utm=…, &x=…, 끝 마침표·공백)는 떼고 읽는다
  const tail = /^(v\d{1,6}\.[A-Za-z0-9_-]+)[?&.\s]/.exec(raw);
  if (tail) raw = tail[1];
  return classifyPayload(raw, now);
}

/** 받은 일정이 이미 지났나(지났으면 알람을 걸지 않는다) */
export function isPastShared(s: Pick<SharedSchedule, 'date' | 'hasTime' | 'endDate'>, now: number = Date.now()): boolean {
  if (s.hasTime && !s.endDate) return s.date.getTime() <= now;
  const last = s.endDate ?? s.date;
  return new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime() + DAY <= now;
}

/** 알람을 걸 수 있는 받은 일정인가(시각이 있고 아직 오지 않음) — 아니면 "알람도 켤까요?"를 숨긴다 */
export function canArmShared(s: SharedSchedule, now: number = Date.now()): boolean {
  return s.hasTime && s.date.getTime() > now;
}

export type ReceiveDecision =
  | { kind: 'new' }
  | { kind: 'update'; existing: ScheduleRecord }
  | { kind: 'stale'; existing: ScheduleRecord }
  | { kind: 'own'; existing: ScheduleRecord };

/** 같은 id를 받은 적이 있으면: 더 새 t → 바꿀지 묻기 / 같거나 옛 t → 이미 받음.
 *  내가 보낸 일정이 되돌아오면(링크 id = 내 일정 id) own — 안내만 하고 저장하지 않는다 */
export function receiveDecision(s: SharedSchedule, records: ScheduleRecord[]): ReceiveDecision {
  const existing = records.find((r) => r.received?.id === s.id);
  if (!existing) {
    const mine = records.find((r) => r.id === s.id && !r.received);
    return mine ? { kind: 'own', existing: mine } : { kind: 'new' };
  }
  return s.t > (existing.received?.t ?? 0) ? { kind: 'update', existing } : { kind: 'stale', existing };
}

function displayOf(s: SharedSchedule): string {
  return whenText(s);
}

/** 받은 일정의 알림 설정: 알람을 켜면 보낸 사람 설정, 끄면 모두 끔(나중에 상세에서 켤 수 있다) */
function alarmFields(s: SharedSchedule, alarmOn: boolean, now: number) {
  if (canArmShared(s, now) && !alarmOn) return { remindBefore: [] as number[], exactAlarm: false };
  return { remindBefore: s.remindBefore as number[], exactAlarm: s.exactAlarm };
}

/** 새로 받은 일정 → 레코드(알람 식별자는 부르는 쪽이 채운다) */
export function recordFromShared(s: SharedSchedule, id: string, alarmOn: boolean, now: number = Date.now()): ScheduleRecord {
  return {
    id, uri: '', durationSec: 0, transcript: '',
    content: s.content,
    scheduleAt: s.date.getTime(),
    scheduleDisplay: displayOf(s),
    ...(s.endDate ? { endAt: s.endDate.getTime() } : {}),
    hasDate: true, hasTime: s.hasTime,
    alarmMode: 'both',
    ...alarmFields(s, alarmOn, now),
    received: { id: s.id, t: s.t, at: now, ...(s.from ? { from: s.from } : {}) },
    createdAt: now,
  };
}

/** 같은 일정의 새 내용으로 바꾼다 — 내 녹음·추가·첨부·알람 방식은 그대로 둔다 */
export function applySharedUpdate(r: ScheduleRecord, s: SharedSchedule, alarmOn: boolean, now: number = Date.now()): ScheduleRecord {
  const contentChanged = s.content !== r.content;
  return {
    ...r,
    content: s.content,
    scheduleAt: s.date.getTime(),
    scheduleDisplay: displayOf(s),
    endAt: s.endDate ? s.endDate.getTime() : undefined,
    hasDate: true, hasTime: s.hasTime, needsDate: false,
    ...alarmFields(s, alarmOn, now),
    notifIds: undefined,
    outcome: undefined,
    segments: contentChanged ? undefined : r.segments,
    received: { id: s.id, t: s.t, at: now, ...(s.from ? { from: s.from } : {}) },
  };
}

/** 카드·상세의 📩 이름표 글자 */
export function receivedLabel(r: Pick<ScheduleRecord, 'received'>, t: (k: string) => string = tr): string | null {
  if (!r.received) return null;
  return `📩 ${r.received.from || t('받은 일정')}`;
}
