// ─── 홈 화면 위젯 요약 (순수 함수) ─────────────────────────────────────────────
// 앱이 일정·근무표가 바뀔 때마다 이 요약을 만들어 위젯 모듈(modules/sayram-widget)에 넘긴다.
// 위젯(iOS SwiftUI·Android RemoteViews)은 records.json·녹음을 읽지 않고 이 요약만 읽어 그린다 — 가볍게.
// 시간이 지나면서 바뀌는 것(오늘 표시, 지난 일정 빼기)은 위젯이 자기 시계로 계산하므로,
// 요약에는 이번 달부터 석 달치 날짜 정보와 앞으로 두 달 안의 일정을 넉넉히 담는다. 설계: docs/WIDGET_PLAN.md
import type { ScheduleRecord } from './storage';
import type { ShiftData } from './shiftImport';
import type { Lang } from './i18n/lang';
import { translate } from './i18n';
import { isMovedAway } from './outcome';
import { holidayShortFor } from './calendarKit/holidays';
import { lunarCellText } from './calendarKit/lunar';
import { solarTermOf } from './calendarKit/solarTerms';
import { addDays, formatDayHeaderFor, formatMonthLabelFor, formatTimeFor, startOfDay, weekdayLabelsFor } from './dateUtils';

export type WidgetItem = {
  id: string;
  /** 시작(epoch ms). 시간 없는 일정은 그날 0시 */
  at: number;
  /** 기간 일정의 끝나는 날 0시. 하루짜리는 null */
  end: number | null;
  /** 시각이 있는 하루짜리 일정 — 그 시각이 지나면 목록에서 빠진다 */
  timed: boolean;
  title: string;
  /** 목록 왼쪽 칸 "11/10 오전 11:00" · "11/14~11/18" */
  when: string;
  /** 작은 위젯 첫 줄 "11월 10일 (화)" */
  date: string;
  /** 작은 위젯 둘째 줄 "오전 11:00" · "시간 미정" · "~ 11월 18일 (수)" */
  time: string;
};

export type WidgetPayload = {
  v: 1;
  lang: Lang;
  /** days 배열의 첫날(이번 달 1일) 'YYYY-MM-DD' */
  from: string;
  /** 날짜별 근무 번호(shifts 순서, -1 = 없음) — from부터 하루씩 */
  shift: number[];
  /** 날짜별 일정 있음(1) / 없음(0) */
  ev: number[];
  /** 날짜별 공휴일 짧은 이름('' = 없음) — 한국어일 때만, 아니면 빈 배열. 위젯은 이 날 숫자를 빨갛게(일요일과 같은 색) */
  hol: string[];
  /** 날짜별 음력·절기 짧은 글씨(달력 칸과 같은 규칙: 초하루 "11.1", 절기 "동지", 나머지 일 "17") — 앱에서 음력을 켰을 때만, 아니면 빈 배열.
   *  위젯에는 음력 계산을 넣지 않고 앱이 석 달치를 계산해 넘긴다(가볍게) */
  lun: string[];
  /** 근무 종류: 달력 칸에 쓸 짧은 이름과 색 */
  shifts: { s: string; c: string }[];
  /** 이번 달부터 석 달의 이름 */
  months: { y: number; m: number; title: string }[];
  /** 요일 머리글(일요일부터) */
  wd: string[];
  /** 앞으로 두 달 안의 일정(시작순) */
  items: WidgetItem[];
  /** 위젯에 쓰는 문구(현재 언어) — "{n}"은 위젯이 숫자로 바꾼다 */
  str: { next: string; upcoming: string; empty: string; more: string };
};

