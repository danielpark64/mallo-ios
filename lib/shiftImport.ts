// ─── 교대알람 근무표 가져오기 (같은 폰, 인터넷 없이 앱끼리 URL로) ───────────────────────
// 세이람 → alarmapp://share-shifts?v=1&return=mallo  (교대알람이 열려 "세이람에 보낼까요?" 확인)
// 교대알람 → mallo://import-shifts?v=1&p=<payload>   (세이람이 열리며 근무표를 받는다)
// payload 형식·교대알람 쪽 구현 안내: docs/shift-share-protocol.md
// 가져온 근무는 달력 칸에 작은 색 글씨로만 보인다 — 일정·알람을 만들지 않는다(알람은 교대알람이 울린다).
import { Directory, File, Paths } from 'expo-file-system';

export const SHIFT_REQUEST_URL = 'alarmapp://share-shifts?v=1&return=mallo';

export type ShiftData = {
  /** 첫날 'YYYY-MM-DD' */
  from: string;
  /** 근무 종류 이름(초번·말번·비번…) */
  labels: string[];
  /** 종류별 색 '#RRGGBB' */
  colors: string[];
  /** 종류별 쉬는 날 여부 */
  off: boolean[];
  /** from부터 하루씩, labels 번호(-1 = 근무 없음) */
  days: number[];
  /** 교대알람이 보낸 시각(ms, payload t) — 같은 링크로 다시 열려도 옛 근무표가 새것을 덮지 않게 */
  sentAt?: number;
  /** 가져온 시각(ms) — 저장할 때 채운다 */
  importedAt?: number;
  /** 어디서 왔나: 'auto' = 자동 공유(교대알람 창구), 없으면 v1 링크로 가져옴 */
  source?: 'auto';
};

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 보내는 쪽(교대알람)용 — 테스트와 문서 예시에도 쓴다 */
export function encodeShiftPayload(d: Omit<ShiftData, 'importedAt'>): string {
  const body = {
    f: d.from,
    l: d.labels,
    c: d.colors,
    o: d.off.map((x) => (x ? 1 : 0)),
    d: d.days.map((i) => (i < 0 ? '-' : B36[i])).join(''),
    ...(d.sentAt != null ? { t: d.sentAt } : {}),
  };
  return encodeURIComponent(JSON.stringify(body));
}

/** 받은 주소를 읽는다. 형식이 틀리면 null */
export function parseShiftImportUrl(url: string): ShiftData | null {
  try {
    const m = url.match(/^mallo:\/\/import-shifts\?(.*)$/);
    if (!m) return null;
    const q = new Map<string, string>();
    for (const part of m[1].split('&')) {
      const i = part.indexOf('=');
      if (i > 0) q.set(part.slice(0, i), part.slice(i + 1));
    }
    if (q.get('v') !== '1' || !q.get('p')) return null;
    return parseShiftBody(JSON.parse(decodeURIComponent(q.get('p')!)));
  } catch {
    return null;
  }
}

