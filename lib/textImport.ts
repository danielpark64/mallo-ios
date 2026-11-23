// ─── 복사한 글·사진 속 글자 → 일정 미리보기 ────────────────────────────────────────
// 말로 하는 파서(parseSchedule)는 "12월 3일 오후 2시"처럼 말한 문장을 읽는다.
// 문자·메일에서 복사한 글은 "2026.12.03(목) 14:30"처럼 적은 꼴이라, 파서가 읽는 꼴로 먼저 바꿔 준다.
// 날짜를 못 찾으면 date = null → 날짜 미정으로 저장(사용자가 나중에 정한다).
import { getLang, type Lang } from './i18n/lang';
import { formatDisplay, parseSchedule } from './parseSchedule';
import { cleanClipText } from './clipImport';

export type ImportPreview = {
  /** 일정 내용(날짜·시간을 뺀 글, 짧게) */
  content: string;
  /** 일정 시각. 날짜·시간을 못 찾으면 null(날짜 미정) */
  date: Date | null;
  hasDate: boolean;
  hasTime: boolean;
  /** "12월 3일 (목) 오후 2:30" — 날짜 미정이면 빈 글 */
  display: string;
  endDate?: Date;
  remindBefore?: number[];
  /** 원문(정리한 글) — 메모 첨부로 함께 남긴다 */
  source: string;
};

/** 일정 내용으로 쓰는 최대 길이 — 나머지는 메모 첨부의 원문에 있다 */
export const MAX_CONTENT_CHARS = 80;
/** 파서에 넘기는 최대 길이(긴 메일 대비) */
const MAX_PARSE_CHARS = 1200;

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const okMD = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

/** 날짜를 그 언어 파서가 읽는 꼴로 */
function mdFor(lang: Lang, m: number, d: number, y?: number): string {
  switch (lang) {
    case 'ko': return `${m}월 ${d}일`;
    case 'en': return `${MONTHS_EN[m - 1]} ${d}${y ? `, ${y}` : ''}`;
    case 'ja': case 'zh-Hans': case 'zh-Hant': return `${m}月${d}日`;
    case 'de': return `${d}.${m}.${y ?? ''}`.replace(/\.$/, '.');
    default: return `${d}/${m}${y ? `/${y}` : ''}`; // es·fr·pt: 일/월
  }
}

// 날짜 바로 뒤 괄호 속 요일 "(목)" "(木)" "(Thu)" "(周四)" — 파서가 내용으로 남기지 않게 뺀다
const WEEKDAY_PAREN = /\s*[(（]\s*(?:[월화수목금토일](?:요일)?|[月火水木金土日](?:曜日?)?|(?:周|週|星期)[一二三四五六日天]|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?|(?:lun|mar|mer|jeu|ven|sam|dim|mié|jue|vie|sáb|dom|seg|ter|qua|qui|sex|Mo|Di|Mi|Do|Fr|Sa|So)\.?)\s*[)）]/gi;

