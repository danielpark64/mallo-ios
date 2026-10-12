// ─── 미리 알림(사전 알림) ────────────────────────────────────────────────────
// 정각 알람과 별도로 10분·30분·1시간·하루 전에 한 번씩 미리 울린다.
// 하루 전은 "전날 저녁 8시"에 울린다(새벽 일정이라도 밤중에 깨우지 않기 위해).
// 네이티브/Expo 양쪽에서 정각 슬롯과 구분하기 위해 recordId 뒤에 "#preN"을 붙인 식별자를 쓴다
// → 미리 알림을 끄거나 미루어도 정각 알람(+1·+2분 재알림)은 건드리지 않는다.
import { formatTime } from './dateUtils';

import { getLang } from './i18n/lang';

export const REMIND_OPTIONS = [10, 30, 60, 1440] as const;
export type RemindBefore = (typeof REMIND_OPTIONS)[number];
export const DEFAULT_REMIND: RemindBefore[] = [30];
/** 하루 전 알림이 울리는 전날 시각 */
export const DAY_BEFORE_HOUR = 20;

/**
 * 칩 라벨: "30분 전" / en "30 min before", "1시간 전" / "1 hour before", "하루 전" / "Day before"
 * ja "30分前"·"1時間前"·"前日" / zh "提前30分钟"·"提前1小时"·"提前1天" / es "30 min antes"·"1 hora antes"·"Un día antes" …
 */
export function remindLabel(m: number): string {
  const lang = getLang();
  const h = Math.round(m / 60);
  switch (lang) {
    case 'en':
      if (m === 1440) return 'Day before';
      return m >= 60 ? `${h} ${h === 1 ? 'hour' : 'hours'} before` : `${m} min before`;
    case 'ja':
      if (m === 1440) return '前日';
      return m >= 60 ? `${h}時間前` : `${m}分前`;
    case 'zh-Hans':
      if (m === 1440) return '提前1天';
      return m >= 60 ? `提前${h}小时` : `提前${m}分钟`;
    case 'zh-Hant':
      if (m === 1440) return '提前1天';
      return m >= 60 ? `提前${h}小時` : `提前${m}分鐘`;
    case 'es':
      if (m === 1440) return 'Un día antes';
      return m >= 60 ? `${h} ${h === 1 ? 'hora' : 'horas'} antes` : `${m} min antes`;
    case 'fr':
      if (m === 1440) return 'La veille';
      return m >= 60 ? `${h} ${h === 1 ? 'heure' : 'heures'} avant` : `${m} min avant`;
    case 'de':
      if (m === 1440) return 'Am Vortag';
      return m >= 60 ? `${h} ${h === 1 ? 'Stunde' : 'Stunden'} vorher` : `${m} Min. vorher`;
    case 'pt':
      if (m === 1440) return 'Um dia antes';
      return m >= 60 ? `${h} ${h === 1 ? 'hora' : 'horas'} antes` : `${m} min antes`;
    default:
      if (m === 1440) return '하루 전';
      return m >= 60 ? `${h}시간 전` : `${m}분 전`;
  }
}

export function isRemindOption(m: unknown): m is RemindBefore {
  return typeof m === 'number' && (REMIND_OPTIONS as readonly number[]).includes(m);
}

/** 저장값 정리: 허용 옵션만, 중복 제거, 오름차순 */
export function normalizeRemind(list: unknown): RemindBefore[] {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.filter(isRemindOption))).sort((a, b) => a - b);
}

/** 미리 알림이 울릴 시각 */
export function remindFireAt(scheduleAt: Date, m: number): Date {
  if (m === 1440) {
    const d = new Date(scheduleAt);
    d.setDate(d.getDate() - 1);
    d.setHours(DAY_BEFORE_HOUR, 0, 0, 0);
    return d;
  }
  return new Date(scheduleAt.getTime() - m * 60_000);
}

/**
 * 미리 알림 문구: "30분 뒤 · 치과 예약", "내일 오후 3:00 · 치과 예약" / en "In 30 min · X", "Tomorrow 3:00 PM · X"
 * ja "30分後 · X"·"明日 15:00 · X" / zh "30分钟后 · X"·"明天 15:00 · X" / es "En 30 min · X"·"Mañana 15:00 · X" …
 */
