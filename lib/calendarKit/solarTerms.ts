// 교대알람(src/constants/solarTerms.ts)에서 가져옴 — 한국어 화면에서만 표시
import { getLang } from '../i18n/lang';
// 24절기 근사 계산 — 태양 황경(순간 천문 이벤트) 기준이라 음력 변환 라이브러리로는 못 구한다.
// 1900-01-06 05:05(KST)를 기준 삼아 회귀년(365.24219878일) 길이만큼 누적하고, 절기별 오프셋
// (sTermInfo, 분 단위)을 더하는 선형 근사식 — 1900~2100년 범위에서 실제 절기와 대부분 하루
// 이내로 맞아떨어진다(초 단위 정밀 천문 계산 없이 오프라인에서 쓸 수 있는 수준의 근사치).
const TERM_NAMES = [
  '소한','대한','입춘','우수','경칩','춘분','청명','곡우','입하','소만','망종','하지',
  '소서','대서','입추','처서','백로','추분','한로','상강','입동','소설','대설','동지',
];
const HAJI_IDX = 11;
const IPCHU_IDX = 14;
const S_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149,
  195551, 218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494,
  397447, 419210, 440795, 462224, 483532, 504758,
];
const BASE_UTC_MS = Date.UTC(1900, 0, 5, 20, 5, 0); // KST 1900-01-06 05:05 기준 절기(소한) 시각
const TROPICAL_YEAR_MS = 31556925974.7;

function getTermDateStr(year: number, n: number): string {
  const ms = BASE_UTC_MS + TROPICAL_YEAR_MS * (year - 1900) + S_TERM_INFO[n] * 60000;
  const d = new Date(ms + 9 * 3600 * 1000); // UTC → KST 필드로 읽기 위한 시프트
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
// 천간(갑을병정무기경신임계) 10일 주기 — 2000-01-01(무오일, 천간 인덱스 4)을 기준점으로 삼는다.
const REF_DAY = dayIndex('2000-01-01');
const REF_STEM = 4; // 무(戊)
function stemIndex(dateStr: string): number {
  return (((dayIndex(dateStr) - REF_DAY + REF_STEM) % 10) + 10) % 10;
}
const GYEONG_STEM = 6; // 경(庚)
function firstGyeongOnOrAfter(dateStr: string): string {
  let d = dateStr;
  for (let i = 0; i < 10; i++) {
    if (stemIndex(d) === GYEONG_STEM) return d;
    d = addDays(d, 1);
  }
  return d; // 도달 불가(경일은 10일 내 반드시 있음) — 타입 안전용 폴백
}

const cache: Record<string, string> = {};
const builtYears = new Set<number>();

function addToCache(ds: string, label: string) {
  cache[ds] = cache[ds] ? `${cache[ds]} · ${label}` : label;
}

function buildYear(year: number) {
  const termDates: string[] = [];
  for (let n = 0; n < 24; n++) {
    const ds = getTermDateStr(year, n);
    termDates[n] = ds;
    addToCache(ds, TERM_NAMES[n]);
  }
  // 삼복(초복/중복/말복) — 24절기는 아니고 하지/입추 이후 경일(庚日)을 세는 별도 전통 계산법이지만,
  // 달력에서는 절기와 같은 자리에 함께 보여준다.
  // 표준 정의: 초복 = 하지 이후 세 번째 경일, 중복 = 네 번째 경일(=초복+10일), 말복 = 입추 이후 첫 번째 경일.
  const firstGyeong = firstGyeongOnOrAfter(termDates[HAJI_IDX]);
  const chobok = addDays(firstGyeong, 20);
  const jungbok = addDays(firstGyeong, 30);
  const malbok = firstGyeongOnOrAfter(termDates[IPCHU_IDX]);
  addToCache(chobok, '초복');
  addToCache(jungbok, '중복');
  addToCache(malbok, '말복');
}

export function getSolarTerm(dateStr: string): string | undefined {
  if (getLang() !== 'ko') return undefined; // 24절기는 한국어일 때만 표시
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!builtYears.has(year)) { buildYear(year); builtYears.add(year); }
  return cache[dateStr];
}
