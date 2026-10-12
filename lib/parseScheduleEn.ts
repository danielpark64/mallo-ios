// ─── 영어 자연어 → 일정(날짜·시간) 파서 ──────────────────────────────────────
// 한국어 parseSchedule.ts 와 같은 ParsedSchedule 을 돌려준다. 언어가 'en'일 때 parseSchedule 이 여기로 위임한다.
// 예) "tomorrow at 3pm team meeting" → { date: 내일 15:00, content: "team meeting", display: "Sun, Jun 7 · 3:00 PM" }
// 작동 방식: 소문자 사본(work)에서 토큰을 찾아 같은 길이의 공백으로 지워 가며(인덱스 보존),
// 지운 구간은 원문에서도 잘라 내용(content)을 만든다. 숫자/수사·오전오후 규칙은 한국어 파서와 맞춘다.
import { normalizeRemind, type RemindBefore } from './reminders';
import type { ParsedSchedule } from './parseSchedule';
import { formatDisplay } from './parseSchedule';

const HOUR_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const MINUTE_WORDS: Record<string, number> = {
  five: 5, ten: 10, fifteen: 15, twenty: 20, 'twenty five': 25, thirty: 30, 'thirty five': 35, forty: 40, 'forty five': 45, fifty: 50, 'fifty five': 55,
};
const SMALL_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, fifty: 50, sixty: 60,
};
const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5,
  july: 6, jul: 6, august: 7, aug: 7, september: 8, sept: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};
const WEEKDAY_RE = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat';
const MONTH_RE = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
const HOUR_RE = '\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
const MIN_WORD_RE = 'twenty[\\s-]?five|thirty[\\s-]?five|forty[\\s-]?five|fifty[\\s-]?five|fifteen|twenty|thirty|forty|fifty|five|ten';
const DAYPART_RE = 'morning|afternoon|evening|night';
// 시각 뒤에 붙는 오전/오후: "3pm", "3 p.m.", "3 in the afternoon", "3 at night", "3 tonight"
const MER_SUFFIX = `(?:\\s*(a\\.?m\\.?|p\\.?m\\.?)(?![a-z])|\\s+(in the (?:${DAYPART_RE})|at night|tonight|this (?:${DAYPART_RE})))?`;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function isValidMonthDay(month: number, date: number): boolean {
  if (month < 0 || month > 11 || date < 1) return false;
  return date <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}
function wordNum(s: string): number {
  const k = s.trim().replace(/-/g, ' ').replace(/\s+/g, ' ');
  if (/^\d+$/.test(k)) return parseInt(k, 10);
  return SMALL_NUM[k] ?? MINUTE_WORDS[k] ?? HOUR_WORDS[k] ?? NaN;
}
/** 분 수를 미리 알림 옵션으로 (한국어 extractRemindBefore 와 같은 규칙) */
function minutesToOption(n: number): RemindBefore | null {
  if (!(n > 0)) return null;
  if (n <= 15) return 10;
  if (n <= 45) return 30;
  return 60;
}

const REMIND_CUE = '(?:(?:please\\s+)?(?:remind me|let me know|alert me|notify me|ping me|give me a heads[\\s-]?up)\\s+)?(?:about\\s+)?';
const REMIND_TAIL = '(?:\\s+(?:the\\s+)?(?:time|event|that|it))?';

/**
 * "remind me 30 minutes before", "an hour before", "a day before", "the night before" → 분 옵션으로 바꾸고 문장에서 지운다.
 * 한국어와 달리 "알려줘" 같은 단서 없이 "30 min before"만 있어도 인식한다.
 */
