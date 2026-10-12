// ─── 표 기반 다국어(ja·zh-Hans·zh-Hant·es·fr·de·pt) 자연어 → 일정 파서 ─────────
// 한국어 parseSchedule.ts·영어 parseScheduleEn.ts 와 같은 ParsedSchedule 을 돌려준다.
// 언어별 "표"(오늘/내일, 요일, 달, 오전/오후, 시각·날짜·미리 알림 패턴)만 다르고 엔진은 하나다.
// 작동 방식(영어 파서와 동일): 소문자 사본(work)에서 토큰을 찾아 같은 길이의 공백으로 지워 가며(인덱스 보존),
// 지운 구간은 원문에서도 잘라 내용(content)을 만든다.
// 규칙은 한국어와 같다: 오전/오후 미명시 1~7시는 오후, 시간만 있으면 오늘(지났으면 내일), 지난 월일은 다음 해.
import { normalizeRemind, type RemindBefore } from './reminders';
import type { ParsedSchedule } from './parseSchedule';
import type { Lang } from './i18n/lang';
import { formatDayHeaderFor, formatTimeFor } from './dateUtils';

export type IntlLang = Exclude<Lang, 'ko' | 'en'>;

// ─── 공통 조각 ────────────────────────────────────────────────────────────────
/** 라틴 문자 단어 경계 (JS \b 는 é·ñ·ü 같은 글자를 단어로 보지 않아 직접 만든다) */
const B1 = '(?<![\\p{L}\\d])';
const B2 = '(?![\\p{L}\\d])';
const CJK_NUM = '[零〇一二两兩三四五六七八九十]{1,3}';
const CJK_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** 단어 목록 → 긴 것부터 번갈아 쓰는 정규식 조각 (공백은 \s+) */
function alt(words: string[]): string {
  return [...words].sort((a, b) => b.length - a.length).map((w) => esc(w).replace(/ /g, '\\s+')).join('|');
}
function rx(src: string): RegExp {
  return new RegExp(src, 'u');
}
/** 한자 숫자("十五", "三", "两") 또는 아라비아 숫자 → 수 */
function cjkNum(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s === '半') return 0.5;
  const i = s.indexOf('十');
  if (i < 0) return s.length === 1 ? CJK_DIGIT[s] ?? NaN : NaN;
  const tens = i === 0 ? 1 : CJK_DIGIT[s.slice(0, i)];
  const rest = s.slice(i + 1);
  const ones = rest ? CJK_DIGIT[rest] : 0;
  if (tens === undefined || ones === undefined) return NaN;
  return tens * 10 + ones;
}
/** 라틴 언어 수사 → 수 (표에 없으면 NaN) */
function wordNum(nums: Record<string, number>, s: string): number {
  const k = s.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^\d+$/.test(k)) return parseInt(k, 10);
  return nums[k] ?? NaN;
}
function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function isValidMonthDay(month: number, date: number): boolean {
  if (month < 0 || month > 11 || date < 1) return false;
  return date <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}
/** 분 수 → 미리 알림 옵션 (한국어 extractRemindBefore 와 같은 규칙: ≤15→10, ≤45→30, 그 외 60) */
function minutesToOption(n: number): RemindBefore | null {
  if (!(n > 0)) return null;
  if (n <= 15) return 10;
  if (n <= 45) return 30;
  return 60;
}
/** (수, 단위) → 미리 알림 옵션. 단위는 'min'|'hour'|'day' */
function remindOption(n: number, unit: 'min' | 'hour' | 'day'): RemindBefore | null {
  if (!(n > 0)) return null;
  if (unit === 'day') return 1440;
  if (unit === 'hour') return n < 1 ? 30 : 60;
  return minutesToOption(n);
}

// ─── 표 타입 ──────────────────────────────────────────────────────────────────
type Unit = 'min' | 'hour' | 'day' | 'week';
type Mer = 'am' | 'pm';
type DayPart = { re: RegExp; mer: Mer; plain?: boolean; today?: boolean; night?: boolean };
type RelDay = { re: RegExp; offset: number; mer?: Mer; night?: boolean };
type RelHit = { m: RegExpMatchArray; n: number; unit: Unit };
type WeekdayHit = { m: RegExpMatchArray; dow: number; mode: 'plain' | 'nextDay' | 'nextWeek' | 'prevWeek' };
type WeekHit = { m: RegExpMatchArray; offset: number };
type DateHit = { m: RegExpMatchArray; month: number | null; date: number; year?: number | null; numeric?: boolean };
type TimeHit = { m: RegExpMatchArray; hour: number; minute: number };
type TimeCtx = { merKnown: boolean };
type Table = {
  cjk: boolean;
  /** 토큰 바로 앞에서 함께 지울 전치사·관사 (work.slice(0, start) 끝에 매칭, `$` 로 끝나야 함) */
  lead?: RegExp;
  /** 토큰 바로 뒤에서 함께 지울 조사 (work.slice(end) 앞에 매칭, `^` 로 시작해야 함) */
  tail?: RegExp;
  relAfter: (w: string) => RelHit | null;
  dayParts: DayPart[];
  noon: RegExp;
  midnight: RegExp;
  relDays: RelDay[];
  weekday: (w: string) => WeekdayHit | null;
  weekOnly: (w: string) => WeekHit | null;
  date: (w: string) => DateHit | null;
  time: (w: string, ctx: TimeCtx) => TimeHit | null;
  merSuffix?: RegExp;
  remind: Array<[RegExp, (m: RegExpMatchArray) => RemindBefore | null]>;
  cleanup: (s: string) => string;
};

function firstHit<T>(w: string, list: Array<[RegExp, (m: RegExpMatchArray) => T | null]>): T | null {
  for (const [re, fn] of list) {
    const m = w.match(re);
    if (!m) continue;
    const r = fn(m);
    if (r) return r;
  }
  return null;
}

// ─── 라틴 언어 공통 빌더 ──────────────────────────────────────────────────────
type LatinSpec = {
  nums: Record<string, number>;
  relAfter: RegExp; // 1: 수(또는 half 단어), 2: 단위
  relAfterHalf: RegExp; // "half an hour" 류
  unitOf: (u: string) => Unit;
  dayParts: DayPart[];
  noon: RegExp;
  midnight: RegExp;
  relDays: RelDay[];
  weekdays: Record<string, number>;
  weekdayPre: string;
  weekdayPost: string;
  isNextDay: RegExp;
  isNextWeek: RegExp;
  isPrevWeek: RegExp;
  weekOnly: RegExp; // 1: 범위 단어
  weekOnlyOffset: (s: string) => number;
  months: Record<string, number>;
  dates: Array<[RegExp, (m: RegExpMatchArray, months: Record<string, number>) => DateHit | null]>;
  time: (w: string, nums: Record<string, number>) => TimeHit | null;
  remind: Array<[RegExp, (m: RegExpMatchArray) => RemindBefore | null]>;
  lead: string;
  cues: RegExp;
  edgeLead: string;
  edgeTail: string;
};

function latinTable(S: LatinSpec): Table {
  const wdNames = alt(Object.keys(S.weekdays));
  const wdRe = rx(`${B1}(?:(${S.weekdayPre})\\s+)?(${wdNames})\\.?${B2}(?:\\s+(${S.weekdayPost}))?`);
  return {
    cjk: false,
    lead: new RegExp(`(?:^|\\s)(?:${S.lead})\\s*$`, 'u'),
    merSuffix: /^\s*(a\.?m\.?|p\.?m\.?)(?![\p{L}])/u,
    relAfter: (w) => {
      const h = w.match(S.relAfterHalf);
      if (h) return { m: h, n: 0.5, unit: 'hour' };
      const m = w.match(S.relAfter);
      if (!m) return null;
      const n = wordNum(S.nums, m[1]);
      if (!(n > 0)) return null;
      return { m, n, unit: S.unitOf(m[2]) };
    },
    dayParts: S.dayParts,
    noon: S.noon,
    midnight: S.midnight,
    relDays: S.relDays,
    weekday: (w) => {
      const m = w.match(wdRe);
      if (!m) return null;
      const dow = S.weekdays[m[2]];
      if (dow === undefined) return null;
      const scope = `${m[1] ?? ''} ${m[3] ?? ''}`;
      const mode = S.isNextWeek.test(scope) ? 'nextWeek' : S.isPrevWeek.test(scope) ? 'prevWeek' : S.isNextDay.test(scope) ? 'nextDay' : 'plain';
      return { m, dow, mode };
    },
    weekOnly: (w) => {
      const m = w.match(S.weekOnly);
      return m ? { m, offset: S.weekOnlyOffset(m[1]) } : null;
    },
    date: (w) => firstHit(w, S.dates.map(([re, fn]) => [re, (m: RegExpMatchArray) => fn(m, S.months)] as [RegExp, (m: RegExpMatchArray) => DateHit | null])),
    time: (w) => S.time(w, S.nums),
    remind: S.remind,
    cleanup: (s) =>
      s
        .replace(S.cues, ' ')
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .replace(new RegExp(`^(?:(?:${S.edgeLead})\\s+)+`, 'iu'), '')
        .replace(new RegExp(`(?:\\s+(?:${S.edgeTail}))+$`, 'iu'), '')
        .replace(/^[\s,.;:!?/-]+|[\s,.;:!?/-]+$/g, '')
        .trim(),
  };
}

