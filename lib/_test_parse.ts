import { parseSchedule } from './parseSchedule';

// 기준 시각 고정: 2026-06-06(토) 17:00
const base = new Date(2026, 5, 6, 17, 0, 0);

const cases = [
  '내일 오후 3시에 팀 회의',
  '오늘 저녁 7시 반에 약속',
  '모레 오전 10시 치과 예약',
  '다음 주 월요일 점심 약속',
  '6월 20일 엄마 생신',
  '30분 후에 약 먹기',
  '2시간 후 택배 받기',
  '금요일 저녁에 영화',
  '세시에 커피',
  '열두시 정각 점심',
  '정오에 미팅',
  '자정에 알람',
  '회의 자료 정리',          // 날짜·시간 없음
  '내일 회의',                // 날짜만
  '3시 회의',                 // 시간만
  '다음주 수요일 오후 2시 30분 발표',
];

for (const c of cases) {
  const r = parseSchedule(c, base);
  const when = r.date
    ? r.date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : '— (없음)';
  console.log(
    `입력: ${c}\n  → date=${when}  hasDate=${r.hasDate} hasTime=${r.hasTime}\n  → display="${r.display}"  content="${r.content}"\n`
  );
}
