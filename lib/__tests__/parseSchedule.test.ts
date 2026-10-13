// 한국어 자연어 → 일정 파서 회귀 테스트. 기준 시각 고정: 2026-06-06(토) 17:00
import { parseSchedule } from '../parseSchedule';

const base = new Date(2026, 5, 6, 17, 0, 0);

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

type Expect = { at: string | null; hasTime?: boolean; content?: string };

const cases: Array<[string, Expect]> = [
  // ── 기본 ──
  ['내일 오후 3시에 팀 회의',        { at: '2026-06-07 15:00', hasTime: true, content: '팀 회의' }],
  ['오늘 저녁 7시 반에 약속',        { at: '2026-06-06 19:30', hasTime: true, content: '약속' }],
  ['모레 오전 10시 치과 예약',       { at: '2026-06-08 10:00', hasTime: true, content: '치과 예약' }],
  ['다음 주 월요일 점심 약속',        { at: '2026-06-08 00:00', hasTime: false, content: '점심 약속' }],
  ['6월 20일 엄마 생신',            { at: '2026-06-20 00:00', hasTime: false, content: '엄마 생신' }],
  ['30분 후에 약 먹기',             { at: '2026-06-06 17:30', hasTime: true, content: '약 먹기' }],
  ['2시간 후 택배 받기',             { at: '2026-06-06 19:00', hasTime: true, content: '택배 받기' }],
  ['금요일 저녁에 영화',             { at: '2026-06-12 00:00', hasTime: false, content: '저녁에 영화' }],
  ['세시에 커피',                   { at: '2026-06-07 15:00', hasTime: true, content: '커피' }],
  ['정오에 미팅',                   { at: '2026-06-07 12:00', hasTime: true, content: '미팅' }],
  ['자정에 알람',                   { at: '2026-06-07 00:00', hasTime: true, content: '알람' }],
  ['회의 자료 정리',                 { at: null, content: '회의 자료 정리' }],
  ['내일 회의',                     { at: '2026-06-07 00:00', hasTime: false, content: '회의' }],
  ['3시 회의',                      { at: '2026-06-07 15:00', hasTime: true, content: '회의' }],
  ['다음주 수요일 오후 2시 30분 발표', { at: '2026-06-10 14:30', hasTime: true, content: '발표' }],
  ['월요일 오전 열시 출근',           { at: '2026-06-08 10:00', hasTime: true, content: '출근' }],
  ['내일 열한시 반 회의',             { at: '2026-06-07 11:30', hasTime: true, content: '회의' }],
  ['20일 오후 2시 회의',             { at: '2026-06-20 14:00', hasTime: true, content: '회의' }],
  ['12월 25일 저녁 6시 파티',         { at: '2026-12-25 18:00', hasTime: true, content: '파티' }],
  // ── 12시 처리 ──
  ['오후 12시 점심',                 { at: '2026-06-07 12:00', hasTime: true, content: '점심' }],
  ['오전 12시 반',                   { at: '2026-06-07 00:30', hasTime: true }],
  ['밤 12시 알람',                   { at: '2026-06-07 00:00', hasTime: true, content: '알람' }],
  ['내일 밤 12시 마감',              { at: '2026-06-08 00:00', hasTime: true, content: '마감' }],
  // ── 시간대 단어가 내용의 일부인 경우 ──
  ['오늘 19시 저녁 식사',             { at: '2026-06-06 19:00', hasTime: true, content: '저녁 식사' }],
  ['열두시 정각 점심',                { at: '2026-06-07 12:00', hasTime: true, content: '점심' }],
  ['저녁 10시 운동',                 { at: '2026-06-06 22:00', hasTime: true, content: '운동' }],
  ['점심에 약속',                    { at: null, content: '점심에 약속' }],
  // ── 유효성 ──
  ['2월 30일 회의',                  { at: null }],
  ['13월 1일 회의',                  { at: null }],
  ['25시에 회의',                    { at: null }],
  ['2월 29일 회의',                  { at: '2028-02-29 00:00', hasTime: false }], // 2027은 평년 → 2028
  // ── N일 후는 자정 기준 ──
  ['3일 후 회의',                    { at: '2026-06-09 00:00', hasTime: false, content: '회의' }],
];

describe('parseSchedule', () => {
  test.each(cases)('%s', (input, exp) => {
    const r = parseSchedule(input, base);
    expect(r.date ? fmt(r.date) : null).toBe(exp.at);
    if (exp.hasTime !== undefined) expect(r.hasTime).toBe(exp.hasTime);
    if (exp.content !== undefined) expect(r.content).toBe(exp.content);
  });
});

describe('겹쳐 말한 시간 표현', () => {
  test('"7시에 7시에"처럼 같은 시각이 두 번 인식돼도 내용에 남지 않는다', () => {
    const base = new Date(2026, 9, 12, 9, 0);
    const p = parseSchedule('저녁 밥은 송내역 옆에서 7시에 7시에 맛난 거 먹을 거야', base);
    expect(p.hasTime).toBe(true);
    expect(p.content).toBe('밥은 송내역 옆에서 맛난 거 먹을 거야');
  });
});