/** 라틴 날짜 패턴 공통: 월 이름 + 일 */
function namedDate(months: Record<string, number>, m: RegExpMatchArray, dayIdx: number, monIdx: number, yearIdx: number): DateHit | null {
  const monKey = m[monIdx]?.toLowerCase().replace(/\.$/, '');
  const month = months[monKey] ?? null;
  if (month === null) return null;
  const dRaw = m[dayIdx].toLowerCase();
  const date = /^\d+$/.test(dRaw) ? parseInt(dRaw, 10) : 1; // "primero", "1er", "premier"
  const year = m[yearIdx] ? parseInt(m[yearIdx], 10) : null;
  return { m, month, date, year };
}
/** 유럽식 DD/MM(/YYYY) */
function numericDMY(m: RegExpMatchArray): DateHit {
  const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : null;
  return { m, month: parseInt(m[2], 10) - 1, date: parseInt(m[1], 10), year: y, numeric: true };
}

// ─── 스페인어 ─────────────────────────────────────────────────────────────────
const ES_NUMS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, 'cuarenta y cinco': 45, cincuenta: 50, sesenta: 60, media: 30, cuarto: 15,
};
const ES_H = `\\d{1,2}|${alt(['una', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'])}`;
const ES_MIN = `media|cuarto|\\d{1,2}|${alt(['cinco', 'diez', 'quince', 'veinte', 'veinticinco', 'treinta', 'cuarenta', 'cincuenta'])}`;
const ES_CUE = alt(['avísame', 'avisame', 'avisarme', 'recuérdame', 'recuerdame', 'recordarme', 'notifícame', 'notificame', 'recordatorio', 'aviso', 'avisa']);
const ES_MONTHS: Record<string, number> = {
  enero: 0, ene: 0, febrero: 1, feb: 1, marzo: 2, mar: 2, abril: 3, abr: 3, mayo: 4, may: 4, junio: 5, jun: 5, julio: 6, jul: 6,
  agosto: 7, ago: 7, septiembre: 8, setiembre: 8, sept: 8, sep: 8, set: 8, octubre: 9, oct: 9, noviembre: 10, nov: 10, diciembre: 11, dic: 11,
};
const ES_MON_RE = alt(Object.keys(ES_MONTHS));
const ES: Table = latinTable({
  nums: ES_NUMS,
  relAfter: rx(`${B1}(?:en|dentro\\s+de)\\s+(\\d+|un|una|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|cuarenta|cincuenta|sesenta)\\s*(minutos?|min|horas?|hora|d[ií]as?|semanas?)${B2}`),
  relAfterHalf: rx(`${B1}(?:en|dentro\\s+de)\\s+media\\s+hora${B2}`),
  unitOf: (u) => (/^min/.test(u) ? 'min' : /^h/.test(u) ? 'hour' : /^d/.test(u) ? 'day' : 'week'),
  dayParts: [
    { re: rx(`${B1}(?:por|de|en|a)\\s+la\\s+madrugada${B2}`), mer: 'am', plain: true },
    { re: rx(`${B1}(?:por|de|en|a)\\s+la\\s+mañana${B2}`), mer: 'am', plain: true },
    { re: rx(`${B1}esta\\s+mañana${B2}`), mer: 'am', plain: true, today: true },
    { re: rx(`${B1}(?:por|de|en|a)\\s+la\\s+tarde${B2}`), mer: 'pm', plain: true },
    { re: rx(`${B1}esta\\s+tarde${B2}`), mer: 'pm', plain: true, today: true },
    { re: rx(`${B1}(?:por|de|en|a)\\s+la\\s+noche${B2}`), mer: 'pm', plain: true, night: true },
    { re: rx(`${B1}esta\\s+noche${B2}`), mer: 'pm', plain: true, today: true, night: true },
  ],
  noon: rx(`${B1}(?:al\\s+|a\\s+)?mediod[ií]a${B2}`),
  midnight: rx(`${B1}(?:a\\s+)?medianoche${B2}`),
  relDays: [
    { re: rx(`${B1}pasado\\s+mañana${B2}`), offset: 2 },
    { re: rx(`${B1}mañana${B2}`), offset: 1 },
    { re: rx(`${B1}hoy${B2}`), offset: 0 },
    { re: rx(`${B1}ayer${B2}`), offset: -1 },
  ],
  weekdays: {
    domingo: 0, dom: 0, lunes: 1, lun: 1, martes: 2, miércoles: 3, miercoles: 3, mié: 3, mie: 3, jueves: 4, jue: 4, viernes: 5, vie: 5, sábado: 6, sabado: 6, sáb: 6, sab: 6,
  },
  weekdayPre: 'el\\s+próximo|el\\s+proximo|próximo|proximo|este|el',
  weekdayPost: 'de\\s+la\\s+semana\\s+que\\s+viene|de\\s+la\\s+próxima\\s+semana|de\\s+la\\s+proxima\\s+semana|de\\s+la\\s+semana\\s+pasada|que\\s+viene|próximo|proximo|pasado',
  isNextDay: /pr[óo]ximo|que viene/,
  isNextWeek: /semana que viene|pr[óo]xima semana/,
  isPrevWeek: /semana pasada/,
  weekOnly: rx(`${B1}(?:la\\s+)?(semana\\s+que\\s+viene|próxima\\s+semana|proxima\\s+semana|semana\\s+próxima|semana\\s+proxima|esta\\s+semana|semana\\s+pasada)${B2}`),
  weekOnlyOffset: (s) => (/pasada/.test(s) ? -7 : /esta/.test(s) ? 0 : 7),
  months: ES_MONTHS,
  dates: [
    [rx(`${B1}(?:el\\s+)?(?:d[ií]a\\s+)?(\\d{1,2}|primero)\\s+de\\s+(${ES_MON_RE})\\.?${B2}(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?`), (m, mo) => namedDate(mo, m, 1, 2, 3)],
    [rx(`${B1}(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{4}|\\d{2}))?${B2}`), (m) => numericDMY(m)],
    [rx(`${B1}(?:el\\s+d[ií]a|el|d[ií]a)\\s+(\\d{1,2})${B2}(?!\\s*[:h/.])`), (m) => ({ m, month: null, date: parseInt(m[1], 10) })],
  ],
  time: (w, nums) => {
    const H = `(${ES_H})`;
    const pick = (m: RegExpMatchArray, hI: number, mdI: number, ywI: number, menosI: number): TimeHit | null => {
      let hour = wordNum(nums, m[hI]);
      let minute = 0;
      if (!(hour >= 0 && hour <= 24)) return null;
      if (mdI && m[mdI]) minute = parseInt(m[mdI], 10);
      else if (ywI && m[ywI]) minute = wordNum(nums, m[ywI]);
      if (menosI && m[menosI]) {
        const x = wordNum(nums, m[menosI]);
        if (!(x > 0 && x < 60)) return null;
        hour = hour === 0 ? 23 : hour - 1;
        minute = 60 - x;
      }
      if (!(minute >= 0 && minute <= 59)) return null;
      return { m, hour, minute };
    };
    return firstHit<TimeHit>(w, [
      [rx(`${B1}(?:a\\s+las?|las?|hacia\\s+las?|sobre\\s+las?|para\\s+las?)\\s+${H}(?:[:.](\\d{2}))?(?:\\s*(?:hs|h|horas?)${B2})?(?:\\s+y\\s+(${ES_MIN})${B2})?(?:\\s+menos\\s+(${ES_MIN})${B2})?`), (m) => pick(m, 1, 2, 3, 4)],
      [rx(`${B1}${H}[:.](\\d{2})(?:\\s*(?:hs|h))?${B2}`), (m) => pick(m, 1, 2, 0, 0)],
      [rx(`${B1}${H}\\s*(?:hs|h|horas?)${B2}(?:\\s+y\\s+(${ES_MIN})${B2})?(?:\\s+menos\\s+(${ES_MIN})${B2})?`), (m) => pick(m, 1, 0, 2, 3)],
      [rx(`${B1}${H}\\s+y\\s+(media|cuarto)${B2}`), (m) => pick(m, 1, 0, 2, 0)],
    ]);
  },
  remind: [
    [rx(`${B1}(?:(?:${ES_CUE})\\s+)?(?:con\\s+)?media\\s+hora\\s+(?:antes|de\\s+antelaci[óo]n|de\\s+anticipaci[óo]n)${B2}(?:\\s+(?:${ES_CUE}))?`), () => 30],
    [rx(`${B1}(?:(?:${ES_CUE})\\s+)?(?:con\\s+)?(\\d{1,3}|un|una|dos|tres|cinco|diez|quince|veinte|treinta|cuarenta\\s+y\\s+cinco|cuarenta|cincuenta|sesenta)\\s*(minutos?|min|horas?|hora|h|d[ií]as?)\\s+(?:antes|de\\s+antelaci[óo]n|de\\s+anticipaci[óo]n)${B2}(?:\\s+(?:${ES_CUE}))?`), (m) => {
      const u = m[2].toLowerCase();
      return remindOption(wordNum(ES_NUMS, m[1]), /^min/.test(u) ? 'min' : /^h/.test(u) ? 'hour' : 'day');
    }],
    [rx(`${B1}(?:(?:${ES_CUE})\\s+)?(?:el\\s+d[ií]a\\s+anterior|la\\s+v[ií]spera)${B2}(?:\\s+(?:${ES_CUE}))?`), () => 1440],
  ],
  lead: 'a\\s+las|a\\s+la|para\\s+el|para\\s+la|para|el|los|las|la|en|por|de|del|al|desde|hasta|este|esta',
  cues: new RegExp(`(^|\\s)(?:${ES_CUE})(?:\\s+(?:que|de|a|para))?(?=\\s|$)`, 'giu'),
  edgeLead: 'a|en|para|por|de|del|al|hasta|desde|y|que',
  edgeTail: 'a|en|para|por|de|del|al|el|la|los|las|y|hasta|desde|que',
});

