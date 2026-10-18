// ─── 한 달 보기 칸 배치 계산 (순수 함수) ─────────────────────────────────────────
// 새 달력(위아래 연속 스크롤, 칸에 일정 이름, 기간 막대)의 배치를 계산한다. 화면 코드와 분리해 테스트한다.
// 두 앱이 함께 쓸 달력 부품(lib/calendarKit)이라 세이람 일정 형식(ScheduleRecord)에 의존하지 않고 CalEvent만 받는다.
import { ymdKey } from './holidays';

/** 달력에 그릴 일정 하나 — 시작·끝은 그날 0시, 하루짜리면 start=end. time은 그날 분(시간 없으면 없음) */
export type CalEvent = { id: string; title: string; start: Date; end: Date; time?: number };

/** 주 단위로 나눈 한 달(일요일 시작). 그 달이 아닌 칸은 null */
export function monthWeeks(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(first.getDay()).fill(null);
  for (let i = 1; i <= days; i++) cells.push(new Date(year, month, i));
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type WeekBar = { id: string; title: string; startCol: number; endCol: number; lane: number; fromPrev: boolean; toNext: boolean };

const dayMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 그 주에 걸치는 기간 일정 막대 — 겹치면 다른 줄(lane). 그 달이 아닌 칸(null)에는 그리지 않는다 */
export function weekBars(events: CalEvent[], week: (Date | null)[]): WeekBar[] {
  const cols = week.map((x) => (x ? dayMs(x) : null));
  const firstCol = cols.findIndex((x) => x != null);
  const lastCol = cols.length - 1 - [...cols].reverse().findIndex((x) => x != null);
  if (firstCol < 0) return [];
  const ws = cols[firstCol]!;
  const we = cols[lastCol]!;
  const multi = events
    .filter((e) => dayMs(e.end) > dayMs(e.start) && dayMs(e.start) <= we && dayMs(e.end) >= ws)
    .sort((a, b) => dayMs(a.start) - dayMs(b.start) || dayMs(b.end) - dayMs(a.end));
  const laneEnd: number[] = []; // 줄마다 마지막으로 차지한 칸
  const out: WeekBar[] = [];
  for (const e of multi) {
    const s = Math.max(dayMs(e.start), ws);
    const en = Math.min(dayMs(e.end), we);
    const startCol = cols.indexOf(s);
    const endCol = cols.indexOf(en);
    let lane = laneEnd.findIndex((end) => end < startCol);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(endCol); } else laneEnd[lane] = endCol;
    out.push({ id: e.id, title: e.title, startCol, endCol, lane, fromPrev: dayMs(e.start) < ws, toNext: dayMs(e.end) > we });
  }
  return out;
}

/** 하루짜리 일정을 날짜('YYYY-MM-DD')별로, 시간순(시간 없는 일정은 앞) */
export function singleDayIndex(events: CalEvent[]): Map<string, CalEvent[]> {
  const m = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (dayMs(e.end) > dayMs(e.start)) continue;
    const k = ymdKey(e.start);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(e);
  }
  for (const list of m.values()) list.sort((a, b) => (a.time ?? -1) - (b.time ?? -1));
  return m;
}

// ─── 확대·축소 단계 (iOS 캘린더처럼 두 손가락으로) ──────────────────────────────────
/** 0 = 작게(점만, 몇 달을 한눈에), 1 = 보통(일정 이름 서너 줄), 2 = 크게(이름 일고여덟 줄) */
export type CalDensity = 0 | 1 | 2;

/** 두 손가락 사이 거리가 25% 넘게 바뀌면 한 단계 */
export function densityAfterPinch(cur: CalDensity, startDist: number, endDist: number): CalDensity {
  if (startDist <= 0) return cur;
  const r = endDist / startDist;
  if (r > 1.25) return Math.min(2, cur + 1) as CalDensity;
  if (r < 0.8) return Math.max(0, cur - 1) as CalDensity;
  return cur;
}

/** 달 제목·요일 줄 두 번 탭: 한 단계 크게, 가장 크면 보통으로 */
export function densityAfterDoubleTap(cur: CalDensity): CalDensity {
  return cur < 2 ? ((cur + 1) as CalDensity) : 1;
}

export type CellMetrics = { titleH: number; cellH: number; numH: number; laneH: number; showNames: boolean };

/** 단계·글자 배율에 따른 칸 크기 */
export function cellMetrics(d: CalDensity, scale: number): CellMetrics {
  const numH = Math.round(22 * scale);
  const laneH = Math.round(15 * scale);
  const titleH = Math.round(44 * scale);
  if (d === 0) return { titleH, numH, laneH: Math.round(5 * scale), cellH: numH + Math.round(12 * scale), showNames: false };
  const lines = d === 1 ? 4 : 8;
  return { titleH, numH, laneH, cellH: numH + laneH * lines + 6, showNames: true };
}