/** 적은 꼴의 날짜·시간을 파서가 읽는 꼴로 바꾼다 */
export function normalizeForParse(raw: string, lang: Lang = getLang()): string {
  let s = cleanClipText(raw).slice(0, MAX_PARSE_CHARS).replace(/\s*\n\s*/g, ' ');
  // 2026-12-03 · 2026.12.03 · 2026/12/03 (끝의 점까지)
  s = s.replace(/(?<!\d)(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?(?!\d)/g, (m0, y, mo, d) =>
    okMD(+mo, +d) ? ` ${mdFor(lang, +mo, +d, +y)} ` : m0);
  if (lang === 'ko') {
    s = s.replace(/(?<!\d)\d{4}\s*년\s*(?=\d{1,2}\s*월)/g, ''); // "2026년 12월 3일" → 연도는 파서가 다음에 오는 날로 고른다
    // 11/25 · 12.3(목) · 12.03 14:30
    s = s.replace(/(?<![\d/.:])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/g, (m0, mo, d) => (okMD(+mo, +d) ? ` ${mdFor(lang, +mo, +d)} ` : m0));
    s = s.replace(/(?<![\d.:])(\d{1,2})\.(\d{1,2})\.?(?=\s*[(（]|\s+(?:오전|오후)|\s+\d{1,2}:\d{2})/g, (m0, mo, d) => (okMD(+mo, +d) ? ` ${mdFor(lang, +mo, +d)} ` : m0));
  }
  s = s.replace(WEEKDAY_PAREN, ' ');
  if (lang === 'ko') {
    // 14:30 → 14시 30분 · 오후 2:00 → 오후 2시
    s = s.replace(/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/g, (m0, h, mi) =>
      +h <= 23 && +mi <= 59 ? ` ${+h}시${+mi ? ` ${+mi}분` : ''} ` : m0);
  }
  return s.replace(/\s{2,}/g, ' ').trim();
}

/** 날짜에 붙어 적힌 연도("2027년", "2027-12-03", "3.12.2027", "Dec 3, 2027", "2027年") — 파서는 연도를 읽지 않아 따로 맞춘다 */
export function explicitYear(text: string): number | null {
  const m =
    /(?<!\d)(20\d{2})\s*(?:년|年)/.exec(text) ??
    /(?<!\d)(20\d{2})\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}(?!\d)/.exec(text) ??
    /(?<![\d./])\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*(20\d{2})(?!\d)/.exec(text) ??
    /\b[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(20\d{2})(?!\d)/.exec(text);
  return m ? +m[1] : null;
}

function withYear(d: Date, y: number): Date | null {
  const c = new Date(d);
  c.setFullYear(y);
  return c.getMonth() === d.getMonth() ? c : null; // 2월 29일이 없는 해면 그대로 둔다
}

function shortContent(s: string): string {
  const v = s.replace(/\s+/g, ' ')
    .replace(/[^\s:：]+[:：]\s*(?=[^\s:：]+[:：])/g, '') // 값이 빠진 "예약일시:" 같은 이름표만 남은 것
    .replace(/^[\s,.:;·~\-–—]+|[\s,:;·~\-–—]+$/g, '').trim();
  return v.length > MAX_CONTENT_CHARS ? v.slice(0, MAX_CONTENT_CHARS - 1).trimEnd() + '…' : v;
}

/** 붙인 글·인식한 글 → 미리보기 값. 글이 비면 null */
export function buildImportPreview(raw: string, base: Date = new Date(), lang: Lang = getLang()): ImportPreview | null {
  const source = cleanClipText(raw);
  if (!source) return null;
  const p = parseSchedule(normalizeForParse(source, lang), base);
  const found = !!p.date && (p.hasDate || p.hasTime);
  // 연도를 적었으면 그 해로(파서는 다음에 오는 그 날을 고른다). 너무 먼 해는 잘못 읽은 것으로 보고 두지 않는다
  const y = found && p.hasDate ? explicitYear(source) : null;
  if (y && p.date && y !== p.date.getFullYear() && Math.abs(y - base.getFullYear()) <= 3) {
    const moved = withYear(p.date, y);
    if (moved) {
      const shift = moved.getTime() - p.date.getTime();
      p.date = moved;
      if (p.endDate) p.endDate = new Date(p.endDate.getTime() + shift);
      p.display = formatDisplay(moved, p.hasDate, p.hasTime);
    }
  }
  const firstLine = source.split('\n').find((l) => l.trim()) ?? source;
  const content = shortContent(found ? (p.content || firstLine) : firstLine) || shortContent(source);
  return {
    content,
    date: found ? p.date : null,
    hasDate: found && p.hasDate,
    hasTime: found && p.hasTime,
    display: found && p.date ? (p.display || formatDisplay(p.date, p.hasDate, p.hasTime)) : '',
    endDate: found ? p.endDate : undefined,
    remindBefore: found ? p.remindBefore : undefined,
    source,
  };
}