// ─── 프랑스어 ─────────────────────────────────────────────────────────────────
const FR_NUMS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  quinze: 15, vingt: 20, 'vingt-cinq': 25, 'vingt cinq': 25, trente: 30, quarante: 40, 'quarante-cinq': 45, 'quarante cinq': 45, cinquante: 50, soixante: 60,
  demie: 30, demi: 30, quart: 15, 'le quart': 15,
};
const FR_H = `\\d{1,2}|${alt(['une', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'])}`;
const FR_MIN = `demie|demi|quart|le\\s+quart|\\d{1,2}|${alt(['cinq', 'dix', 'quinze', 'vingt', 'vingt-cinq', 'trente', 'quarante', 'cinquante'])}`;
const FR_CUE = alt(['préviens-moi', 'préviens moi', 'previens-moi', 'previens moi', 'rappelle-moi', 'rappelle moi', 'rappelle le moi', 'avertis-moi', 'avertis moi', 'me prévenir', 'me rappeler', 'prévenir', 'rappel', 'alerte-moi', 'alerte moi']);
const FR_MONTHS: Record<string, number> = {
  janvier: 0, janv: 0, février: 1, fevrier: 1, févr: 1, fevr: 1, fév: 1, fev: 1, mars: 2, avril: 3, avr: 3, mai: 4, juin: 5, juillet: 6, juil: 6,
  août: 7, aout: 7, septembre: 8, sept: 8, octobre: 9, oct: 9, novembre: 10, nov: 10, décembre: 11, decembre: 11, déc: 11, dec: 11,
};
const FR_MON_RE = alt(Object.keys(FR_MONTHS));
const FR: Table = latinTable({
  nums: FR_NUMS,
  relAfter: rx(`${B1}dans\\s+(\\d+|une|un|deux|trois|quatre|cinq|dix|quinze|vingt|trente|quarante|cinquante|soixante)\\s*(minutes?|min|heures?|h|jours?|semaines?)${B2}`),
  relAfterHalf: rx(`${B1}dans\\s+une\\s+demi[-\\s]?heure${B2}`),
  unitOf: (u) => (/^min/.test(u) ? 'min' : /^h/.test(u) ? 'hour' : /^j/.test(u) ? 'day' : 'week'),
  dayParts: [
    { re: rx(`${B1}(?:de\\s+|dans\\s+|pendant\\s+)?l['’]après-midi${B2}|${B1}cet\\s+après-midi${B2}|${B1}après-midi${B2}`), mer: 'pm', plain: true },
    { re: rx(`${B1}(?:du|le|au|dans\\s+le)\\s+matin${B2}|${B1}dans\\s+la\\s+matinée${B2}|${B1}matin${B2}`), mer: 'am', plain: true },
    { re: rx(`${B1}ce\\s+matin${B2}`), mer: 'am', plain: true, today: true },
    { re: rx(`${B1}(?:du|le|au|dans\\s+le)\\s+soir${B2}|${B1}dans\\s+la\\s+soirée${B2}|${B1}soir${B2}`), mer: 'pm', plain: true },
    { re: rx(`${B1}ce\\s+soir${B2}`), mer: 'pm', plain: true, today: true, night: true },
    { re: rx(`${B1}(?:de\\s+|dans\\s+)?la\\s+nuit${B2}|${B1}nuit${B2}`), mer: 'pm', plain: true, night: true },
    { re: rx(`${B1}cette\\s+nuit${B2}`), mer: 'pm', plain: true, today: true, night: true },
  ],
  noon: rx(`${B1}(?:à\\s+|a\\s+)?midi${B2}`),
  midnight: rx(`${B1}(?:à\\s+|a\\s+)?minuit${B2}`),
  relDays: [
    { re: rx(`${B1}après[-\\s]demain${B2}`), offset: 2 },
    { re: rx(`${B1}demain${B2}`), offset: 1 },
    { re: rx(`${B1}aujourd['’]hui${B2}`), offset: 0 },
    { re: rx(`${B1}hier${B2}`), offset: -1 },
  ],
  weekdays: {
    dimanche: 0, 'dim.': 0, lundi: 1, 'lun.': 1, mardi: 2, 'mar.': 2, mercredi: 3, 'mer.': 3, jeudi: 4, 'jeu.': 4, vendredi: 5, 'ven.': 5, samedi: 6, 'sam.': 6,
  },
  weekdayPre: 'ce|le',
  weekdayPost: 'de\\s+la\\s+semaine\\s+prochaine|de\\s+la\\s+semaine\\s+dernière|de\\s+la\\s+semaine\\s+derniere|prochain|dernier|en\\s+huit',
  isNextDay: /prochain|en huit/,
  isNextWeek: /semaine prochaine/,
  isPrevWeek: /semaine derni[èe]re/,
  weekOnly: rx(`${B1}(?:la\\s+)?(semaine\\s+prochaine|semaine\\s+dernière|semaine\\s+derniere|cette\\s+semaine)${B2}`),
  weekOnlyOffset: (s) => (/derni/.test(s) ? -7 : /cette/.test(s) ? 0 : 7),
  months: FR_MONTHS,
  dates: [
    [rx(`${B1}(?:le\\s+)?(\\d{1,2}|1er|premier)\\s+(${FR_MON_RE})\\.?${B2}(?:\\s+(\\d{4}))?`), (m, mo) => namedDate(mo, m, 1, 2, 3)],
    [rx(`${B1}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?${B2}`), (m) => numericDMY(m)],
    [rx(`${B1}le\\s+(\\d{1,2})(?:er)?${B2}(?!\\s*(?:h|:|/))`), (m) => ({ m, month: null, date: parseInt(m[1], 10) })],
  ],
  time: (w, nums) => {
    const H = `(${FR_H})`;
    const pick = (m: RegExpMatchArray, hI: number, mdI: number, etI: number, moinsI: number): TimeHit | null => {
      let hour = wordNum(nums, m[hI]);
      let minute = 0;
      if (!(hour >= 0 && hour <= 24)) return null;
      if (mdI && m[mdI]) minute = parseInt(m[mdI], 10);
      else if (etI && m[etI]) minute = wordNum(nums, m[etI]);
      if (moinsI && m[moinsI]) {
        const x = wordNum(nums, m[moinsI]);
        if (!(x > 0 && x < 60)) return null;
        hour = hour === 0 ? 23 : hour - 1;
        minute = 60 - x;
      }
      if (!(minute >= 0 && minute <= 59)) return null;
      return { m, hour, minute };
    };
    return firstHit<TimeHit>(w, [
      [rx(`${B1}(?:à|vers)\\s+${H}(?:\\s*(?:h|heures?|:)\\s*(\\d{2})?)?${B2}(?:\\s+et\\s+(${FR_MIN})${B2})?(?:\\s+moins\\s+(${FR_MIN})${B2})?`), (m) => pick(m, 1, 2, 3, 4)],
      [rx(`${B1}${H}\\s*(?:h|heures?)\\s*(\\d{2})?${B2}(?:\\s+et\\s+(${FR_MIN})${B2})?(?:\\s+moins\\s+(${FR_MIN})${B2})?`), (m) => pick(m, 1, 2, 3, 4)],
      [rx(`${B1}${H}:(\\d{2})${B2}`), (m) => pick(m, 1, 2, 0, 0)],
    ]);
  },
  remind: [
    [rx(`${B1}(?:(?:${FR_CUE})\\s+)?une\\s+demi[-\\s]?heure\\s+(?:avant|à\\s+l['’]avance|a\\s+l['’]avance|plus\\s+t[ôo]t)${B2}(?:\\s+(?:${FR_CUE}))?`), () => 30],
    [rx(`${B1}(?:(?:${FR_CUE})\\s+)?(\\d{1,3}|une|un|deux|trois|cinq|dix|quinze|vingt|trente|quarante-cinq|quarante|cinquante|soixante)\\s*(minutes?|min|heures?|h|jours?)\\s+(?:avant|à\\s+l['’]avance|a\\s+l['’]avance|plus\\s+t[ôo]t)${B2}(?:\\s+(?:${FR_CUE}))?`), (m) => {
      const u = m[2].toLowerCase();
      return remindOption(wordNum(FR_NUMS, m[1]), /^min/.test(u) ? 'min' : /^h/.test(u) ? 'hour' : 'day');
    }],
    [rx(`${B1}(?:(?:${FR_CUE})\\s+)?(?:la\\s+veille(?:\\s+au\\s+soir)?|le\\s+jour\\s+d['’]avant)${B2}(?:\\s+(?:${FR_CUE}))?`), () => 1440],
  ],
  lead: 'à|a|au|le|la|les|ce|cet|cette|vers|pour\\s+le|pour|dès|de|du|en',
  cues: new RegExp(`(^|\\s)(?:${FR_CUE})(?:\\s+(?:de|que|à|d['’]))?(?=\\s|$)`, 'giu'),
  edgeLead: 'à|a|au|en|pour|de|du|dès|vers|et|que',
  edgeTail: 'à|a|au|en|pour|de|du|le|la|les|et|vers|que',
});