export function extractRemindBeforeEn(text: string): { remindBefore: RemindBefore[] | null; text: string } {
  const found: RemindBefore[] = [];
  let out = text;
  const numRe = '\\b(\\d{1,3}|half an|half|an|a|one|two|three|four|five|six|ten|fifteen|twenty|thirty|forty[\\s-]?five|forty|fifty|sixty)';
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => RemindBefore | null]> = [
    [new RegExp(`${REMIND_CUE}${numRe}\\s*(minutes?|mins?|min|hours?|hrs?|hr|days?)\\s+(?:before|earlier|ahead|in advance|prior)${REMIND_TAIL}`, 'i'), (m) => {
      const raw = m[1].toLowerCase();
      const unit = m[2].toLowerCase();
      const half = /^half/.test(raw);
      const n = half ? 0.5 : wordNum(raw);
      if (!(n > 0)) return null;
      if (unit.startsWith('d')) return 1440;
      if (unit.startsWith('h')) return half ? 30 : 60;
      return minutesToOption(n);
    }],
    [new RegExp(`${REMIND_CUE}(?:on\\s+)?(?:the\\s+)?(?:day|night|evening)\\s+before${REMIND_TAIL}`, 'i'), () => 1440],
    [new RegExp(`${REMIND_CUE}(?:the\\s+)?(?:previous|prior)\\s+(?:day|night|evening)`, 'i'), () => 1440],
  ];
  for (const [re, pick] of patterns) {
    // 같은 패턴이 여러 번 나올 수 있다 ("30 minutes before and a day before")
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
export function parseScheduleEn(input: string, base: Date = new Date()): ParsedSchedule {
  const pre = extractRemindBeforeEn((input ?? '').trim());
  const r = parseCore(pre.text, base);
  return pre.remindBefore ? { ...r, remindBefore: pre.remindBefore } : r;
}

function parseCore(original: string, base: Date): ParsedSchedule {
  // 소문자 사본에서 찾고, 찾은 구간은 공백으로 지워 다음 패턴이 다시 잡지 않게 한다
  let work = original.toLowerCase();
  const sameLength = work.length === original.length;
  const ranges: Array<[number, number]> = [];
  const consume = (m: RegExpMatchArray | null): RegExpMatchArray | null => {
    if (!m || m.index === undefined) return null;
    let s = m.index;
    const e = s + m[0].length;
    // 바로 앞의 전치사/관사도 함께 지운다 ("at 3pm", "on Friday", "for the 15th")
    const lead = work.slice(0, s).match(/(?:^|\s)(?:at|on|in|for|by|around|about|the|this coming|coming)\s*$/);
    if (lead && lead.index !== undefined) s = lead.index;
    ranges.push([s, e]);
    work = work.slice(0, s) + ' '.repeat(e - s) + work.slice(e);
    return m;
  };

  let hasDate = false;
  let hasTime = false;
  let day = startOfDay(base);
  let hour: number | null = null;
  let minute = 0;
  let meridiem: 'am' | 'pm' | null = null;
  let nightWord = false; // "at night"/"tonight" + 12 → 자정(다음 날)
  let dayPartSetsToday = false;

  // 1) "in N minutes/hours/days/weeks", "in an hour", "in half an hour" — 상대 시각
  const rel = consume(work.match(/\bin\s+(half an|half a|an|a|\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty[\s-]?five|forty|fifty|sixty)\s*(minutes?|mins?|min|hours?|hrs?|hr|days?|weeks?)\b/));
  if (rel) {
    const half = /^half/.test(rel[1]);
    const n = half ? 0.5 : wordNum(rel[1]);
    const unit = rel[2];
    const isDay = unit.startsWith('d') || unit.startsWith('w');
    const result = isDay ? startOfDay(base) : new Date(base);
    if (unit.startsWith('w')) result.setDate(result.getDate() + n * 7);
    else if (unit.startsWith('d')) result.setDate(result.getDate() + n);
    else if (unit.startsWith('h')) result.setMinutes(result.getMinutes() + Math.round(n * 60));
    else result.setMinutes(result.getMinutes() + Math.round(n));
    return finish(original, work, ranges, sameLength, result, true, !isDay);
  }

  // 2) 상대 날짜 단어 (+ 바로 뒤 시간대: "tomorrow morning")
  const dayPartTail = `(?:\\s+(${DAYPART_RE}))?`;
  const relDays: Array<[RegExp, number]> = [
    [new RegExp(`\\b(?:the\\s+)?day after tomorrow${dayPartTail}\\b`), 2],
    [new RegExp(`\\btomorrow${dayPartTail}\\b`), 1],
    [new RegExp(`\\btoday${dayPartTail}\\b`), 0],
    [new RegExp(`\\btonight\\b`), 0],
    [new RegExp(`\\byesterday${dayPartTail}\\b`), -1],
  ];
  for (const [re, offset] of relDays) {
    const m = consume(work.match(re));
    if (m) {
      day = startOfDay(base);
      day.setDate(day.getDate() + offset);
      hasDate = true;
      const part = m[0].includes('tonight') ? 'night' : m[1];
      if (part) applyDayPart(part);
      break;
    }
  }

  // 3) 요일: "next monday", "this friday", "on friday", "monday next week"
  if (!hasDate) {
    const wd = consume(work.match(new RegExp(`\\b(?:(next|this)\\s+(?:week\\s+)?)?(${WEEKDAY_RE})\\b\\.?(?:\\s+(next|this)\\s+week)?${dayPartTail}`)));
    if (wd) {
      const targetDow = WEEKDAY_MAP[wd[2]];
      const scope = wd[1] ?? wd[3];
      const nextWeek = /next\s+week/.test(wd[0]);
      const d = startOfDay(base);
      let diff = targetDow - d.getDay();
      if (nextWeek) {
        // "monday next week" → 다음 주의 그 요일
        diff += 7;
      } else if (scope === 'next') {
        // "next monday" → 앞으로 오는 그 요일(오늘이면 다음 주)
        if (diff <= 0) diff += 7;
      } else if (diff < 0) {
        diff += 7;
      }
      d.setDate(d.getDate() + diff);
      day = d;
      hasDate = true;
      if (wd[4]) applyDayPart(wd[4]);
    } else {
      const wk = consume(work.match(/\b(next|this)\s+week\b/));
      if (wk) {
        const d = startOfDay(base);
        d.setDate(d.getDate() + (wk[1] === 'next' ? 7 : 0));
        day = d;
        hasDate = true;
      }
    }
  }

  // 4) 절대 날짜: "Oct 15", "October 15th, 2026", "15 October", "10/15", "10/15/2026", "the 15th"
  if (!hasDate) {
    let month = -1;
    let date = -1;
    let year: number | null = null;
    const m1 = consume(work.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`)));
    const m2 = m1 ? null : consume(work.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b\\.?(?:,?\\s+(\\d{4}))?`)));
    const m3 = m1 || m2 ? null : consume(work.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/));
    const m4 = m1 || m2 || m3 ? null : consume(work.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/));
    if (m1) { month = MONTH_MAP[m1[1]]; date = parseInt(m1[2], 10); if (m1[3]) year = parseInt(m1[3], 10); }
    else if (m2) { month = MONTH_MAP[m2[2]]; date = parseInt(m2[1], 10); if (m2[3]) year = parseInt(m2[3], 10); }
    else if (m3) { month = parseInt(m3[1], 10) - 1; date = parseInt(m3[2], 10); if (m3[3]) year = m3[3].length === 2 ? 2000 + parseInt(m3[3], 10) : parseInt(m3[3], 10); }
    else if (m4) { year = parseInt(m4[1], 10); month = parseInt(m4[2], 10) - 1; date = parseInt(m4[3], 10); }

    if (month >= 0) {
      if (isValidMonthDay(month, date)) {
        const todayMs = startOfDay(base).getTime();
        let d = new Date(year ?? base.getFullYear(), month, date);
        if (year === null) {
          // 이미 지난 날짜면 다음 해로. 2월 29일은 실제 존재하는 가장 가까운 해(최대 4년)
          for (let y = base.getFullYear(); y <= base.getFullYear() + 4; y++) {
            const cand = new Date(y, month, date);
            if (cand.getMonth() === month && cand.getTime() >= todayMs) { d = cand; break; }
          }
        }
        day = d;
        hasDate = true;
      }
      // 유효하지 않은 날짜("Feb 30")는 토큰만 지우고 날짜 없음 처리
    } else {
      const dayOnly = consume(work.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/));
      if (dayOnly) {
        const dd = parseInt(dayOnly[1], 10);
        if (dd >= 1 && dd <= 31) {
          const d = startOfDay(base);
          d.setDate(dd);
          if (d.getTime() < startOfDay(base).getTime()) d.setMonth(d.getMonth() + 1);
          day = d;
          hasDate = true;
        }
      }
    }
  }

  // 5) 시각
  // 5-a) noon / midnight
  const noon = consume(work.match(/\b(?:at\s+)?(noon|midday|midnight)\b/));
  if (noon) {
    hour = noon[1] === 'midnight' ? 0 : 12;
    minute = 0;
    hasTime = true;
    meridiem = hour === 12 ? 'pm' : 'am';
  }
  // 5-b) "half past three", "quarter to five", "ten past 3", "twenty to 4"
  if (hour === null) {
    const rm = consume(work.match(new RegExp(`\\b(?:at\\s+)?(half|(?:a\\s+)?quarter|${MIN_WORD_RE}|\\d{1,2})\\s+(?:minutes?\\s+)?(past|after|to|till|til|before)\\s+(${HOUR_RE})(?:\\s*o['’]?clock)?${MER_SUFFIX}`)));
    if (rm) {
      const mw = rm[1].replace(/^a\s+/, '');
      const mins = mw === 'half' ? 30 : mw === 'quarter' ? 15 : wordNum(mw);
      let h = wordNum(rm[3]);
      if (mins >= 0 && mins < 60 && h >= 0 && h <= 24) {
        if (/^(past|after)$/.test(rm[2])) { hour = h; minute = mins; }
        else { h = h - 1; hour = h < 0 ? 23 : h; minute = 60 - mins; }
        hasTime = true;
        applyMerSuffix(rm[4], rm[5]);
      }
    }
  }
  // 5-c) "3pm", "3:30 pm", "15:00", "at three", "at three thirty", "3 o'clock", "at 3 in the afternoon"
  if (hour === null) {
    const re = new RegExp(`\\b(at|around|by)?\\s*(${HOUR_RE})(?::\\s*(\\d{2})|\\s+(${MIN_WORD_RE}))?(\\s*o['’]?clock)?${MER_SUFFIX}`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(work))) {
      const [, anchor, hRaw, minDigits, minWord, oclock, mer, phrase] = m;
      const isWord = !/^\d+$/.test(hRaw);
      const h = wordNum(hRaw);
      if (!(h >= 0 && h <= 24)) continue;
      // 단서 없는 숫자/수사("buy 3 apples", "three")는 시각으로 보지 않는다
      if (!anchor && !minDigits && !oclock && !mer && !phrase && !(isWord && minWord)) continue;
      if (mer && h > 12) continue;
      if (minDigits && parseInt(minDigits, 10) > 59) continue;
      hour = h;
      minute = minDigits ? parseInt(minDigits, 10) : minWord ? wordNum(minWord) : 0;
      hasTime = true;
      consume(m);
      applyMerSuffix(mer, phrase);
      break;
    }
  }

  // 6) 시각과 떨어져 있는 시간대 구절: "in the afternoon", "this morning", "at night"
  {
    const dp = consume(work.match(new RegExp(`\\b(?:in the|this)\\s+(${DAYPART_RE})\\b|\\bat night\\b`)));
    if (dp) {
      const part = dp[1] ?? 'night';
      applyDayPart(part);
      if (/^this/.test(dp[0]) && !hasDate) dayPartSetsToday = true;
    }
  }
  if (dayPartSetsToday && !hasDate) { day = startOfDay(base); hasDate = true; }

  function applyDayPart(part: string) {
    if (part === 'morning') meridiem = meridiem ?? 'am';
    else { meridiem = meridiem ?? 'pm'; if (part === 'night') nightWord = true; }
  }
  function applyMerSuffix(mer?: string, phrase?: string) {
    if (mer) meridiem = /^a/.test(mer) ? 'am' : 'pm';
    else if (phrase) {
      const p = phrase.match(new RegExp(DAYPART_RE))?.[0] ?? 'night';
      applyDayPart(p);
    }
  }

  // 7) 오전/오후 보정 (한국어 파서와 같은 규칙)
  if (hour !== null) {
    if (meridiem === 'pm' && hour < 12) hour += 12;
    else if (meridiem === 'am' && hour === 12) hour = 0;
    else if (nightWord && hour === 12) hour = 24; // "12 at night" = 자정(다음 날)
    else if (meridiem === null && hour >= 1 && hour <= 7) hour += 12; // 미명시 1~7시는 오후
  }

  if (!hasDate && !hasTime) {
    return { date: null, hasDate: false, hasTime: false, content: cleanupContent(original), display: '' };
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
  return finish(original, work, ranges, sameLength, result, hasDate, hasTime);
}

