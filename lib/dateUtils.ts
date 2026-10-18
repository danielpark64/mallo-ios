// ─── 달력/날짜 공통 유틸 ──────────────────────────────────────────────────────
import type { ScheduleRecord } from './storage';

// 언어는 호출 시점에 읽는다. i18n/index → prefs → reminders → dateUtils 순으로 되돌아오는 순환 참조라
// 최상위 import로 가져오면 모듈 평가 순서에 따라(예: reminders를 먼저 불러올 때) prefs가 비어 있는 reminders를 보게 된다.
// i18n(→ prefs → expo-file-system)을 못 읽는 환경에서도 날짜 포맷은 한국어로 동작해야 한다.
import { getLang, type Lang } from './i18n/lang';
import { EN } from './i18n/en';
import { DICTS } from './i18n/dicts';
const t = (key: string): string => { const l = getLang(); return l === 'ko' ? key : (DICTS[l]?.[key] ?? EN[key] ?? key); };

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ─── 다국어(ja·zh·es·fr·de·pt) 표기 표 ───────────────────────────────────────
// parseScheduleIntl 의 display 도 여기 formatDayHeaderFor/formatTimeFor 를 쓴다(순환 참조 없이 한 곳에서 관리).
type IntlLang = Exclude<Lang, 'ko' | 'en'>;
const INTL_WD: Record<IntlLang, string[]> = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  'zh-Hans': ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  'zh-Hant': ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  de: ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'],
  pt: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
};
/** 달력 요일 머리글(한 글자/약어) */
const INTL_WD_SHORT: Record<IntlLang, string[]> = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  'zh-Hans': ['日', '一', '二', '三', '四', '五', '六'],
  'zh-Hant': ['日', '一', '二', '三', '四', '五', '六'],
  es: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
  fr: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  pt: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
};
const INTL_MON: Record<'es' | 'fr' | 'de' | 'pt', string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
};
const INTL_MON_LONG: Record<'es' | 'fr' | 'de' | 'pt', string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
};
const isCjk = (l: Lang) => l === 'ja' || l === 'zh-Hans' || l === 'zh-Hant';

/** 달력 요일 머리글 — 현재 언어 기준 (ko: 일·월…, en: Sun·Mon…, ja: 日·月…, es: D·L·M·X…) */
export function weekdayLabels(): string[] {
  const l = getLang();
  if (l === 'en') return WEEKDAYS_EN;
  if (l === 'ko') return WEEKDAYS;
  return INTL_WD_SHORT[l];
}