// ─── 독일어 ───────────────────────────────────────────────────────────────────
const DE_NUMS: Record<string, number> = {
  ein: 1, eins: 1, eine: 1, einer: 1, einem: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12,
  fünfzehn: 15, fuenfzehn: 15, zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfundvierzig: 45, fuenfundvierzig: 45, fünfzig: 50, fuenfzig: 50, sechzig: 60, viertel: 15, halb: 30,
};
const DE_H = `\\d{1,2}|${alt(['eins', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'fuenf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'zwoelf'])}`;
const DE_MIN = alt(['fünf', 'fuenf', 'zehn', 'fünfzehn', 'fuenfzehn', 'zwanzig', 'dreißig', 'dreissig', 'vierzig', 'fünfzig', 'fuenfzig']);
const DE_CUE = alt(['erinnere mich', 'erinner mich', 'erinnere mich daran', 'erinnerung', 'erinnern', 'sag mir bescheid', 'bescheid geben', 'bescheid sagen', 'benachrichtige mich', 'benachrichtigen', 'denk daran', 'bitte']);
const DE_MONTHS: Record<string, number> = {
  januar: 0, jan: 0, jänner: 0, februar: 1, feb: 1, märz: 2, maerz: 2, mrz: 2, april: 3, apr: 3, mai: 4, juni: 5, jun: 5, juli: 6, jul: 6,
  august: 7, aug: 7, september: 8, sept: 8, sep: 8, oktober: 9, okt: 9, november: 10, nov: 10, dezember: 11, dez: 11,
};
const DE_MON_RE = alt(Object.keys(DE_MONTHS));
const DE: Table = latinTable({
  nums: DE_NUMS,
  relAfter: rx(`${B1}in\\s+(\\d+|einer|einem|eine|ein|zwei|drei|vier|fünf|fuenf|zehn|fünfzehn|zwanzig|dreißig|dreissig|vierzig|fünfzig|sechzig)\\s*(minuten?|min|stunden?|std|tagen?|wochen?)${B2}`),
  relAfterHalf: rx(`${B1}in\\s+einer\\s+halben\\s+stunde${B2}`),
  unitOf: (u) => (/^min/.test(u) ? 'min' : /^st/.test(u) ? 'hour' : /^t/.test(u) ? 'day' : 'week'),
  dayParts: [
    { re: rx(`${B1}heute\\s+morgen${B2}|${B1}heute\\s+früh${B2}|${B1}heute\\s+vormittag${B2}`), mer: 'am', plain: true, today: true },
    { re: rx(`${B1}heute\\s+nachmittag${B2}|${B1}heute\\s+mittag${B2}`), mer: 'pm', plain: true, today: true },
    { re: rx(`${B1}heute\\s+abend${B2}`), mer: 'pm', plain: true, today: true, night: true },
    { re: rx(`${B1}heute\\s+nacht${B2}`), mer: 'pm', plain: true, today: true, night: true },
    { re: rx(`${B1}(?:morgens|vormittags|am\\s+morgen|am\\s+vormittag|in\\s+der\\s+früh|früh|in\\s+der\\s+fruehe|fruehmorgens|frühmorgens)${B2}`), mer: 'am', plain: true },
    { re: rx(`${B1}(?:nachmittags|am\\s+nachmittag|mittags|am\\s+mittag)${B2}`), mer: 'pm', plain: true },
    { re: rx(`${B1}(?:abends|am\\s+abend)${B2}`), mer: 'pm', plain: true, night: true },
    { re: rx(`${B1}(?:nachts|in\\s+der\\s+nacht)${B2}`), mer: 'pm', plain: true, night: true },
  ],
  noon: rx(`${B1}(?:um\\s+|zu\\s+)?mittag${B2}`),
  midnight: rx(`${B1}(?:um\\s+)?mitternacht${B2}`),
  relDays: [
    { re: rx(`${B1}übermorgen${B2}|${B1}uebermorgen${B2}`), offset: 2 },
    { re: rx(`${B1}morgen${B2}`), offset: 1 },
    { re: rx(`${B1}heute${B2}`), offset: 0 },
    { re: rx(`${B1}gestern${B2}`), offset: -1 },
  ],
  weekdays: {
    sonntag: 0, 'so.': 0, montag: 1, 'mo.': 1, dienstag: 2, 'di.': 2, mittwoch: 3, 'mi.': 3, donnerstag: 4, 'do.': 4, freitag: 5, 'fr.': 5, samstag: 6, sonnabend: 6, 'sa.': 6,
  },
  weekdayPre: 'am\\s+nächsten|am\\s+naechsten|am\\s+kommenden|nächsten|naechsten|nächste|kommenden|diesen|am|den',
  weekdayPost: 'nächste\\s+woche|naechste\\s+woche|kommende\\s+woche|nächster\\s+woche|naechster\\s+woche|letzte\\s+woche|in\\s+einer\\s+woche',
  isNextDay: /n[äa]e?chste|kommenden|in einer woche/,
  isNextWeek: /woche/,
  isPrevWeek: /letzte woche/,
  weekOnly: rx(`${B1}(nächste\\s+woche|naechste\\s+woche|kommende\\s+woche|diese\\s+woche|letzte\\s+woche|vergangene\\s+woche)${B2}`),
  weekOnlyOffset: (s) => (/letzte|vergangene/.test(s) ? -7 : /diese/.test(s) ? 0 : 7),
  months: DE_MONTHS,
  dates: [
    [rx(`${B1}(?:am\\s+|den\\s+)?(\\d{1,2})\\.?\\s+(${DE_MON_RE})\\.?${B2}(?:\\s+(\\d{4}))?`), (m, mo) => namedDate(mo, m, 1, 2, 3)],
    [rx(`${B1}(\\d{1,2})\\.(\\d{1,2})\\.(?:(\\d{4}|\\d{2})${B2})?(?!\\d)`), (m) => numericDMY(m)],
    [rx(`${B1}(?:am|den)\\s+(\\d{1,2})\\.(?!\\d)`), (m) => ({ m, month: null, date: parseInt(m[1], 10) })],
  ],
  time: (w, nums) => {
    const H = `(${DE_H})`;
    const hm = (m: RegExpMatchArray, hour: number, minute: number): TimeHit | null =>
      hour >= 0 && hour <= 24 && minute >= 0 && minute <= 59 ? { m, hour, minute } : null;
    return firstHit<TimeHit>(w, [
      [rx(`${B1}halb\\s+${H}${B2}`), (m) => { const h = wordNum(nums, m[1]); return hm(m, h === 0 ? 23 : h - 1, 30); }],
      [rx(`${B1}(?:drei\\s*viertel|dreiviertel)\\s+${H}${B2}`), (m) => { const h = wordNum(nums, m[1]); return hm(m, h === 0 ? 23 : h - 1, 45); }],
      [rx(`${B1}viertel\\s+(vor|nach)\\s+${H}${B2}`), (m) => { const h = wordNum(nums, m[2]); return m[1] === 'vor' ? hm(m, h === 0 ? 23 : h - 1, 45) : hm(m, h, 15); }],
      [rx(`${B1}(\\d{1,2}|${DE_MIN})\\s+(?:minuten\\s+)?(vor|nach)\\s+${H}${B2}`), (m) => {
        const x = wordNum(nums, m[1]);
        const h = wordNum(nums, m[3]);
        if (!(x > 0 && x < 60)) return null;
        return m[2] === 'vor' ? hm(m, h === 0 ? 23 : h - 1, 60 - x) : hm(m, h, x);
      }],
      [rx(`${B1}(?:um|gegen|ab)\\s+${H}(?:[:.](\\d{2}))?(?:\\s*uhr(?:\\s+(\\d{1,2})${B2})?)?${B2}`), (m) => hm(m, wordNum(nums, m[1]), m[2] ? parseInt(m[2], 10) : m[3] ? parseInt(m[3], 10) : 0)],
      [rx(`${B1}${H}(?:[:.](\\d{2}))?\\s*uhr(?:\\s+(\\d{1,2})${B2})?${B2}`), (m) => hm(m, wordNum(nums, m[1]), m[2] ? parseInt(m[2], 10) : m[3] ? parseInt(m[3], 10) : 0)],
      [rx(`${B1}${H}:(\\d{2})${B2}`), (m) => hm(m, wordNum(nums, m[1]), parseInt(m[2], 10))],
    ]);
  },
  remind: [
    [rx(`${B1}(?:(?:${DE_CUE})\\s+)?eine\\s+halbe\\s+stunde\\s+(?:vorher|davor|im\\s+voraus|früher|frueher|zuvor|vor\\s+dem\\s+termin)${B2}(?:\\s+(?:${DE_CUE}))?`), () => 30],
    [rx(`${B1}(?:(?:${DE_CUE})\\s+)?(\\d{1,3}|eine|einen|einem|einer|ein|zwei|drei|fünf|fuenf|zehn|fünfzehn|fuenfzehn|zwanzig|dreißig|dreissig|fünfundvierzig|vierzig|fünfzig|fuenfzig|sechzig)\\s*(minuten?|min|stunden?|std|tage?)\\s+(?:vorher|davor|im\\s+voraus|früher|frueher|zuvor|vor\\s+dem\\s+termin)${B2}(?:\\s+(?:${DE_CUE}))?`), (m) => {
      const u = m[2].toLowerCase();
      return remindOption(wordNum(DE_NUMS, m[1]), /^min/.test(u) ? 'min' : /^st/.test(u) ? 'hour' : 'day');
    }],
    [rx(`${B1}(?:(?:${DE_CUE})\\s+)?(?:am\\s+vortag|am\\s+tag\\s+davor|am\\s+tag\\s+vorher|am\\s+vorabend|einen\\s+tag\\s+vorher)${B2}(?:\\s+(?:${DE_CUE}))?`), () => 1440],
  ],
  lead: 'um|am|gegen|den|der|die|das|im|in\\s+der|an|ab|für|fuer|bis|zu',
  cues: new RegExp(`(^|\\s)(?:${DE_CUE})(?:\\s+(?:an|daran|dass|zu))?(?=\\s|$)`, 'giu'),
  edgeLead: 'um|am|an|im|in|für|fuer|bis|zu|und|dass',
  edgeTail: 'um|am|an|im|in|für|fuer|bis|zu|und|den|der|die|das|dass',
});