/** 근무표 본문(JSON 객체) 검사·변환 — URL(v1)과 자동 공유 창구(v2)가 같은 형식을 쓴다 */
export function parseShiftBody(body: any): ShiftData | null {
  try {
    if (typeof body?.f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.f)) return null;
    // 실제 있는 날짜인지(2026-13-45 같은 값은 날짜가 넘어가 엉뚱한 날로 보인다)
    const [fy, fm, fd] = body.f.split('-').map(Number);
    const fdate = new Date(fy, fm - 1, fd);
    if (fdate.getFullYear() !== fy || fdate.getMonth() !== fm - 1 || fdate.getDate() !== fd) return null;
    const labels: string[] = Array.isArray(body.l) ? body.l.map((x: unknown) => String(x).slice(0, 12)) : [];
    const colors: string[] = Array.isArray(body.c) ? body.c.map((x: unknown) => (/^#[0-9a-fA-F]{6}$/.test(String(x)) ? String(x) : '#9AA0A6')) : [];
    const off: boolean[] = Array.isArray(body.o) ? body.o.map((x: unknown) => x === 1) : [];
    if (!labels.length || labels.length > 36 || typeof body.d !== 'string' || body.d.length > 800) return null;
    // 한 글자라도 형식 밖(대문자·이모지 등)이면 통째로 거부 — 문서와 같은 규칙
    if (!/^[0-9a-z-]*$/.test(body.d)) return null;
    const days = [...body.d].map((ch: string) => (ch === '-' ? -1 : B36.indexOf(ch)));
    if (days.some((i) => i < -1 || i >= labels.length)) return null;
    const sentAt = typeof body.t === 'number' && Number.isFinite(body.t) ? body.t : undefined;
    return {
      from: body.f, labels,
      colors: colors.slice(0, labels.length), off: off.slice(0, labels.length),
      days, ...(sentAt != null ? { sentAt } : {}),
    };
  } catch {
    return null;
  }
}

/** 그 날의 근무(없으면 null) */
export function shiftOn(data: ShiftData | null, date: Date): { label: string; color: string; off: boolean } | null {
  if (!data) return null;
  const [y, mo, d] = data.from.split('-').map(Number);
  const start = new Date(y, mo - 1, d);
  const idx = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - start.getTime()) / 86_400_000);
  if (idx < 0 || idx >= data.days.length) return null;
  const i = data.days[idx];
  if (i < 0) return null;
  return { label: data.labels[i], color: data.colors[i] ?? '#9AA0A6', off: !!data.off[i] };
}

// ── 저장 (Documents/mallo/shifts.json) ─────────────────────────────────────────
const FILE = new File(new Directory(Paths.document, 'mallo'), 'shifts.json');

export function loadShifts(): ShiftData | null {
  try {
    if (!FILE.exists) return null;
    const d = JSON.parse(FILE.textSync());
    return d && Array.isArray(d.days) ? d : null;
  } catch {
    return null;
  }
}

export function saveShifts(d: ShiftData | null) {
  try {
    if (!d) { if (FILE.exists) FILE.delete(); return; }
    const dir = new Directory(Paths.document, 'mallo');
    if (!dir.exists) dir.create({ intermediates: true });
    if (!FILE.exists) FILE.create();
    FILE.write(JSON.stringify(d));
  } catch (e) {
    console.warn('근무표 저장 실패:', e);
  }
}

/** 받은 근무표가 저장된 것보다 새것인가(보낸 시각 t 기준). 없으면 새것으로 본다 */
export function isNewerThan(incoming: ShiftData, stored: ShiftData | null): boolean {
  if (!stored || stored.sentAt == null || incoming.sentAt == null) return true;
  return incoming.sentAt > stored.sentAt;
}

// ── 사용자가 [가져오기]를 누른 시각 — 요청 없이 들어온 근무표는 바로 덮지 않고 묻는다 ──
// 메모리에만 두면 저사양 폰에서 교대알람에 다녀오는 사이 앱이 죽어 사라지므로 파일에 둔다.
const REQ_FILE = new File(new Directory(Paths.document, 'mallo'), 'shift-request.json');
export function markShiftRequest() {
  try {
    const dir = new Directory(Paths.document, 'mallo');
    if (!dir.exists) dir.create({ intermediates: true });
    if (!REQ_FILE.exists) REQ_FILE.create();
    REQ_FILE.write(JSON.stringify({ at: Date.now() }));
  } catch {}
}
/** 10분 안에 [가져오기]를 눌렀는가. 한 번 확인하면 지운다 */
export function consumeRecentShiftRequest(now: number = Date.now()): boolean {
  try {
    if (!REQ_FILE.exists) return false;
    const at = JSON.parse(REQ_FILE.textSync())?.at;
    REQ_FILE.delete();
    return typeof at === 'number' && now - at >= 0 && now - at < 10 * 60_000;
  } catch {
    return false;
  }
}