/** 언어를 지정해 시각 표기 — ko "오후 3:00" / en "3:00 PM" / 그 외 24시간 "15:00" */
export function formatTimeFor(d: Date, lang: Lang): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const mm = m.toString().padStart(2, '0');
  if (lang === 'en') {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  }
  if (lang === 'ko') {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h < 12 ? '오전' : '오후'} ${h12}:${mm}`;
  }
  return `${h}:${mm}`;
}

/**
 * 언어를 지정해 날짜 머리글 — ko "10월 12일 (월)" / en "Mon, Oct 12" / ja "10月12日(月)" / zh-Hans "10月12日 周一" /
 * zh-Hant "10月12日 週一" / es "lun 12 oct" / fr "lun. 12 oct." / de "Mo., 12. Okt." / pt "seg, 12 de out"
 */
export function formatDayHeaderFor(d: Date, lang: Lang): string {
  const M = d.getMonth();
  const D = d.getDate();
  const w = d.getDay();
  switch (lang) {
    case 'en': return `${WEEKDAYS_EN[w]}, ${MONTHS_EN[M]} ${D}`;
    case 'ko': return `${M + 1}월 ${D}일 (${WEEKDAYS[w]})`;
    case 'ja': return `${M + 1}月${D}日(${INTL_WD.ja[w]})`;
    case 'zh-Hans': return `${M + 1}月${D}日 ${INTL_WD['zh-Hans'][w]}`;
    case 'zh-Hant': return `${M + 1}月${D}日 ${INTL_WD['zh-Hant'][w]}`;
    case 'es': return `${INTL_WD.es[w]} ${D} ${INTL_MON.es[M]}`;
    case 'fr': return `${INTL_WD.fr[w]} ${D} ${INTL_MON.fr[M]}`;
    case 'de': return `${INTL_WD.de[w]}, ${D}. ${INTL_MON.de[M]}`;
    case 'pt': return `${INTL_WD.pt[w]}, ${D} de ${INTL_MON.pt[M]}`;
  }
}

/** 'YYYY-M-D' 키 (로컬 기준) */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function dayKeyFromMs(ms: number): string {
  return dayKey(new Date(ms));
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** 특정 날짜의 일정만 (시각 순) */
export function schedulesOn(records: ScheduleRecord[], date: Date): ScheduleRecord[] {
  const k = dayKey(date);
  return records
    .filter((r) => r.scheduleAt != null && dayKeyFromMs(r.scheduleAt) === k)
    .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));
}

/** 일정이 있는 날짜 키 집합 (달력 dot 표시용) */
export function daysWithSchedules(records: ScheduleRecord[]): Set<string> {
  const s = new Set<string>();
  for (const r of records) {
    if (r.scheduleAt != null) s.add(dayKeyFromMs(r.scheduleAt));
  }
  return s;
}

/** 그 달의 달력 그리드(6주 x 7일) 날짜 배열. 앞뒤 빈칸은 null */
export function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** "오후 3:00" / en "3:00 PM" / 그 외 "15:00" — 현재 언어 기준 */
export function formatTime(d: Date): string {
  return formatTimeFor(d, getLang());
}

/** "10월 12일 (월)" / en "Mon, Oct 12" / ja "10月12日(月)" … — 현재 언어 기준 */
export function formatDayHeader(d: Date): string {
  return formatDayHeaderFor(d, getLang());
}

/** n일 뒤(음수면 앞) 자정 */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 그 주의 일요일 자정 (주 시작 = 일요일) */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -s.getDay());
}

export function endOfWeek(d: Date): Date {
  return addDays(startOfWeek(d), 6);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** 기간(양 끝 날짜 포함) 안의 일정, 시각순 */
export function schedulesBetween(records: ScheduleRecord[], start: Date, end: Date): ScheduleRecord[] {
  const s = startOfDay(start).getTime();
  const e = addDays(startOfDay(end), 1).getTime();
  return records
    .filter((r) => r.scheduleAt != null && r.scheduleAt >= s && r.scheduleAt < e)
    .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));
}

/** "2026년 10월" / en "October 2026" / ja·zh "2026年10月" / es "octubre de 2026" / fr "octobre 2026" / de "Oktober 2026" / pt "outubro de 2026" */
export function formatMonthLabel(year: number, month: number): string {
  const l = getLang();
  switch (l) {
    case 'en': return `${MONTHS_EN_LONG[month]} ${year}`;
    case 'ko': return `${year}년 ${month + 1}월`;
    case 'ja': case 'zh-Hans': case 'zh-Hant': return `${year}年${month + 1}月`;
    case 'es': case 'pt': return `${INTL_MON_LONG[l][month]} de ${year}`;
    case 'fr': case 'de': return `${INTL_MON_LONG[l][month]} ${year}`;
  }
}

/**
 * 몇째 주인지 — 달력에 보이는 줄 순서대로 센다(1일이 있는 줄이 첫째 주).
 * 두 달에 걸친 주는 양쪽 달로 모두 보여 준다(2026-10-14 사용자 요청):
 *   9월 27일~10월 3일 → "9월 다섯째 주 · 10월 첫째 주", 10월 11~17일 → "10월 셋째 주"
 */
export function weekOfMonth(weekStart: Date): Array<{ month: number; n: number }> {
  const s = startOfWeek(weekStart);
  const e = addDays(s, 6);
  const rowOf = (d: Date) => {
    const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    return Math.floor((d.getDate() - 1 + firstDow) / 7) + 1;
  };
  const parts = [{ month: s.getMonth(), n: rowOf(s) }];
  if (e.getMonth() !== s.getMonth()) parts.push({ month: e.getMonth(), n: rowOf(e) });
  return parts;
}

const KO_ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];

function formatOneWeek(month: number, n: number): string {
  const l = getLang();
  switch (l) {
    case 'ko': return `${month + 1}월 ${KO_ORD[n - 1] ?? `${n}째`} 주`;
    case 'en': return `Week ${n} of ${MONTHS_EN_LONG[month]}`;
    case 'ja': return `${month + 1}月第${n}週`;
    case 'zh-Hans': return `${month + 1}月第${n}周`;
    case 'zh-Hant': return `${month + 1}月第${n}週`;
    case 'es': return `${n}.ª semana de ${INTL_MON_LONG.es[month].toLowerCase()}`;
    case 'pt': return `${n}ª semana de ${INTL_MON_LONG.pt[month].toLowerCase()}`;
    case 'fr': {
      const m = INTL_MON_LONG.fr[month].toLowerCase();
      return `${n === 1 ? '1re' : `${n}e`} semaine ${/^[aeiouy]/.test(m) ? 'd’' : 'de '}${m}`;
    }
    case 'de': return `${n}. Woche im ${INTL_MON_LONG.de[month]}`;
  }
}

export function formatWeekOfMonth(weekStart: Date): string {
  return weekOfMonth(weekStart).map((p) => formatOneWeek(p.month, p.n)).join(' · ');
}

/**
 * "2026년 10월 12일 – 18일", 달이 바뀌면 "2026년 10월 29일 – 11월 4일" (연도는 주 시작일 기준)
 * en: "Oct 11 – 17, 2026", 달이 바뀌면 "Oct 28 – Nov 3, 2026", 해가 바뀌면 "Dec 27, 2026 – Jan 2, 2027"
 * ja·zh: "2026年10月11日 – 17日" / "2026年10月25日 – 11月1日" / "2026年12月27日 – 2027年1月2日"
 * es: "11 – 17 oct 2026" / "25 oct – 1 nov 2026" / "27 dic 2026 – 2 ene 2027" (fr 는 약어에 점, de "11. – 17. Okt. 2026", pt "11 – 17 de out de 2026")
 */
export function formatWeekLabel(weekStart: Date): string {
  const s = startOfWeek(weekStart);
  const e = addDays(s, 6);
  const sameMonth = s.getMonth() === e.getMonth();
  const sameYear = s.getFullYear() === e.getFullYear();
  const l = getLang();
  if (l === 'en') {
    const sm = MONTHS_EN[s.getMonth()];
    const em = MONTHS_EN[e.getMonth()];
    if (sameMonth) return `${sm} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
    if (!sameYear) return `${sm} ${s.getDate()}, ${s.getFullYear()} – ${em} ${e.getDate()}, ${e.getFullYear()}`;
    return `${sm} ${s.getDate()} – ${em} ${e.getDate()}, ${s.getFullYear()}`;
  }
  if (l === 'ko') {
    const head = `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}일`;
    return sameMonth ? `${head} – ${e.getDate()}일` : `${head} – ${e.getMonth() + 1}월 ${e.getDate()}일`;
  }
  if (isCjk(l)) {
    const head = `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日`;
    if (sameMonth) return `${head} – ${e.getDate()}日`;
    if (!sameYear) return `${head} – ${e.getFullYear()}年${e.getMonth() + 1}月${e.getDate()}日`;
    return `${head} – ${e.getMonth() + 1}月${e.getDate()}日`;
  }
  const mon = INTL_MON[l];
  const sm = mon[s.getMonth()];
  const em = mon[e.getMonth()];
  if (l === 'de') {
    if (sameMonth) return `${s.getDate()}. – ${e.getDate()}. ${sm} ${s.getFullYear()}`;
    if (!sameYear) return `${s.getDate()}. ${sm} ${s.getFullYear()} – ${e.getDate()}. ${em} ${e.getFullYear()}`;
    return `${s.getDate()}. ${sm} – ${e.getDate()}. ${em} ${s.getFullYear()}`;
  }
  if (l === 'pt') {
    if (sameMonth) return `${s.getDate()} – ${e.getDate()} de ${sm} de ${s.getFullYear()}`;
    if (!sameYear) return `${s.getDate()} de ${sm} de ${s.getFullYear()} – ${e.getDate()} de ${em} de ${e.getFullYear()}`;
    return `${s.getDate()} de ${sm} – ${e.getDate()} de ${em} de ${s.getFullYear()}`;
  }
  // es · fr
  if (sameMonth) return `${s.getDate()} – ${e.getDate()} ${sm} ${s.getFullYear()}`;
  if (!sameYear) return `${s.getDate()} ${sm} ${s.getFullYear()} – ${e.getDate()} ${em} ${e.getFullYear()}`;
  return `${s.getDate()} ${sm} – ${e.getDate()} ${em} ${s.getFullYear()}`;
}