// ─── 포르투갈어 ───────────────────────────────────────────────────────────────
const PT_NUMS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  quinze: 15, vinte: 20, 'vinte e cinco': 25, trinta: 30, quarenta: 40, 'quarenta e cinco': 45, cinquenta: 50, sessenta: 60, meia: 30,
};
const PT_H = `\\d{1,2}|${alt(['uma', 'um', 'duas', 'dois', 'três', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze'])}`;
const PT_MIN = `meia|\\d{1,2}|${alt(['cinco', 'dez', 'quinze', 'vinte', 'vinte e cinco', 'trinta', 'quarenta', 'cinquenta'])}`;
const PT_CUE = alt(['me avise', 'me avisa', 'avise-me', 'avisa-me', 'me lembre', 'me lembra', 'lembre-me', 'lembra-me', 'me notifique', 'me notifica', 'lembrete', 'aviso', 'por favor']);
const PT_MONTHS: Record<string, number> = {
  janeiro: 0, jan: 0, fevereiro: 1, fev: 1, março: 2, marco: 2, mar: 2, abril: 3, abr: 3, maio: 4, mai: 4, junho: 5, jun: 5, julho: 6, jul: 6,
  agosto: 7, ago: 7, setembro: 8, set: 8, outubro: 9, out: 9, novembro: 10, nov: 10, dezembro: 11, dez: 11,
};
const PT_MON_RE = alt(Object.keys(PT_MONTHS));
const PT: Table = latinTable({
  nums: PT_NUMS,
  relAfter: rx(`${B1}(?:daqui\\s+a|em|dentro\\s+de)\\s+(\\d+|uma|um|duas|dois|três|tres|quatro|cinco|dez|quinze|vinte|trinta|quarenta|cinquenta|sessenta)\\s*(minutos?|min|horas?|hora|dias?|semanas?)${B2}`),
  relAfterHalf: rx(`${B1}(?:daqui\\s+a|em|dentro\\s+de)\\s+meia\\s+hora${B2}`),
  unitOf: (u) => (/^min/.test(u) ? 'min' : /^h/.test(u) ? 'hour' : /^d/.test(u) ? 'day' : 'week'),
  dayParts: [
    { re: rx(`${B1}(?:de|da|pela)\\s+madrugada${B2}`), mer: 'am', plain: true },
    { re: rx(`${B1}(?:de|da|pela|na)\\s+manhã${B2}|${B1}(?:de|da|pela|na)\\s+manha${B2}`), mer: 'am', plain: true },
    { re: rx(`${B1}(?:hoje\\s+de\\s+manhã|hoje\\s+de\\s+manha|esta\\s+manhã|essa\\s+manhã)${B2}`), mer: 'am', plain: true, today: true },
    { re: rx(`${B1}(?:de|da|pela|à|a|na)\\s+tarde${B2}`), mer: 'pm', plain: true },
    { re: rx(`${B1}(?:hoje\\s+à\\s+tarde|hoje\\s+a\\s+tarde|esta\\s+tarde|essa\\s+tarde)${B2}`), mer: 'pm', plain: true, today: true },
    { re: rx(`${B1}(?:de|da|pela|à|a|na)\\s+noite${B2}`), mer: 'pm', plain: true, night: true },
    { re: rx(`${B1}(?:hoje\\s+à\\s+noite|hoje\\s+a\\s+noite|esta\\s+noite|essa\\s+noite)${B2}`), mer: 'pm', plain: true, today: true, night: true },
  ],
  noon: rx(`${B1}(?:ao\\s+)?meio[-\\s]dia${B2}`),
  midnight: rx(`${B1}(?:à\\s+|a\\s+)?meia[-\\s]noite${B2}`),
  relDays: [
    { re: rx(`${B1}depois\\s+de\\s+amanhã${B2}|${B1}depois\\s+de\\s+amanha${B2}`), offset: 2 },
    { re: rx(`${B1}amanhã${B2}|${B1}amanha${B2}`), offset: 1 },
    { re: rx(`${B1}hoje${B2}`), offset: 0 },
    { re: rx(`${B1}ontem${B2}`), offset: -1 },
  ],
  weekdays: {
    domingo: 0, dom: 0, 'segunda-feira': 1, segunda: 1, seg: 1, 'terça-feira': 2, 'terca-feira': 2, terça: 2, terca: 2, 'quarta-feira': 3, quarta: 3, qua: 3,
    'quinta-feira': 4, quinta: 4, qui: 4, 'sexta-feira': 5, sexta: 5, sex: 5, sábado: 6, sabado: 6, sáb: 6, sab: 6,
  },
  weekdayPre: 'na\\s+próxima|na\\s+proxima|no\\s+próximo|no\\s+proximo|próxima|proxima|próximo|proximo|nesta|neste|esta|este|na|no',
  weekdayPost: 'da\\s+semana\\s+que\\s+vem|da\\s+próxima\\s+semana|da\\s+proxima\\s+semana|da\\s+semana\\s+passada|que\\s+vem',
  isNextDay: /pr[óo]xim|que vem/,
  isNextWeek: /semana que vem|pr[óo]xima semana/,
  isPrevWeek: /semana passada/,
  weekOnly: rx(`${B1}(?:na\\s+)?(semana\\s+que\\s+vem|próxima\\s+semana|proxima\\s+semana|semana\\s+próxima|semana\\s+proxima|esta\\s+semana|essa\\s+semana|semana\\s+passada)${B2}`),
  weekOnlyOffset: (s) => (/passada/.test(s) ? -7 : /esta|essa/.test(s) ? 0 : 7),
  months: PT_MONTHS,
  dates: [
    [rx(`${B1}(?:no\\s+)?(?:dia\\s+)?(\\d{1,2}|primeiro)\\s+de\\s+(${PT_MON_RE})\\.?${B2}(?:\\s+de\\s+(\\d{4}))?`), (m, mo) => namedDate(mo, m, 1, 2, 3)],
    [rx(`${B1}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?${B2}`), (m) => numericDMY(m)],
    [rx(`${B1}(?:no\\s+)?dia\\s+(\\d{1,2})${B2}(?!\\s*(?:h|:|/))`), (m) => ({ m, month: null, date: parseInt(m[1], 10) })],
  ],
  time: (w, nums) => {
    const H = `(${PT_H})`;
    const hm = (m: RegExpMatchArray, hour: number, minute: number): TimeHit | null =>
      hour >= 0 && hour <= 24 && minute >= 0 && minute <= 59 ? { m, hour, minute } : null;
    const pick = (m: RegExpMatchArray, hI: number, mdI: number, eI: number): TimeHit | null =>
      hm(m, wordNum(nums, m[hI]), mdI && m[mdI] ? parseInt(m[mdI], 10) : eI && m[eI] ? wordNum(nums, m[eI]) : 0);
    return firstHit<TimeHit>(w, [
      [rx(`${B1}(\\d{1,2}|quinze|vinte|dez|cinco)\\s+para\\s+as\\s+${H}${B2}`), (m) => {
        const x = wordNum(nums, m[1]);
        const h = wordNum(nums, m[2]);
        if (!(x > 0 && x < 60)) return null;
        return hm(m, h === 0 ? 23 : h - 1, 60 - x);
      }],
      [rx(`${B1}(?:às|as|à|pelas|para\\s+as)\\s+${H}(?:[:h.](\\d{2}))?(?:\\s*(?:hrs|h|horas?)${B2})?(?:\\s+e\\s+(${PT_MIN})${B2})?`), (m) => pick(m, 1, 2, 3)],
      [rx(`${B1}${H}[:h](\\d{2})${B2}`), (m) => pick(m, 1, 2, 0)],
      [rx(`${B1}${H}\\s*(?:hrs|h|horas?)${B2}(?:\\s+e\\s+(${PT_MIN})${B2})?`), (m) => pick(m, 1, 0, 2)],
      [rx(`${B1}${H}\\s+e\\s+(meia)${B2}`), (m) => pick(m, 1, 0, 2)],
    ]);
  },
  remind: [
    [rx(`${B1}(?:(?:${PT_CUE})\\s+)?(?:com\\s+)?meia\\s+hora\\s+(?:antes|de\\s+antecedência|de\\s+antecedencia)${B2}(?:\\s+(?:${PT_CUE}))?`), () => 30],
    [rx(`${B1}(?:(?:${PT_CUE})\\s+)?(?:com\\s+)?(\\d{1,3}|uma|um|duas|dois|três|tres|cinco|dez|quinze|vinte|trinta|quarenta\\s+e\\s+cinco|quarenta|cinquenta|sessenta)\\s*(minutos?|min|horas?|hora|h|dias?)\\s+(?:antes|de\\s+antecedência|de\\s+antecedencia)${B2}(?:\\s+(?:${PT_CUE}))?`), (m) => {
      const u = m[2].toLowerCase();
      return remindOption(wordNum(PT_NUMS, m[1]), /^min/.test(u) ? 'min' : /^h/.test(u) ? 'hour' : 'day');
    }],
    [rx(`${B1}(?:(?:${PT_CUE})\\s+)?(?:no\\s+dia\\s+anterior|na\\s+véspera|na\\s+vespera)${B2}(?:\\s+(?:${PT_CUE}))?`), () => 1440],
  ],
  lead: 'às|as|à|a|no|na|nos|nas|o|para\\s+o|para\\s+a|para|em|de|do|da|pelas|até|ate|desde|este|esta',
  cues: new RegExp(`(^|\\s)(?:${PT_CUE})(?:\\s+(?:de|que|para|a))?(?=\\s|$)`, 'giu'),
  edgeLead: 'a|à|às|em|para|por|de|do|da|até|desde|e|que',
  edgeTail: 'a|à|às|em|para|por|de|do|da|o|os|as|até|desde|e|que',
});

