// ─── 날짜·시간 없이 녹음했을 때의 기본값 ─────────────────────────────────────────
// "오늘/내일" 한마디 없이 말한 녹음(회의·강의 녹음, "우유 사기" 같은 메모)은 버리지 않고
// **녹음을 시작한 날짜·시각**으로 저장한다(2026-10-14 결정 — 회의·강의 기록은 그 시각이 곧 날짜다).
// needsDate 꼬리표를 남겨 사용자가 아무 때나 날짜를 정할 수 있게 하고, 이미 지난 시각이라 알람은 걸지 않는다.
import { formatDisplay } from './parseSchedule';

export type AutoDated = {
  date: Date;
  display: string;
  hasDate: true;
  hasTime: true;
  needsDate: true;
};

/** 녹음 시작 시각(분 단위로 내림)으로 저장할 값 */
export function recordedAtStamp(recordedAt: Date = new Date()): AutoDated {
  const date = new Date(recordedAt);
  date.setSeconds(0, 0);
  return { date, display: formatDisplay(date, true, true), hasDate: true, hasTime: true, needsDate: true };
}