/** 날짜별 섹션 — 전체 일정 탭·달력 기간 목록 공용. 날짜 미정은 맨 뒤 */
export type DaySection = { key: string; title: string; date: Date; data: ScheduleRecord[] };

export function groupByDay(records: ScheduleRecord[]): DaySection[] {
  const dated = records
    .filter((r) => r.scheduleAt != null)
    .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));
  const groups = new Map<string, DaySection>();
  for (const r of dated) {
    const d = new Date(r.scheduleAt!);
    const key = dayKey(d);
    if (!groups.has(key)) {
      groups.set(key, { key, title: formatDayHeader(d), date: startOfDay(d), data: [] });
    }
    groups.get(key)!.data.push(r);
  }
  const result = Array.from(groups.values());
  const undated = records.filter((r) => r.scheduleAt == null);
  if (undated.length) result.push({ key: 'undated', title: t('날짜 미정'), date: new Date(0), data: undated });
  return result;
}

// ─── 미리 알림(하루 전) 표시용 ───────────────────────────────────────────────
// 하루 전 미리 알림은 실제 일정과 다른 날(전날 저녁 8시)에 울리므로 달력·그날 목록에 따로 보여준다.
// 같은 날 미리 알림(10분·30분·1시간 전)은 카드 배지로 충분해 여기서 다루지 않는다.
export type PreAlarmItem = { kind: 'pre'; id: string; record: ScheduleRecord; fireAt: number; minutes: number };
export type DayListItem = ScheduleRecord | PreAlarmItem;
export type DayListSection = { key: string; title: string; date: Date; data: DayListItem[] };

