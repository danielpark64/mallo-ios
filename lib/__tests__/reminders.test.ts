// 미리 알림: 울릴 시각, 문구, 식별자, 말로 한 요청 추출
import { extractRemindBefore, normalizeRemind, parsePreRecordId, preRecordId, remindBody, remindFireAt, remindLabel } from '../reminders';
import { parseSchedule } from '../parseSchedule';

describe('remindFireAt / remindBody / 라벨', () => {
  const at = new Date(2026, 9, 13, 15, 0); // 10/13 15:00
  test('분 단위는 그만큼 앞, 하루 전은 전날 저녁 8시', () => {
    expect(remindFireAt(at, 30).getTime()).toBe(at.getTime() - 30 * 60_000);
    expect(remindFireAt(at, 60).getTime()).toBe(at.getTime() - 60 * 60_000);
    const d = remindFireAt(at, 1440);
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([9, 12, 20, 0]);
  });
  test('문구', () => {
    expect(remindBody(30, '치과 예약', at)).toBe('30분 뒤 · 치과 예약');
    expect(remindBody(60, '치과 예약', at)).toBe('1시간 뒤 · 치과 예약');
    expect(remindBody(1440, '치과 예약', at)).toBe('내일 오후 3:00 · 치과 예약');
    expect([10, 30, 60, 1440].map(remindLabel)).toEqual(['10분 전', '30분 전', '1시간 전', '하루 전']);
  });
  test('normalizeRemind: 허용 값만, 중복 제거, 오름차순', () => {
    expect(normalizeRemind([1440, 30, 30, 5, 'x', 60])).toEqual([30, 60, 1440]);
    expect(normalizeRemind(undefined)).toEqual([]);
  });
  test('미리 알림 식별자 왕복', () => {
    expect(preRecordId('abc', 30)).toBe('abc#pre30');
    expect(parsePreRecordId('abc#pre30')).toEqual({ recordId: 'abc', minutes: 30 });
    expect(parsePreRecordId('abc')).toBeNull();
  });
});

describe('extractRemindBefore — 말로 한 미리 알림', () => {
  test('"30분 전에 알려줘" → 30, 문장에서 제거', () => {
    const r = extractRemindBefore('내일 세 시 치과 30분 전에 알려줘');
    expect(r.remindBefore).toEqual([30]);
    expect(r.text).toBe('내일 세 시 치과');
  });
  test('분은 가까운 옵션으로: 15분→10, 20분→30, 50분→60', () => {
    expect(extractRemindBefore('회의 15분 전에 알림').remindBefore).toEqual([10]);
    expect(extractRemindBefore('회의 20분 전에 미리 알려줘').remindBefore).toEqual([30]);
    expect(extractRemindBefore('회의 50분 전에 알려 줘').remindBefore).toEqual([60]);
  });
  test('한 시간 전·하루 전·전날', () => {
    expect(extractRemindBefore('치과 한 시간 전에 알려줘').remindBefore).toEqual([60]);
    expect(extractRemindBefore('치과 하루 전에 알려줘').remindBefore).toEqual([1440]);
    expect(extractRemindBefore('치과 전날 알림').remindBefore).toEqual([1440]);
  });
  test('여러 개 말하면 모두', () => {
    const r = extractRemindBefore('출발 하루 전에 알려주고 30분 전에 알려줘');
    expect(r.remindBefore).toEqual([30, 1440]);
  });
  test('"알려줘" 없이 "N분 전"만 있으면 내용으로 둔다', () => {
    const r = extractRemindBefore('10분 전에 도착해서 기다리기');
    expect(r.remindBefore).toBeNull();
    expect(r.text).toBe('10분 전에 도착해서 기다리기');
  });
});

describe('parseSchedule에 미리 알림이 이어진다', () => {
  const base = new Date(2026, 9, 12, 9, 0);
  test('날짜·시간과 미리 알림을 함께 뽑고 내용에서 둘 다 뺀다', () => {
    const p = parseSchedule('내일 오후 세 시에 치과 예약 30분 전에 알려줘', base);
    expect(p.hasTime).toBe(true);
    expect(p.date?.getHours()).toBe(15);
    expect(p.remindBefore).toEqual([30]);
    expect(p.content).toBe('치과 예약');
  });
  test('말하지 않으면 remindBefore 없음', () => {
    expect(parseSchedule('내일 오후 세 시에 치과 예약', base).remindBefore).toBeUndefined();
  });
});

describe('영어 라벨 (언어 설정 en)', () => {
  const { setCurrentLang } = require('../i18n');
  beforeAll(() => setCurrentLang('en'));
  afterAll(() => setCurrentLang('ko'));
  test('remindLabel / remindBody', () => {
    const at = new Date(2026, 9, 12, 15, 0);
    expect([10, 30, 60, 1440].map(remindLabel)).toEqual(['10 min before', '30 min before', '1 hour before', 'Day before']);
    expect(remindBody(30, 'Dentist', at)).toBe('In 30 min · Dentist');
    expect(remindBody(60, 'Dentist', at)).toBe('In 1 hour · Dentist');
    expect(remindBody(1440, 'Dentist', at)).toBe('Tomorrow 3:00 PM · Dentist');
  });
});
