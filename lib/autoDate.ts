// ─── 날짜·시간 없이 녹음했을 때의 기본값 ─────────────────────────────────────────
// "오늘/내일" 한마디 없이 바로 말한 메모는 버리지 않고 오늘(시간 미정)으로 저장한다.
// needsDate 꼬리표를 남겨 사용자가 아무 때나 날짜를 정할 수 있게 하고, 알람은 걸지 않는다.
import { formatDisplay } from './parseSchedule';

export type AutoDated = {
  date: Date;
  display: string;
  hasDate: true;
  hasTime: false;
  needsDate: true;
};

export function fallbackToToday(now: Date = new Date()): AutoDated {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { date, display: formatDisplay(date, true, false), hasDate: true, hasTime: false, needsDate: true };
}