export function isPreAlarmItem(x: DayListItem): x is PreAlarmItem {
  return (x as PreAlarmItem).kind === 'pre';
}

/** 아직 안 울린 하루 전 미리 알림 항목(범위 안) */
export function preAlarmItems(records: ScheduleRecord[], start?: Date, end?: Date, now: number = Date.now()): PreAlarmItem[] {
  const out: PreAlarmItem[] = [];
  for (const r of records) {
    if (r.scheduleAt == null || !r.hasTime || r.scheduleAt <= now) continue;
    if (!(r.remindBefore ?? []).includes(1440)) continue;
    const at = new Date(r.scheduleAt);
    at.setDate(at.getDate() - 1);
    at.setHours(20, 0, 0, 0);
    const fireAt = at.getTime();
    if (fireAt <= now) continue;
    if (start && fireAt < start.getTime()) continue;
    if (end && fireAt > end.getTime()) continue;
    out.push({ kind: 'pre', id: `${r.id}#pre1440`, record: r, fireAt, minutes: 1440 });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/** 하루 전 미리 알림이 있는 날 키 */
export function daysWithPreAlarms(records: ScheduleRecord[], now: number = Date.now()): Set<string> {
  return new Set(preAlarmItems(records, undefined, undefined, now).map((p) => dayKeyFromMs(p.fireAt)));
}

/** 날짜별 일정 섹션에 미리 알림 항목을 시각순으로 끼워 넣는다 (없는 날은 섹션을 만든다) */
export function mergePreAlarms(sections: DaySection[], items: PreAlarmItem[]): DayListSection[] {
  const map = new Map<string, DayListSection>();
  for (const s of sections) map.set(s.key, { ...s, data: [...s.data] });
  for (const p of items) {
    const d = new Date(p.fireAt);
    const key = dayKey(d);
    if (!map.has(key)) map.set(key, { key, title: formatDayHeader(d), date: startOfDay(d), data: [] });
    const sec = map.get(key)!;
    const timeOf = (x: DayListItem) => (isPreAlarmItem(x) ? x.fireAt : x.scheduleAt ?? 0);
    const idx = sec.data.findIndex((x) => timeOf(x) > p.fireAt);
    if (idx < 0) sec.data.push(p); else sec.data.splice(idx, 0, p);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.key === 'undated') return 1;
    if (b.key === 'undated') return -1;
    return a.date.getTime() - b.date.getTime();
  });
}