function finish(original: string, work: string, ranges: Array<[number, number]>, sameLength: boolean, date: Date, hasDate: boolean, hasTime: boolean): ParsedSchedule {
  const src = sameLength ? original : work;
  let out = '';
  for (let i = 0; i < src.length; i++) {
    out += ranges.some(([s, e]) => i >= s && i < e) ? ' ' : src[i];
  }
  return { date, hasDate, hasTime, content: cleanupContent(out), display: formatDisplay(date, hasDate, hasTime) };
}

// ─── 내용 정리: 토큰 제거 후 남은 "remind me", 전치사, 구두점 정리 ───────────────
function cleanupContent(text: string): string {
  const LEAD = "at|on|in|for|by|around|from|until|till";
  const TAIL = `${LEAD}|the|to`;
  return text
    .replace(/(^|[,.;]\s*|\s+)(?:please\s+)?(?:remind me|remember|set (?:a |an )?(?:reminder|alarm))(?:\s+(?:to|about|of|that|for))?(?=\s|$)/gi, ' ')
    .replace(/(^|\s)(?:please)(?=\s|$)/gi, ' ')
    .replace(/(^|\s)o['’]?clock(?=\s|$)/gi, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    // 토큰을 지운 자리가 문장 가장자리가 되면서 홀로 남은 전치사·관사 ("at", "on the")
    .replace(new RegExp(`^(?:(?:${LEAD})\\s+)+`, 'i'), '')
    .replace(new RegExp(`(?:\\s+(?:${TAIL}))+$`, 'i'), '')
    .replace(/^[\s,.;:!?/-]+|[\s,.;:!?/-]+$/g, '')
    .trim();
}
