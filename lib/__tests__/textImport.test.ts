// 붙인 글·사진에서 읽은 글 → 파서 → 미리보기 값
import { buildImportPreview, normalizeForParse } from '../textImport';
import { setCurrentLang, type Lang } from '../i18n/lang';

const BASE = new Date(2026, 10, 22, 10, 0); // 2026-11-22(일) 10:00
const at = (lang: Lang, s: string) => { setCurrentLang(lang); return buildImportPreview(s, BASE, lang); };
afterAll(() => setCurrentLang('ko'));

const ymdhm = (d: Date | null) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];

describe('한국어', () => {
  test('"11/25 오후 2시 치과 예약"', () => {
    const p = at('ko', '11/25 오후 2시 치과 예약')!;
    expect(ymdhm(p.date)).toEqual([2026, 11, 25, 14, 0]);
    expect([p.hasDate, p.hasTime]).toEqual([true, true]);
    expect(p.content).toBe('치과 예약');
    expect(p.display).toBe('11월 25일 (수) 오후 2:00');
  });
  test('"2026년 12월 3일(목) 14:30 순천향대병원"', () => {
    const p = at('ko', '2026년 12월 3일(목) 14:30 순천향대병원')!;
    expect(ymdhm(p.date)).toEqual([2026, 12, 3, 14, 30]);
    expect(p.content).toBe('순천향대병원');
    expect(p.display).toBe('12월 3일 (목) 오후 2:30');
  });
  test('여러 줄 문자: 날짜·시간은 찾고 원문은 그대로 남긴다', () => {
    const sms = '[순천향대병원] 홍길동님\n2026년 12월 3일(목) 14:30 진료 예약되었습니다.';
    const p = at('ko', sms)!;
    expect(ymdhm(p.date)).toEqual([2026, 12, 3, 14, 30]);
    expect(p.content).toContain('순천향대병원');
    expect(p.content).not.toContain('14');
    expect(p.source).toBe(sms);
  });
  test('적은 꼴의 날짜: 2026.12.03 · 2026-12-03 · 12.3(목)', () => {
    for (const s of ['2026.12.03 14:30 회의', '2026-12-03 오후 2:30 회의', '12.3(목) 14:30 회의']) {
      const p = at('ko', s)!;
      expect(ymdhm(p.date)).toEqual([2026, 12, 3, 14, 30]);
      expect(p.content).toBe('회의');
    }
  });
  test('값 없는 이름표는 내용에서 뺀다', () => {
    const p = at('ko', '예약일시: 2026/12/03 09:00\n장소: 본관 2층')!;
    expect(ymdhm(p.date)).toEqual([2026, 12, 3, 9, 0]);
    expect(p.content).toBe('장소: 본관 2층');
  });
  test('날짜를 못 찾으면 date=null(날짜 미정), 내용은 첫 줄', () => {
    const p = at('ko', '치과 예약 잊지 말기\n보험증 챙기기')!;
    expect(p.date).toBeNull();
    expect([p.hasDate, p.hasTime, p.display]).toEqual([false, false, '']);
    expect(p.content).toBe('치과 예약 잊지 말기');
  });
  test('소수(1.5배)는 날짜로 바꾸지 않는다', () => {
    expect(normalizeForParse('1.5배 할인', 'ko')).toBe('1.5배 할인');
    expect(at('ko', '1.5배 할인 행사')!.date).toBeNull();
  });
  test('빈 글은 null, 긴 내용은 줄인다', () => {
    expect(at('ko', '  \n ')).toBeNull();
    expect(at('ko', '가'.repeat(200))!.content.length).toBeLessThanOrEqual(80);
  });
});

describe('다른 언어', () => {
  test('영어: "Dentist appointment on Nov 25 at 2:30 PM"', () => {
    const p = at('en', 'Dentist appointment on Nov 25 at 2:30 PM')!;
    expect(ymdhm(p.date)).toEqual([2026, 11, 25, 14, 30]);
    expect(p.content).toBe('Dentist appointment');
  });
  test('영어: ISO 날짜와 (Thu)', () => {
    const p = at('en', 'Your appointment: 2026-12-03 14:30 (Thu)')!;
    expect(ymdhm(p.date)).toEqual([2026, 12, 3, 14, 30]);
  });
  test('일본어: "2026年12月3日(木) 14:30 歯医者の予約"', () => {
    const p = at('ja', '2026年12月3日(木) 14:30 歯医者の予約')!;
    expect(ymdhm(p.date)).toEqual([2026, 12, 3, 14, 30]);
    expect(p.content).toBe('歯医者の予約');
  });
  test('독일어·스페인어: ISO 날짜', () => {
    expect(ymdhm(at('de', 'Termin 2026-12-03 14:30 Zahnarzt')!.date)).toEqual([2026, 12, 3, 14, 30]);
    expect(ymdhm(at('es', 'Cita 2026-12-03 14:30 dentista')!.date)).toEqual([2026, 12, 3, 14, 30]);
  });
});

describe('사진에서 읽은 글(OCR)도 같은 흐름', () => {
  test('줄이 끊긴 인식 결과에서도 날짜·시간을 찾는다', () => {
    const ocr = '진료 예약 안내\n예약일\n2026.12.03 (목)\n오후 2:30\n정형외과';
    const p = at('ko', ocr)!;
    expect(ymdhm(p.date)).toEqual([2026, 12, 3, 14, 30]);
  });
});

describe('적은 연도', () => {
  test('내년 연도를 적으면 그 해로', () => {
    expect(ymdhm(at('ko', '2027년 12월 3일 14:30 회의')!.date)).toEqual([2027, 12, 3, 14, 30]);
    expect(ymdhm(at('ko', '2027.01.05 09:00 검진')!.date)).toEqual([2027, 1, 5, 9, 0]);
    expect(ymdhm(at('en', 'Meeting Dec 3, 2027 at 2pm')!.date)).toEqual([2027, 12, 3, 14, 0]);
    expect(ymdhm(at('de', 'Zahnarzt am 03.12.2027 um 14:30')!.date)).toEqual([2027, 12, 3, 14, 30]);
  });
  test('올해를 적으면 그대로, 연도가 없으면 다음에 오는 날', () => {
    expect(ymdhm(at('ko', '2026년 12월 3일 회의')!.date)?.slice(0, 3)).toEqual([2026, 12, 3]);
    expect(ymdhm(at('ko', '1월 5일 검진')!.date)?.slice(0, 3)).toEqual([2027, 1, 5]);
  });
});