// ─── 일본어 ───────────────────────────────────────────────────────────────────
const JA_CUE_TAIL = '(?:に|には)?\\s*(?:事前に|前もって)?\\s*(?:知らせて|教えて|通知して|通知|お知らせ|リマインド(?:して)?|アラーム|お願い(?:します)?)?(?:ください|下さい|ね|よ)?';
const JA: Table = {
  cjk: true,
  tail: /^(?:には|にも|から|まで|頃|ごろ|に|の|は|で|へ)/u,
  relAfter: (w) => {
    const m = w.match(/(\d+|[零〇一二两兩三四五六七八九十]{1,3}|半)\s*(分|時間|日|週間)\s*(?:後|あと|経ったら|たったら|したら)/u);
    if (!m) return null;
    const n = cjkNum(m[1]);
    if (!(n > 0)) return null;
    const unit: Unit = m[2] === '分' ? 'min' : m[2] === '時間' ? 'hour' : m[2] === '日' ? 'day' : 'week';
    return { m, n, unit };
  },
  dayParts: [
    { re: /午前/u, mer: 'am', plain: true },
    { re: /午後/u, mer: 'pm', plain: true },
    { re: /今朝/u, mer: 'am', plain: true, today: true },
    { re: /今夜|今晩/u, mer: 'pm', plain: true, today: true, night: true },
    { re: /早朝|朝/u, mer: 'am' },
    { re: /深夜|未明/u, mer: 'am' },
    { re: /夕方|お昼|昼(?![食休寝間])|正午過ぎ/u, mer: 'pm' },
    { re: /夜(?![景勤食更明])|晩(?![御飯餐])/u, mer: 'pm', night: true },
  ],
  noon: /正午/u,
  midnight: /真夜中/u,
  relDays: [
    { re: /明後日|あさって/u, offset: 2 },
    { re: /明日|あした|あす/u, offset: 1 },
    { re: /今日|きょう|本日/u, offset: 0 },
    { re: /昨日|きのう/u, offset: -1 },
  ],
  weekday: (w) => {
    const m = w.match(/(来週|今週|先週|再来週|次の)?\s*の?\s*([日月火水木金土])曜日?/u);
    if (!m) return null;
    const dow = '日月火水木金土'.indexOf(m[2]);
    const s = m[1] ?? '';
    const mode = s === '来週' ? 'nextWeek' : s === '先週' ? 'prevWeek' : s === '次の' ? 'nextDay' : 'plain';
    return { m, dow, mode };
  },
  weekOnly: (w) => {
    const m = w.match(/再来週|来週|今週|先週/u);
    if (!m) return null;
    return { m, offset: m[0] === '再来週' ? 14 : m[0] === '来週' ? 7 : m[0] === '先週' ? -7 : 0 };
  },
  date: (w) =>
    firstHit<DateHit>(w, [
      [/(?:(\d{4})年)?\s*(\d{1,2}|[零〇一二三四五六七八九十]{1,3})月\s*(\d{1,2}|[零〇一二三四五六七八九十]{1,3})日/u, (m) => ({ m, month: cjkNum(m[2]) - 1, date: cjkNum(m[3]), year: m[1] ? parseInt(m[1], 10) : null })],
      [/(?:(\d{4})[/-])?(\d{1,2})[/／](\d{1,2})(?![/\d])/u, (m) => ({ m, month: parseInt(m[2], 10) - 1, date: parseInt(m[3], 10), year: m[1] ? parseInt(m[1], 10) : null, numeric: true })],
      [/(?<![\d月])(\d{1,2}|[一二三四五六七八九十]{1,3})日(?![後間])/u, (m) => ({ m, month: null, date: cjkNum(m[1]) })],
    ]),
  time: (w) =>
    firstHit<TimeHit>(w, [
      [/(\d{1,2}|[零〇一二三四五六七八九十]{1,3})\s*時(?![間])\s*(?:(\d{1,2}|[零〇一二三四五六七八九十]{1,3})\s*分|(半))?(?:頃|ごろ|くらい|ぐらい|ちょうど|きっかり)?/u, (m) => {
        const hour = cjkNum(m[1]);
        const minute = m[3] ? 30 : m[2] ? cjkNum(m[2]) : 0;
        return hour >= 0 && hour <= 24 && minute >= 0 && minute <= 59 ? { m, hour, minute } : null;
      }],
      [/(\d{1,2}):(\d{2})/u, (m) => ({ m, hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) })],
    ]),
  remind: [
    [new RegExp(`(?:前日|前の日|一日前|1日前)${JA_CUE_TAIL}`, 'u'), () => 1440],
    [new RegExp(`(\\d{1,3}|[零〇一二三四五六七八九十]{1,3}|半)\\s*(分|時間|日)\\s*前${JA_CUE_TAIL}`, 'u'), (m) => {
      const n = cjkNum(m[1]);
      return remindOption(n, m[2] === '分' ? 'min' : m[2] === '時間' ? 'hour' : 'day');
    }],
  ],
  cleanup: (s) =>
    s
      .replace(/(?:リマインドして|リマインド|リマインダー|思い出させて|忘れないように|覚えておいて)(?:ください|下さい|ね)?/gu, ' ')
      .replace(/(?:を)?(?:入れて|追加して|登録して|お願いします|お願い)(?:ください|下さい)?\s*$/u, '')
      .replace(/(^|\s)(?:には|にも|に|は|の|で|から|へ|、|,)+/gu, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/^[\s、。,.;:!?・]+|[\s、。,.;:!?・に]+$/gu, '')
      .trim(),
};

