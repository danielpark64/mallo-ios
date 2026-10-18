// 기간 일정(휴가·출장·여행) — "20일부터 24일까지 휴가"처럼 말하면 시작일과 끝나는 날을 함께 뽑는다.
// 2026-10-18 사용자: "휴가를 등록하는 것처럼 기간이 들어가는 일정은?"
import { parseSchedule } from '../parseSchedule';

const base = new Date(2026, 9, 18, 14, 30); // 2026-10-18(일) 오후
const ymd = (d: Date | null | undefined) => (d ? `${d.getMonth() + 1}/${d.getDate()}` : null);

describe('기간 일정', () => {
  test('"20일부터 24일까지 휴가"', () => {
    const p = parseSchedule('20일부터 24일까지 휴가', base);
    expect(ymd(p.date)).toBe('10/20');
    expect(ymd(p.endDate)).toBe('10/24');
    expect(p.hasDate).toBe(true);
    expect(p.hasTime).toBe(false);
    expect(p.content).toBe('휴가');
  });

  test('"11월 3일부터 11월 7일까지 제주 출장" — 달이 있는 날짜', () => {
    const p = parseSchedule('11월 3일부터 11월 7일까지 제주 출장', base);
    expect(ymd(p.date)).toBe('11/3');
    expect(ymd(p.endDate)).toBe('11/7');
    expect(p.content).toBe('제주 출장');
  });

  test('"28일부터 다음 달 2일까지" 처럼 끝나는 날이 시작일보다 작으면 다음 달', () => {
    const p = parseSchedule('28일부터 2일까지 여행', base);
    expect(ymd(p.date)).toBe('10/28');
    expect(ymd(p.endDate)).toBe('11/2');
  });

  test('"다음 주 월요일부터 금요일까지 교육" — 요일은 시작한 주 기준', () => {
    const p = parseSchedule('다음 주 월요일부터 금요일까지 교육', base);
    expect(ymd(p.date)).toBe('10/26');
    expect(ymd(p.endDate)).toBe('10/30');
    expect(p.content).toBe('교육');
  });

  test('"11월 3일부터 3박 4일 제주 여행"', () => {
    const p = parseSchedule('11월 3일부터 3박 4일 제주 여행', base);
    expect(ymd(p.date)).toBe('11/3');
    expect(ymd(p.endDate)).toBe('11/6');
    expect(p.content).toBe('제주 여행');
  });

  test('"20일부터 5일간 연수" / "20일부터 5일 동안"', () => {
    expect(ymd(parseSchedule('20일부터 5일간 연수', base).endDate)).toBe('10/24');
    const p = parseSchedule('20일부터 5일 동안 연수', base);
    expect(ymd(p.endDate)).toBe('10/24');
    expect(p.content).toBe('연수');
  });

  test('시작 시간을 말하면 시작일에 그 시간(알람용)', () => {
    const p = parseSchedule('20일 아침 9시부터 22일까지 워크숍', base);
    expect(p.hasTime).toBe(true);
    expect(p.date?.getHours()).toBe(9);
    expect(ymd(p.endDate)).toBe('10/22');
    expect(p.content).toBe('워크숍');
  });

  test('하루 안의 시간 범위("2시부터 4시까지")는 기간 일정이 아니다', () => {
    const p = parseSchedule('내일 2시부터 4시까지 회의', base);
    expect(p.endDate).toBeUndefined();
    expect(ymd(p.date)).toBe('10/19');
  });

  test('기간이 아닌 평소 일정은 그대로', () => {
    const p = parseSchedule('내일 오후 3시에 치과', base);
    expect(p.endDate).toBeUndefined();
    expect(p.content).toBe('치과');
  });

  test('끝나는 날이 시작일과 같으면 기간이 아니다', () => {
    expect(parseSchedule('20일부터 20일까지 휴가', base).endDate).toBeUndefined();
  });
});

// 내보내기(복사·텍스트·PDF)에도 끝나는 날이 들어간다
import { recordToText, recordRows } from '../exportUtils';
test('내보내기 문구에 "~ 끝나는 날"', () => {
  const r = { id: 'v', uri: '', durationSec: 0, transcript: '휴가', content: '휴가', scheduleAt: new Date(2026, 9, 20).getTime(),
    endAt: new Date(2026, 9, 24).getTime(), scheduleDisplay: '', hasDate: true, hasTime: false, createdAt: 1 } as any;
  expect(recordToText(r)).toContain('~ 10월 24일 (토)');
  expect(recordRows([r])[0].when).toContain('~ 10월 24일 (토)');
});

// "부터" 없이 길이 표현만 있으면 기간으로 보지 않는다(일상 문장 오탐 방지, verify-fix 지적)
test('"내일 3박 4일 여행 준비물 사기"·"어제 3일 동안 못 잤어"는 기간이 아니다', () => {
  expect(parseSchedule('내일 3박 4일 여행 준비물 사기', base).endDate).toBeUndefined();
  expect(parseSchedule('어제 3일 동안 못 잤어', base).endDate).toBeUndefined();
  expect(parseSchedule('내일 회의 3일간 준비한 자료 발표', base).endDate).toBeUndefined();
});
