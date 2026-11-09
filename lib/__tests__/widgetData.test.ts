import { buildWidgetPayload, shortDateFor, shortShiftLabels } from '../widgetData';
import { parseWidgetUrl } from '../widget';
import type { ScheduleRecord } from '../storage';
import type { ShiftData } from '../shiftImport';

const rec = (id: string, at: Date, o: Partial<ScheduleRecord> = {}): ScheduleRecord => ({
  id, uri: '', durationSec: 0, transcript: id, content: id, scheduleAt: at.getTime(), scheduleDisplay: '',
  hasDate: true, hasTime: true, createdAt: 0, ...o,
});

const NOW = new Date(2026, 10, 8, 9, 0); // 2026-11-08(일) 09:00

describe('buildWidgetPayload', () => {
  it('이번 달 1일부터 석 달치 날짜와 달 이름을 담는다', () => {
    const p = buildWidgetPayload([], null, 'ko', NOW);
    expect(p.from).toBe('2026-11-01');
    expect(p.ev).toHaveLength(30 + 31 + 31);
    expect(p.months.map((m) => m.title)).toEqual(['2026년 11월', '2026년 12월', '2027년 1월']);
    expect(p.wd[0]).toBe('일');
    expect(p.str.more).toBe('외 {n}건');
  });

  it('지난 시각의 일정은 빼고, 시간 없는 오늘 일정과 진행 중인 기간 일정은 남긴다', () => {
    const recs = [
      rec('지남', new Date(2026, 10, 8, 8, 0)),
      rec('오늘하루', new Date(2026, 10, 8), { hasTime: false }),
      rec('휴가', new Date(2026, 10, 5), { hasTime: false, endAt: new Date(2026, 10, 9).getTime() }),
      rec('다음', new Date(2026, 10, 10, 11, 0)),
      rec('너무먼', new Date(2027, 1, 1, 9, 0)),
      rec('날짜없음', new Date(2026, 10, 10), { scheduleAt: null }),
    ];
    const p = buildWidgetPayload(recs, null, 'ko', NOW);
    expect(p.items.map((i) => i.id)).toEqual(['휴가', '오늘하루', '다음']);
    const next = p.items[2];
    expect(next.timed).toBe(true);
    expect(next.when).toBe('11/10 오전 11:00');
    expect(next.date).toBe('11월 10일 (화)');
    expect(next.time).toBe('오전 11:00');
    const range = p.items[0];
    expect(range.when).toBe('11/5~11/9');
    expect(range.end).toBe(new Date(2026, 10, 9).getTime());
    expect(p.items[1].time).toBe('시간 미정');
  });

  it('날짜를 아직 안 정한 일정·미룬 일정은 빼고, 첫 줄이 비면 다음 줄을 제목으로', () => {
    const recs = [
      rec('미정', new Date(2026, 10, 10, 9, 0), { needsDate: true }),
      rec('미룸', new Date(2026, 10, 10, 10, 0), { outcome: { kind: 'moved', at: 0 } as ScheduleRecord['outcome'] }),
      rec('빈줄', new Date(2026, 10, 10, 11, 0), { content: '\n  \n치과' }),
    ];
    const p = buildWidgetPayload(recs, null, 'ko', NOW);
    expect(p.items.map((i) => i.id)).toEqual(['빈줄']);
    expect(p.items[0].title).toBe('치과');
  });

  it('기간 일정은 덮는 날마다 점을 찍는다(이번 달 이전 부분은 자른다)', () => {
    const recs = [rec('휴가', new Date(2026, 9, 30), { hasTime: false, endAt: new Date(2026, 10, 2).getTime() })];
    const p = buildWidgetPayload(recs, null, 'ko', NOW);
    expect(p.ev.slice(0, 3)).toEqual([1, 1, 0]);
  });

  it('근무표를 이번 달 1일 기준으로 맞춘다', () => {
    const shifts: ShiftData = { from: '2026-10-31', labels: ['초번', '말번', '비번'], colors: ['#111111', '#222222', '#333333'], off: [false, false, true], days: [0, 1, 2, -1, 0] };
    const p = buildWidgetPayload([], shifts, 'ko', NOW);
    expect(p.shift.slice(0, 5)).toEqual([1, 2, -1, 0, -1]);
    expect(p.shifts).toEqual([{ s: '초', c: '#111111' }, { s: '말', c: '#222222' }, { s: '비', c: '#333333' }]);
  });

  it('다른 언어로 문구와 날짜를 만든다', () => {
    const p = buildWidgetPayload([rec('a', new Date(2026, 10, 10, 15, 0))], null, 'en', NOW);
    expect(p.months[0].title).toBe('November 2026');
    expect(p.items[0].when).toBe('Nov 10 3:00 PM');
    expect(p.str.next).toBe('Next');
    expect(p.str.more).toBe('+{n} more');
  });
});

describe('shortShiftLabels', () => {
  it('첫 글자, 겹치면 모두 두 글자', () => {
    expect(shortShiftLabels(['초번', '말번', '비번'])).toEqual(['초', '말', '비']);
    expect(shortShiftLabels(['휴무', '휴가', '주간'])).toEqual(['휴무', '휴가', '주간']);
    expect(shortShiftLabels(['Day', 'Night'])).toEqual(['D', 'N']);
  });
});

describe('shortDateFor', () => {
  it('언어별 짧은 날짜', () => {
    const d = new Date(2026, 10, 10);
    expect(shortDateFor(d, 'ko')).toBe('11/10');
    expect(shortDateFor(d, 'de')).toBe('10.11.');
    expect(shortDateFor(d, 'fr')).toBe('10/11');
  });
});

describe('parseWidgetUrl', () => {
  it('위젯 링크 세 가지와 다른 링크', () => {
    expect(parseWidgetUrl('mallo://widget?a=mic')).toEqual({ kind: 'mic' });
    expect(parseWidgetUrl('mallo://widget?id=abc%2F1')).toEqual({ kind: 'record', id: 'abc/1' });
    expect(parseWidgetUrl('mallo://widget?d=2026-11-10')).toEqual({ kind: 'day', date: new Date(2026, 10, 10) });
    expect(parseWidgetUrl('mallo://widget?d=bad')).toBeNull();
    expect(parseWidgetUrl('mallo://share-shifts?v=1')).toBeNull();
    expect(parseWidgetUrl('mallo://widget?id=%E0%A4%A')).toBeNull();
  });
});