export function remindBody(m: number, content: string, scheduleAt: Date): string {
  const lang = getLang();
  const t = formatTime(scheduleAt);
  const h = Math.round(m / 60);
  let head: string;
  switch (lang) {
    case 'en': head = m === 1440 ? `Tomorrow ${t}` : m >= 60 ? `In ${h} ${h === 1 ? 'hour' : 'hours'}` : `In ${m} min`; break;
    case 'ja': head = m === 1440 ? `明日 ${t}` : m >= 60 ? `${h}時間後` : `${m}分後`; break;
    case 'zh-Hans': head = m === 1440 ? `明天 ${t}` : m >= 60 ? `${h}小时后` : `${m}分钟后`; break;
    case 'zh-Hant': head = m === 1440 ? `明天 ${t}` : m >= 60 ? `${h}小時後` : `${m}分鐘後`; break;
    case 'es': head = m === 1440 ? `Mañana ${t}` : m >= 60 ? `En ${h} ${h === 1 ? 'hora' : 'horas'}` : `En ${m} min`; break;
    case 'fr': head = m === 1440 ? `Demain ${t}` : m >= 60 ? `Dans ${h} ${h === 1 ? 'heure' : 'heures'}` : `Dans ${m} min`; break;
    case 'de': head = m === 1440 ? `Morgen ${t}` : m >= 60 ? `In ${h} ${h === 1 ? 'Stunde' : 'Stunden'}` : `In ${m} Min.`; break;
    case 'pt': head = m === 1440 ? `Amanhã ${t}` : m >= 60 ? `Em ${h} ${h === 1 ? 'hora' : 'horas'}` : `Em ${m} min`; break;
    default: head = m === 1440 ? `내일 ${t}` : m >= 60 ? `${h}시간 뒤` : `${m}분 뒤`; break;
  }
  return `${head} · ${content}`;
}

/** 미리 알림용 식별자 접미사 */
export function preRecordId(recordId: string, m: number): string {
  return `${recordId}#pre${m}`;
}
/** "id#pre30" → { recordId: "id", minutes: 30 } / 정각 알람이면 null */
export function parsePreRecordId(id: string): { recordId: string; minutes: number } | null {
  const mm = /^(.+)#pre(\d+)$/.exec(id);
  return mm ? { recordId: mm[1], minutes: Number(mm[2]) } : null;
}

const KO_HOUR: Record<string, number> = { 한: 1, 두: 2, 세: 3, 1: 1, 2: 2, 3: 3 };

/**
 * 말로 한 "미리 알림" 요청을 찾아 분으로 바꾸고 문장에서 지운다.
 *  "30분 전에 알려줘", "한 시간 전에 미리 알려 줘", "하루 전에 알림", "전날 알려줘"
 * 알려줘/알림/알람/미리 같은 말이 같이 있을 때만 인식한다 ("30분 전에 도착" 같은 내용은 그대로).
 */
export function extractRemindBefore(text: string): { remindBefore: RemindBefore[] | null; text: string } {
  const found: RemindBefore[] = [];
  let out = text;
  const tail = '(?:에|에는)?\\s*(?:미리\\s*)?(?:알려\\s*줘|알려\\s*주세요|알려\\s*주|알려|알림|알람)(?:\\s*(?:줘|주세요|해줘|해\\s*줘))?';
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => RemindBefore | null]> = [
    [new RegExp(`(?:하루|전날|1일|일일)\\s*전?${tail}`), () => 1440],
    [new RegExp(`(한|두|세|[123])\\s*시간\\s*전${tail}`), (m) => (KO_HOUR[m[1]] >= 2 ? 60 : 60)],
    [new RegExp(`(\\d{1,3})\\s*분\\s*전${tail}`), (m) => {
      const n = parseInt(m[1], 10);
      if (n <= 0) return null;
      if (n <= 15) return 10;
      if (n <= 45) return 30;
      return 60;
    }],
    [new RegExp(`(?:십|이십|삼십|사십|오십)\\s*분\\s*전${tail}`), (m) => {
      const n = ({ 십: 10, 이십: 20, 삼십: 30, 사십: 40, 오십: 50 } as Record<string, number>)[m[0].trim().slice(0, m[0].indexOf('분')).trim()] ?? 30;
      return n <= 15 ? 10 : n <= 45 ? 30 : 60;
    }],
  ];
  for (const [re, pick] of patterns) {
    const m = out.match(re);
    if (!m) continue;
    const v = pick(m);
    if (v) found.push(v);
    out = out.replace(m[0], ' ');
  }
  out = out.replace(/\s{2,}/g, ' ').trim();
  return { remindBefore: found.length ? normalizeRemind(found) : null, text: out };
}