const MONTHS = 3;
const ITEM_DAYS = 62;
const MAX_ITEMS = 80;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 목록용 짧은 날짜 — ko·ja·zh "11/10", en "Nov 10", es·fr·pt "10/11", de "10.11." */
export function shortDateFor(d: Date, lang: Lang): string {
  const M = d.getMonth() + 1;
  const D = d.getDate();
  switch (lang) {
    case 'en': return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][M - 1]} ${D}`;
    case 'es': case 'fr': case 'pt': return `${D}/${M}`;
    case 'de': return `${D}.${M}.`;
    default: return `${M}/${D}`;
  }
}

/** 근무 이름을 달력 칸용으로 줄인다 — 첫 글자. 첫 글자가 겹치는 근무가 있으면(휴무·휴가) 모두 두 글자 */
export function shortShiftLabels(labels: string[]): string[] {
  const first = labels.map((l) => Array.from(l.trim())[0] ?? '');
  const clash = new Set(first).size < first.filter(Boolean).length;
  return labels.map((l, i) => (clash ? Array.from(l.trim()).slice(0, 2).join('') : first[i]));
}

/** 위젯 달력 칸의 음력·절기 — 앱 달력 칸(MonthScroll)과 같은 규칙: 음력 초하루가 먼저, 다음 절기, 나머지는 음력 일 */
export function lunarSubFor(d: Date): string {
  const lun = lunarCellText(d);
  if (lun.includes('.')) return lun;
  return solarTermOf(ymd(d)) ?? lun;
}

export function buildWidgetPayload(records: ScheduleRecord[], shifts: ShiftData | null, lang: Lang, now: Date = new Date(), opts: { lunar?: boolean } = {}): WidgetPayload {
  const tr = (k: string) => translate(lang, k);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const stop = new Date(now.getFullYear(), now.getMonth() + MONTHS, 1);
  const nDays = Math.round((stop.getTime() - first.getTime()) / 86_400_000);
  const dayIdx = (d: Date) => Math.round((startOfDay(d).getTime() - first.getTime()) / 86_400_000);

  // 근무: shifts.days는 shifts.from부터 하루씩
  const shift: number[] = new Array(nDays).fill(-1);
  if (shifts) {
    const [y, m, d] = shifts.from.split('-').map(Number);
    const off = Math.round((new Date(y, m - 1, d).getTime() - first.getTime()) / 86_400_000);
    for (let i = 0; i < nDays; i++) {
      const v = shifts.days[i - off];
      if (v != null && v >= 0 && v < shifts.labels.length) shift[i] = v;
    }
  }

  // 일정 있는 날(기간 일정은 덮는 날 모두)
  const ev: number[] = new Array(nDays).fill(0);
  const dated = records.filter((r) => r.scheduleAt != null);
  for (const r of dated) {
    const s = Math.max(0, dayIdx(new Date(r.scheduleAt!)));
    const e = Math.min(nDays - 1, dayIdx(new Date(r.endAt ?? r.scheduleAt!)));
    for (let i = s; i <= e; i++) ev[i] = 1;
  }

  // 앞으로의 일정: 오늘 이후에 끝나고 두 달 안에 시작하는 것
  const today = startOfDay(now).getTime();
  const horizon = addDays(startOfDay(now), ITEM_DAYS).getTime();
  // 앱의 '다음 일정'처럼 날짜를 아직 안 정한 것(needsDate)과 미룬 일정은 뺀다
  const items: WidgetItem[] = dated
    .filter((r) => !r.needsDate && !isMovedAway(r))
    .filter((r) => {
      const at = r.scheduleAt!;
      const timed = r.hasTime && r.endAt == null;
      const alive = timed ? at > now.getTime() : startOfDay(new Date(r.endAt ?? at)).getTime() >= today;
      return alive && at < horizon;
    })
    .sort((a, b) => a.scheduleAt! - b.scheduleAt!)
    .slice(0, MAX_ITEMS)
    .map((r) => {
      const s = new Date(r.scheduleAt!);
      const range = r.endAt != null;
      const timed = r.hasTime && !range;
      const e = range ? new Date(r.endAt!) : null;
      return {
        id: r.id,
        at: timed ? s.getTime() : startOfDay(s).getTime(),
        end: e ? startOfDay(e).getTime() : null,
        timed,
        title: (r.content || r.transcript || '').split('\n').map((l) => l.trim()).find(Boolean) ?? tr('(내용 없음)'),
        when: e ? `${shortDateFor(s, lang)}~${shortDateFor(e, lang)}` : timed ? `${shortDateFor(s, lang)} ${formatTimeFor(s, lang)}` : shortDateFor(s, lang),
        date: formatDayHeaderFor(s, lang),
        time: e ? `~ ${formatDayHeaderFor(e, lang)}` : timed ? formatTimeFor(s, lang) : tr('시간 미정'),
      };
    });

  // 공휴일·음력은 한국어 화면에서만(앱 달력과 같은 규칙)
  const dayAt = (i: number) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
  const hol: string[] = lang === 'ko' ? Array.from({ length: nDays }, (_, i) => holidayShortFor(dayAt(i), lang) ?? '') : [];
  const lun: string[] = lang === 'ko' && opts.lunar ? Array.from({ length: nDays }, (_, i) => lunarSubFor(dayAt(i))) : [];

  const short = shifts ? shortShiftLabels(shifts.labels) : [];
  return {
    v: 1,
    lang,
    from: ymd(first),
    shift,
    ev,
    hol,
    lun,
    shifts: short.map((s, i) => ({ s, c: shifts!.colors[i] ?? '#9AA0A6' })),
    months: Array.from({ length: MONTHS }, (_, k) => {
      const d = new Date(first.getFullYear(), first.getMonth() + k, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1, title: formatMonthLabelFor(d.getFullYear(), d.getMonth(), lang) };
    }),
    wd: weekdayLabelsFor(lang),
    items,
    str: { next: tr('다음 일정'), upcoming: tr('다가오는 일정'), empty: tr('앞으로 올 일정이 없어요'), more: tr('외 {n}건') },
  };
}