// ─── 지난 일정 접기 ─────────────────────────────────────────────────────────────
// 목록은 시간순(이른 것이 위)을 유지하되, 이미 지난 항목은 접어 "지금부터의 일정"이 맨 위에 오게 한다.
export function isPastItem(x: DayListItem, now: number = Date.now()): boolean {
  if (isPreAlarmItem(x)) return x.fireAt <= now;
  if (x.scheduleAt == null) return false; // 날짜 미정은 지난 것으로 보지 않는다
  // 날짜를 안 정한 녹음(녹음 시각으로 저장)은 그날 하루 동안 펼쳐 두고 다음 날부터 지난 것으로 접는다
  if (x.needsDate) {
    const d = new Date(x.scheduleAt);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + 86_400_000 <= now;
  }
  if (x.hasTime) return x.scheduleAt <= now;
  // 시간 미정(그날 0시 저장)은 그 날짜가 끝나야 지난 것
  return x.scheduleAt + 86_400_000 <= now;
}

/**
 * 지난 항목을 접는다. `showPast`만큼은 **가장 최근의 지난 항목부터**(지금에 가까운 순) 남겨 두고 더 오래된 것은 뺀다.
 * 전체 일정은 몇 년 치가 쌓이면 수천 건이라 한 번에 펼치지 않고 30건씩 연다. 빈 섹션은 제거.
 * 반환: sections(표시용), pastCount(지난 전체), hiddenCount(아직 안 보이는 지난 개수)
 */
export function collapsePast<T extends { data: DayListItem[] }>(
  sections: T[],
  now: number = Date.now(),
  showPast = 0,
): { sections: T[]; pastCount: number; hiddenCount: number } {
  let pastCount = 0;
  for (const sec of sections) for (const x of sec.data) if (isPastItem(x, now)) pastCount++;
  const hiddenCount = Math.max(0, pastCount - showPast);
  // 섹션은 시간순이므로 앞에서부터 hiddenCount개의 지난 항목을 건너뛴다
  let skip = hiddenCount;
  const out: T[] = [];
  for (const sec of sections) {
    const keep = sec.data.filter((x) => {
      if (!isPastItem(x, now)) return true;
      if (skip > 0) { skip--; return false; }
      return true;
    });
    if (keep.length) out.push({ ...sec, data: keep });
  }
  return { sections: out, pastCount, hiddenCount };
}
export const PAST_PAGE = 30;

/** 목록 묶음들에서 일정 id의 위치 — "다음 · …"을 눌러 그 카드로 바로 갈 때 쓴다 */
export function findItemLocation(
  sections: { data: DayListItem[] }[],
  id: string,
): { sectionIndex: number; itemIndex: number } | null {
  for (let si = 0; si < sections.length; si++) {
    const ii = sections[si].data.findIndex((x) => !isPreAlarmItem(x) && (x as ScheduleRecord).id === id);
    if (ii >= 0) return { sectionIndex: si, itemIndex: ii };
  }
  return null;
}
