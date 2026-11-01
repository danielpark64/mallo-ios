// ─── 음력 표시 (달력 칸의 작은 글씨) ───────────────────────────────────────────────
// 교대알람(src/utils lunarShortText)과 같은 방식. korean-lunar-calendar는 인터넷 없이 계산한다(1000~2050년).
import KoreanLunarCalendar from 'korean-lunar-calendar';

// 생성자가 매번 오늘 날짜 계산과 캐시를 새로 만든다 — 저사양 기기(32)에서 칸마다 만들면 스크롤이 끊긴다.
// 인스턴스 하나를 같이 쓰고, 결과는 날짜별로 기억한다.
let shared: KoreanLunarCalendar | null = null;
const memo = new Map<string, string>();

/** 칸에 넣을 짧은 음력 "9.8" / 윤달 "윤6.4". 범위 밖이면 '' */
export function lunarShortText(d: Date): string {
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const hit = memo.get(key);
  if (hit != null) return hit;
  shared ??= new KoreanLunarCalendar();
  let out = '';
  if (shared.setSolarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())) {
    const { month, day, intercalation } = shared.getLunarCalendar();
    out = `${intercalation ? '윤' : ''}${month}.${day}`;
  }
  if (memo.size > 5000) memo.clear();
  memo.set(key, out);
  return out;
}

/** 달력 칸용 더 짧은 음력: 음력 초하루만 "10.1"(윤달 "윤6.1"), 나머지 날은 일만 "15".
 *  칸이 좁아 "10.10"이 "10…."로 잘렸다(노트에서도). 몇 월인지는 초하루 칸과 날짜 시트에서 알 수 있다. */
export function lunarCellText(d: Date): string {
  const full = lunarShortText(d);
  if (!full) return '';
  const dot = full.indexOf('.');
  const day = full.slice(dot + 1);
  return day === '1' ? full : day;
}