// ─── 중국어 (간체·번체 공통) ───────────────────────────────────────────────────
const ZH_CUE_TAIL = '\\s*(?:提醒我|提醒|通知我|通知|叫我|告诉我|告訴我)?(?:一下|一声|一聲)?';
const ZH_UNIT = '(分钟|分鐘|分|个小时|個小時|小时|小時|钟头|鐘頭|天|日|周|週|个星期|個星期|星期|个礼拜|個禮拜|礼拜|禮拜)';
function zhUnit(u: string): Unit {
  if (/分/.test(u)) return 'min';
  if (/小时|小時|钟头|鐘頭/.test(u)) return 'hour';
  if (/天|日/.test(u)) return 'day';
  return 'week';
}
const ZH: Table = {
  cjk: true,
  lead: /(?:在|于|於)$/u,
  tail: /^(?:的时候|的時候|的|钟|鐘)/u,
  relAfter: (w) => {
    const m = w.match(new RegExp(`(\\d+|[零〇一二两兩三四五六七八九十]{1,3}|半)\\s*${ZH_UNIT}\\s*(?:之后|之後|以后|以後|后|後)`, 'u'));
    if (!m) return null;
    const n = cjkNum(m[1]);
    if (!(n > 0)) return null;
    return { m, n, unit: zhUnit(m[2]) };
  },
  dayParts: [
    { re: /上午/u, mer: 'am', plain: true },
    { re: /下午/u, mer: 'pm', plain: true },
    { re: /今早/u, mer: 'am', plain: true, today: true },
    { re: /今晚/u, mer: 'pm', plain: true, today: true, night: true },
    { re: /早上|早晨|清晨|凌晨|半夜/u, mer: 'am' },
    { re: /中午|傍晚/u, mer: 'pm' },
    { re: /晚上|晚间|晚間|夜里|夜裡|夜晚/u, mer: 'pm', night: true },
  ],
  noon: /正午/u,
  midnight: /午夜/u,
  relDays: [
    { re: /大后天|大後天/u, offset: 3 },
    { re: /后天|後天/u, offset: 2 },
    { re: /明天|明日/u, offset: 1 },
    { re: /今天|今日/u, offset: 0 },
    { re: /昨天|昨日/u, offset: -1 },
  ],
  weekday: (w) => {
    const m = w.match(/(下下|下|这|這|本|上)?(?:个|個)?\s*(?:星期|周|週|礼拜|禮拜)([一二三四五六日天])/u);
    if (!m) return null;
    const dow = m[2] === '日' || m[2] === '天' ? 0 : '一二三四五六'.indexOf(m[2]) + 1;
    const s = m[1] ?? '';
    const mode = /^下/.test(s) ? 'nextWeek' : /^上/.test(s) ? 'prevWeek' : 'plain';
    return { m, dow, mode }; // "下下周"는 2주 뒤지만 다음 주로 근사
  },
  weekOnly: (w) => {
    const m = w.match(/(下下|下|这|這|本|上)(?:个|個)?(?:星期|周|週|礼拜|禮拜)(?![一二三四五六日天])/u);
    if (!m) return null;
    return { m, offset: /^下下/.test(m[0]) ? 14 : /^下/.test(m[0]) ? 7 : /^上/.test(m[0]) ? -7 : 0 };
  },
  date: (w) =>
    firstHit<DateHit>(w, [
      [/(?:(\d{4})年)?\s*(\d{1,2}|[零〇一二三四五六七八九十]{1,3})月\s*(\d{1,2}|[零〇一二三四五六七八九十]{1,3})[日号號]/u, (m) => ({ m, month: cjkNum(m[2]) - 1, date: cjkNum(m[3]), year: m[1] ? parseInt(m[1], 10) : null })],
      [/(?:(\d{4})[/-])?(\d{1,2})[/／](\d{1,2})(?![/\d])/u, (m) => ({ m, month: parseInt(m[2], 10) - 1, date: parseInt(m[3], 10), year: m[1] ? parseInt(m[1], 10) : null, numeric: true })],
      [/(?<![\d月])(\d{1,2}|[一二三四五六七八九十]{1,3})[日号號](?![后後])/u, (m) => ({ m, month: null, date: cjkNum(m[1]) })],
    ]),
  time: (w, ctx) =>
    firstHit<TimeHit>(w, [
      [/(\d{1,2}|[零〇一二两兩三四五六七八九十]{1,3})\s*[点點时時](?![间間候])\s*(?:(\d{1,2}|[零〇一二三四五六七八九十]{1,3})\s*分|(半|一刻|三刻))?(钟|鐘)?(?:左右|前后|前後)?/u, (m) => {
        const hour = cjkNum(m[1]);
        const minute = m[3] === '半' ? 30 : m[3] === '一刻' ? 15 : m[3] === '三刻' ? 45 : m[2] ? cjkNum(m[2]) : 0;
        if (!(hour >= 0 && hour <= 24 && minute >= 0 && minute <= 59)) return null;
        // "一点" 은 "조금"이라는 뜻도 있어, 오전/오후·분·钟 단서가 없으면 시각으로 보지 않는다
        if (m[1] === '一' && !m[2] && !m[3] && !m[4] && !ctx.merKnown) return null;
        return { m, hour, minute };
      }],
      [/(\d{1,2}):(\d{2})/u, (m) => ({ m, hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) })],
    ]),
  remind: [
    [new RegExp(`(?:提前\\s*)?(?:前一天|头一天|頭一天|提前一天)${ZH_CUE_TAIL}`, 'u'), () => 1440],
    [new RegExp(`提前\\s*(\\d{1,3}|[零〇一二两兩三四五六七八九十]{1,3}|半)\\s*(分钟|分鐘|分|个小时|個小時|小时|小時|钟头|鐘頭|天)${ZH_CUE_TAIL}`, 'u'), (m) => remindOption(cjkNum(m[1]), zhUnit(m[2]) as 'min' | 'hour' | 'day')],
    [new RegExp(`(\\d{1,3}|[零〇一二两兩三四五六七八九十]{1,3}|半)\\s*(分钟|分鐘|分|个小时|個小時|小时|小時|钟头|鐘頭|天)\\s*(?:之前|前)${ZH_CUE_TAIL}`, 'u'), (m) => remindOption(cjkNum(m[1]), zhUnit(m[2]) as 'min' | 'hour' | 'day')],
  ],
  cleanup: (s) =>
    s
      .replace(/(?:提醒我|提醒一下|帮我记一下|幫我記一下|帮我记|幫我記|记得|記得|别忘了|別忘了|记住|記住)/gu, ' ')
      .replace(/(^|\s)(?:的|在|要|、|,)+/gu, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/^[\s、。,.;:!?・]+|[\s、。,.;:!?・的]+$/gu, '')
      .trim(),
};

const TABLES: Record<IntlLang, Table> = { ja: JA, 'zh-Hans': ZH, 'zh-Hant': ZH, es: ES, fr: FR, de: DE, pt: PT };

// ─── 미리 알림 추출 ───────────────────────────────────────────────────────────
/** "30分前に知らせて", "avísame una hora antes", "am Vortag" 등을 분 옵션으로 바꾸고 문장에서 지운다 */
export function extractRemindBeforeIntl(text: string, lang: IntlLang): { remindBefore: RemindBefore[] | null; text: string } {
  const T = TABLES[lang] ?? ES;
  const found: RemindBefore[] = [];
  let out = text;
  for (const [re0, pick] of T.remind) {
    const re = new RegExp(re0.source, re0.flags.includes('i') ? re0.flags : re0.flags + 'i'); // 독일어 명사 대문자 등
    for (let guard = 0; guard < 4; guard++) {
      const m = out.match(re);
      if (!m) break;
      const v = pick(m);
      if (v) found.push(v);
      out = out.replace(m[0], ' ');
    }
  }
  out = out.replace(/\s{2,}/g, ' ').trim();
  return { remindBefore: found.length ? normalizeRemind(found) : null, text: out };
}

// ─── 메인 파서 ────────────────────────────────────────────────────────────────
export function parseScheduleIntl(input: string, base: Date = new Date(), lang: Lang): ParsedSchedule {
  const L = (lang in TABLES ? lang : 'es') as IntlLang;
  const pre = extractRemindBeforeIntl((input ?? '').trim(), L);
  const r = parseCore(pre.text, base, TABLES[L], L);
  return pre.remindBefore ? { ...r, remindBefore: pre.remindBefore } : r;
}

