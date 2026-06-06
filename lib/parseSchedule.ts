// ─── 한국어 자연어 → 일정(날짜·시간) 파서 ──────────────────────────────────────
// STT로 받은 한국어 문장에서 날짜·시간을 추출해 실제 Date 로 변환한다.
// 예) "내일 오후 3시에 팀 회의" → { date: 2026-06-07 15:00, content: "팀 회의" }

export type ParsedSchedule = {
  /** 최종 일정 시각(날짜+시간 결합). 날짜·시간 중 하나도 없으면 null */
  date: Date | null;
  /** 날짜 정보(오늘/내일/요일/N월N일 등)가 있었나 */
  hasDate: boolean;
  /** 시간 정보(N시/오후 등)가 있었나 */
  hasTime: boolean;
  /** 날짜·시간 토큰을 제거한 할 일 내용 */
  content: string;
  /** 사람이 읽기 좋은 일정 표현 (예: "6월 7일 (토) 오후 3:00") */
  display: string;
};

// 한글 고유어 수사 → 숫자 (시(時)에 주로 쓰임: 한시~열두시)
const NATIVE_HOUR: Record<string, number> = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
  열한: 11, 열두: 12,
};

// 한자어 수사 → 숫자 (분(分)에 주로 쓰임)
const SINO_NUM: Record<string, number> = {
  영: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9, 십: 10,
  이십: 20, 삼십: 30, 사십: 40, 오십: 50,
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_MAP: Record<string, number> = {
  일요일: 0, 월요일: 1, 화요일: 2, 수요일: 3, 목요일: 4, 금요일: 5, 토요일: 6,
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// ─── 메인 파서 ────────────────────────────────────────────────────────────────
export function parseSchedule(input: string, base: Date = new Date()): ParsedSchedule {
  const text = (input ?? '').trim();
  let hasDate = false;
  let hasTime = false;

  // 날짜 계산용: 자정 기준 날짜
  let day = startOfDay(base);
  let hour: number | null = null;
  let minute = 0;
  let meridiemKnown = false; // 오전/오후가 명시됐는지

  // 제거할 매칭 구간(내용 추출용)
  const matched: string[] = [];
  const mark = (s?: string | null) => { if (s) matched.push(s); };

  // 1) "N분 후 / N시간 후 / N일 후" — 상대 시각 (날짜+시간 동시 설정)
  const relAfter = text.match(/(\d+)\s*(분|시간|일)\s*(후|뒤|이따|있다가)/);
  if (relAfter) {
    const n = parseInt(relAfter[1], 10);
    const unit = relAfter[2];
    const result = new Date(base);
    if (unit === '분') result.setMinutes(result.getMinutes() + n);
    else if (unit === '시간') result.setHours(result.getHours() + n);
    else if (unit === '일') result.setDate(result.getDate() + n);
    mark(relAfter[0]);
    const content = stripContent(text, matched);
    return {
      date: result,
      hasDate: true,
      hasTime: unit !== '일',
      content,
      display: formatDisplay(result, true, unit !== '일'),
    };
  }

  // 2) 상대 날짜 단어
  const relDayWords: Array<[RegExp, number]> = [
    [/그저께|그제/, -2],
    [/어제/, -1],
    [/오늘/, 0],
    [/내일|낼/, 1],
    [/모레/, 2],
    [/글피/, 3],
  ];
  for (const [re, offset] of relDayWords) {
    const m = text.match(re);
    if (m) {
      day = startOfDay(base);
      day.setDate(day.getDate() + offset);
      hasDate = true;
      mark(m[0]);
      break;
    }
  }

  // 3) 주(週) + 요일  /  단독 요일
  const weekScope = text.match(/(이번|다음|담|저번|지난)\s*주/);
  const weekdayM = text.match(/(일요일|월요일|화요일|수요일|목요일|금요일|토요일)/);
  if (weekdayM) {
    const targetDow = WEEKDAY_MAP[weekdayM[1]];
    let weekOffset = 0;
    if (weekScope) {
      if (/다음|담/.test(weekScope[1])) weekOffset = 1;
      else if (/저번|지난/.test(weekScope[1])) weekOffset = -1;
      mark(weekScope[0]);
    }
    const d = startOfDay(base);
    const curDow = d.getDay();
    let diff = targetDow - curDow;
    if (weekOffset === 0 && diff < 0) diff += 7; // 이번 주 안에서 지난 요일이면 다음 것으로
    d.setDate(d.getDate() + diff + weekOffset * 7);
    day = d;
    hasDate = true;
    mark(weekdayM[0]);
  } else if (weekScope) {
    // 요일 없이 "다음 주"만 → 그 주 같은 요일
    const d = startOfDay(base);
    const off = /다음|담/.test(weekScope[1]) ? 7 : /저번|지난/.test(weekScope[1]) ? -7 : 0;
    d.setDate(d.getDate() + off);
    day = d;
    hasDate = true;
    mark(weekScope[0]);
  }

  // 4) "N월 N일" (절대 날짜) — 상대 날짜보다 우선
  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (md) {
    const month = parseInt(md[1], 10) - 1;
    const date = parseInt(md[2], 10);
    const d = startOfDay(base);
    d.setMonth(month, date);
    // 이미 지난 날짜면 내년으로
    if (d.getTime() < startOfDay(base).getTime()) d.setFullYear(d.getFullYear() + 1);
    day = d;
    hasDate = true;
    mark(md[0]);
  } else {
    // "N일" 단독 (이번 달 그 날짜)
    const dayOnly = text.match(/(?<![월\d])\s(\d{1,2})\s*일(?!\s*(후|뒤|이따|있다가))/);
    if (dayOnly) {
      const date = parseInt(dayOnly[1], 10);
      if (date >= 1 && date <= 31) {
        const d = startOfDay(base);
        d.setDate(date);
        if (d.getTime() < startOfDay(base).getTime()) d.setMonth(d.getMonth() + 1);
        day = d;
        hasDate = true;
        mark(dayOnly[0]);
      }
    }
  }

  // 5) 오전/오후/시간대 키워드
  let meridiem: 'am' | 'pm' | null = null;
  const mer = text.match(/오전|오후|새벽|아침|점심|낮|저녁|밤|정오|자정/);
  if (mer) {
    const w = mer[0];
    if (/오전|새벽|아침/.test(w)) meridiem = 'am';
    else if (/오후|점심|낮|저녁|밤/.test(w)) meridiem = 'pm';
    if (w === '정오') { hour = 12; minute = 0; hasTime = true; meridiemKnown = true; }
    if (w === '자정') { hour = 0; minute = 0; hasTime = true; meridiemKnown = true; }
    if (meridiem) meridiemKnown = true;
    mark(w);
  }

  // 6) 시각: "N시 (N분)" — 숫자/한글 둘 다
  if (hour === null) {
    // 숫자 시
    const hm = text.match(/(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/);
    if (hm) {
      hour = parseInt(hm[1], 10);
      if (hm[2]) minute = parseInt(hm[2], 10);
      else if (hm[3]) minute = 30; // "반"
      hasTime = true;
      mark(hm[0]);
    } else {
      // 한글 고유어 시 ("세시", "열두시")
      const nativeKeys = Object.keys(NATIVE_HOUR).sort((a, b) => b.length - a.length);
      for (const k of nativeKeys) {
        const re = new RegExp(`${k}\\s*시\\s*(?:(\\d{1,2}|반)\\s*분?)?`);
        const nm = text.match(re);
        if (nm) {
          hour = NATIVE_HOUR[k];
          if (nm[1] === '반') minute = 30;
          else if (nm[1]) minute = parseInt(nm[1], 10);
          hasTime = true;
          mark(nm[0]);
          break;
        }
      }
    }
  }

  // 7) 오전/오후 보정
  if (hour !== null) {
    if (meridiem === 'pm' && hour < 12) hour += 12;
    else if (meridiem === 'am' && hour === 12) hour = 0;
    // 오전/오후 미명시 + 1~7시 → 사람들은 보통 오후를 의미하는 경향 (단, 명시 안 됨 표시)
  }

  // ─── 결합 ──────────────────────────────────────────────────────────────────
  if (!hasDate && !hasTime) {
    return { date: null, hasDate: false, hasTime: false, content: text, display: '' };
  }

  const result = new Date(day);
  if (hasTime && hour !== null) {
    result.setHours(hour, minute, 0, 0);
  } else {
    // 날짜만 있으면 시각은 0시로 두되 표시에서 "시간 미정" 처리
    result.setHours(0, 0, 0, 0);
  }

  // 날짜 없이 시간만 말한 경우 → 오늘(이미 지난 시각이면 다음 날로)
  if (!hasDate && hasTime) {
    const today = startOfDay(base);
    result.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
    if (result.getTime() < base.getTime()) result.setDate(result.getDate() + 1);
    hasDate = true;
  }

  const content = stripContent(text, matched);
  return {
    date: result,
    hasDate,
    hasTime,
    content,
    display: formatDisplay(result, hasDate, hasTime),
  };
}

// ─── 내용 추출: 매칭된 날짜·시간 토큰과 조사 제거 ────────────────────────────────
function stripContent(text: string, matched: string[]): string {
  let out = text;
  // 긴 매칭부터 제거(부분 겹침 방지)
  for (const m of [...matched].sort((a, b) => b.length - a.length)) {
    out = out.replace(m, ' ');
  }
  out = out
    .replace(/정각/g, ' ')
    // 토큰 제거 후 홀로 남은 조사 제거 (앞뒤가 공백/문장경계인 경우만)
    .replace(/(^|\s)(에서|에는|에|엔|까지|부터|쯤|경|마다|동안|날|쯤에)(?=\s|$)/g, ' ')
    .replace(/^[\s,./-]+|[\s,./-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out;
}

// ─── 사람이 읽기 좋은 표현 ─────────────────────────────────────────────────────
export function formatDisplay(d: Date, hasDate: boolean, hasTime: boolean): string {
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const dow = WEEKDAYS[d.getDay()];
  let s = '';
  if (hasDate) s += `${month}월 ${date}일 (${dow})`;
  if (hasTime) {
    const h = d.getHours();
    const m = d.getMinutes();
    const mer = h < 12 ? '오전' : '오후';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    s += `${hasDate ? ' ' : ''}${mer} ${h12}:${m.toString().padStart(2, '0')}`;
  }
  return s.trim();
}

// 날짜·시간 포함 여부만 빠르게 (UI 배지용)
export function hasDateTime(text: string): boolean {
  const p = parseSchedule(text);
  return p.hasDate || p.hasTime;
}