function parseCore(original: string, base: Date, T: Table, lang: IntlLang): ParsedSchedule {
  let work = original.toLowerCase();
  const sameLength = work.length === original.length;
  if (!sameLength) work = original; // 소문자화로 길이가 바뀌는 특수 문자가 있으면 원문 그대로 검색
  const ranges: Array<[number, number]> = [];

  /** 매칭 구간(+앞 전치사/뒤 조사)을 work 에서 공백으로 지우고 그 구간을 돌려준다 */
  const blank = (m: RegExpMatchArray): [number, number] => {
    let s = m.index ?? 0;
    let e = s + m[0].length;
    if (T.lead) {
      const lead = work.slice(0, s).match(T.lead);
      if (lead && lead.index !== undefined) s = lead.index;
    }
    if (T.tail) {
      const tail = work.slice(e).match(T.tail);
      if (tail) e += tail[0].length;
    }
    work = work.slice(0, s) + ' '.repeat(e - s) + work.slice(e);
    return [s, e];
  };
  const consume = (m: RegExpMatchArray | null): RegExpMatchArray | null => {
    if (!m || m.index === undefined) return null;
    ranges.push(blank(m));
    return m;
  };

  let hasDate = false;
  let hasTime = false;
  let day = startOfDay(base);
  let hour: number | null = null;
  let minute = 0;
  let meridiem: Mer | null = null;
  let nightWord = false;
  let dayPartSetsToday = false;

  // 1) "N분 후 / N시간 후 / N일 후" — 상대 시각
  const rel = T.relAfter(work);
  if (rel && consume(rel.m)) {
    const isDay = rel.unit === 'day' || rel.unit === 'week';
    const result = isDay ? startOfDay(base) : new Date(base);
    if (rel.unit === 'week') result.setDate(result.getDate() + rel.n * 7);
    else if (rel.unit === 'day') result.setDate(result.getDate() + rel.n);
    else if (rel.unit === 'hour') result.setMinutes(result.getMinutes() + Math.round(rel.n * 60));
    else result.setMinutes(result.getMinutes() + Math.round(rel.n));
    return finish(original, work, ranges, sameLength, result, true, !isDay, T, lang);
  }

  // 2) 오전/오후·시간대 단어 — 먼저 지워 두고(다른 패턴이 다시 잡지 않게), 내용에서 뺄지는 시각 유무를 본 뒤 정한다
  //    (한국어와 같은 규칙: "午後/上午/de la tarde" 같은 명시적 표현은 항상, "夜/晚上" 같은 말은 시각이 있을 때만 제거)
  const pending: Array<{ range: [number, number]; keep: boolean }> = [];
  for (const dp of T.dayParts) {
    const m = work.match(dp.re);
    if (!m || m.index === undefined) continue;
    const range = blank(m);
    pending.push({ range, keep: !!(dp.plain || dp.today) });
    if (meridiem === null) meridiem = dp.mer;
    if (dp.night) nightWord = true;
    if (dp.today) dayPartSetsToday = true;
  }

  // 3) 정오 / 자정
  const noon = consume(work.match(T.noon));
  if (noon) { hour = 12; minute = 0; hasTime = true; meridiem = 'pm'; }
  else {
    const mid = consume(work.match(T.midnight));
    if (mid) { hour = 0; minute = 0; hasTime = true; meridiem = 'am'; }
  }

  // 4) 오늘/내일/모레
  for (const rd of T.relDays) {
    const m = consume(work.match(rd.re));
    if (m) {
      day = startOfDay(base);
      day.setDate(day.getDate() + rd.offset);
      hasDate = true;
      if (rd.mer && meridiem === null) meridiem = rd.mer;
      if (rd.night) nightWord = true;
      break;
    }
  }

  // 5) 요일 (+ 다음 주/이번 주) / 주만
  if (!hasDate) {
    const wd = T.weekday(work);
    if (wd && consume(wd.m)) {
      const d = startOfDay(base);
      let diff = wd.dow - d.getDay();
      if (wd.mode === 'nextWeek') diff += 7; // 다음 달력 주(일~토)의 그 요일 — 한국어 "다음주 수요일"과 동일
      else if (wd.mode === 'prevWeek') diff -= 7;
      else if (wd.mode === 'nextDay') { if (diff <= 0) diff += 7; } // "próximo lunes" → 앞으로 오는 그 요일
      else if (diff < 0) diff += 7;
      d.setDate(d.getDate() + diff);
      day = d;
      hasDate = true;
    } else {
      const wk = T.weekOnly(work);
      if (wk && consume(wk.m)) {
        const d = startOfDay(base);
        d.setDate(d.getDate() + wk.offset);
        day = d;
        hasDate = true;
      }
    }
  }

  // 6) 절대 날짜 ("10月15日", "15 de octubre", "15. Oktober", DD/MM …)
  if (!hasDate) {
    const dh = T.date(work);
    if (dh) {
      if (dh.month === null) {
        // 일(日)만 — 이번 달 그 날짜(지났으면 다음 달)
        if (dh.date >= 1 && dh.date <= 31 && consume(dh.m)) {
          const d = startOfDay(base);
          d.setDate(dh.date);
          if (d.getTime() < startOfDay(base).getTime()) d.setMonth(d.getMonth() + 1);
          day = d;
          hasDate = true;
        }
      } else if (isValidMonthDay(dh.month, dh.date)) {
        consume(dh.m);
        const month: number = dh.month;
        const date = dh.date;
        const todayMs = startOfDay(base).getTime();
        let d = new Date(dh.year ?? base.getFullYear(), month, date);
        if (dh.year == null) {
          // 이미 지난 날짜면 다음 해로. 2월 29일은 실제 존재하는 가장 가까운 해(최대 4년)
          for (let y = base.getFullYear(); y <= base.getFullYear() + 4; y++) {
            const cand = new Date(y, month, date);
            if (cand.getMonth() === month && cand.getTime() >= todayMs) { d = cand; break; }
          }
        }
        day = d;
        hasDate = true;
      } else if (!dh.numeric) {
        consume(dh.m); // "30 de febrero" 같은 없는 날짜는 토큰만 지운다 (숫자형은 시각일 수 있으니 남긴다)
      }
    }
  }

  // 7) 시각
  if (hour === null) {
    const th = T.time(work, { merKnown: meridiem !== null });
    if (th && consume(th.m)) {
      hour = th.hour;
      minute = th.minute;
      hasTime = true;
      // 바로 뒤의 "a.m./p.m."
      if (T.merSuffix) {
        const after = work.slice((th.m.index ?? 0) + th.m[0].length);
        const ms = after.match(T.merSuffix);
        if (ms && hour <= 12) {
          meridiem = /^a/.test(ms[1]) ? 'am' : 'pm';
          const s = (th.m.index ?? 0) + th.m[0].length;
          ranges.push([s, s + ms[0].length]);
          work = work.slice(0, s) + ' '.repeat(ms[0].length) + work.slice(s + ms[0].length);
        }
      }
    }
  }

  // 8) 시간대 단어 정리: 명시적 표현이거나 시각이 있으면 내용에서 제거
  for (const p of pending) if (p.keep || hasTime) ranges.push(p.range);
  if (dayPartSetsToday && !hasDate) { day = startOfDay(base); hasDate = true; }

  // 9) 오전/오후 보정 (한국어 파서와 같은 규칙)
  if (hour !== null) {
    if (meridiem === 'pm' && hour < 12) hour += 12;
    else if (meridiem === 'am' && hour === 12) hour = 0;
    else if (nightWord && hour === 12) hour = 24; // "夜12時" = 자정(다음 날)
    else if (meridiem === null && hour >= 1 && hour <= 7) hour += 12; // 미명시 1~7시는 오후
  }

  if (!hasDate && !hasTime) {
    return { date: null, hasDate: false, hasTime: false, content: T.cleanup(original), display: '' };
  }

  const result = new Date(day);
  if (hasTime && hour !== null) result.setHours(hour, minute, 0, 0);
  else result.setHours(0, 0, 0, 0);

  // 날짜 없이 시간만 → 오늘(이미 지났으면 내일)
  if (!hasDate && hasTime) {
    const today = startOfDay(base);
    result.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
    if (result.getTime() < base.getTime()) result.setDate(result.getDate() + 1);
    hasDate = true;
  }
  return finish(original, work, ranges, sameLength, result, hasDate, hasTime, T, lang);
}

function finish(original: string, work: string, ranges: Array<[number, number]>, sameLength: boolean, date: Date, hasDate: boolean, hasTime: boolean, T: Table, lang: IntlLang): ParsedSchedule {
  const src = sameLength ? original : work;
  let out = '';
  for (let i = 0; i < src.length; i++) {
    out += ranges.some(([s, e]) => i >= s && i < e) ? ' ' : src[i];
  }
  return { date, hasDate, hasTime, content: T.cleanup(out), display: formatDisplayIntl(date, hasDate, hasTime, lang) };
}

// ─── 사람이 읽기 좋은 표현 ─────────────────────────────────────────────────────
/**
 * ja "10月15日(木) 15:00" / zh-Hans "10月15日 周四 15:00" / zh-Hant "10月15日 週四 15:00"
 * es "jue 15 oct · 15:00" / fr "jeu. 15 oct. · 15:00" / de "Do., 15. Okt. · 15:00" / pt "qui, 15 de out · 15:00"
 * (시간 미정이면 시각 생략)
 */
export function formatDisplayIntl(d: Date, hasDate: boolean, hasTime: boolean, lang: Lang): string {
  const cjk = lang === 'ja' || lang === 'zh-Hans' || lang === 'zh-Hant';
  const parts: string[] = [];
  if (hasDate) parts.push(formatDayHeaderFor(d, lang));
  if (hasTime) parts.push(formatTimeFor(d, lang));
  return parts.join(cjk ? ' ' : ' · ');
}
