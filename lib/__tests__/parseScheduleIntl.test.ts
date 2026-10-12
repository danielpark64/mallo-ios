// 다국어(ja·zh-Hans·zh-Hant·es·fr·de·pt) 자연어 → 일정 파서 + 날짜·미리 알림 포맷 회귀 테스트
// 기준 시각 고정: 2026-06-06(토) 17:00 (영어 테스트와 동일)
import { parseSchedule } from '../parseSchedule';
import { parseScheduleIntl, formatDisplayIntl } from '../parseScheduleIntl';
import { setCurrentLang, type Lang } from '../i18n/lang';
import { formatTime, formatDayHeader, formatMonthLabel, formatWeekLabel, weekdayLabels } from '../dateUtils';
import { remindLabel, remindBody } from '../reminders';

const base = new Date(2026, 5, 6, 17, 0, 0);

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

type Expect = { at: string | null; hasTime?: boolean; content?: string; remind?: number[]; display?: string };

afterAll(() => setCurrentLang('ko'));

function runCases(lang: Lang, cases: Array<[string, Expect]>) {
  describe(`${lang} 파서`, () => {
    beforeAll(() => setCurrentLang(lang));
    test.each(cases)('%s', (input, exp) => {
      const p = parseSchedule(input, base);
      if (exp.at === null) expect(p.date).toBeNull();
      else expect(p.date && fmt(p.date)).toBe(exp.at);
      if (exp.hasTime !== undefined) expect(p.hasTime).toBe(exp.hasTime);
      if (exp.content !== undefined) expect(p.content).toBe(exp.content);
      if (exp.remind !== undefined) expect(p.remindBefore).toEqual(exp.remind);
      else expect(p.remindBefore).toBeUndefined();
      if (exp.display !== undefined) expect(p.display).toBe(exp.display);
    });
  });
}

// ─── 일본어 ───────────────────────────────────────────────────────────────────
runCases('ja', [
  ['明日午後3時に会議',                 { at: '2026-06-07 15:00', hasTime: true, content: '会議', display: '6月7日(日) 15:00' }],
  ['10月15日の午前10時に歯医者',        { at: '2026-10-15 10:00', hasTime: true, content: '歯医者', display: '10月15日(木) 10:00' }],
  ['30分後に薬を飲む',                  { at: '2026-06-06 17:30', hasTime: true, content: '薬を飲む' }],
  ['1時間後に電話',                     { at: '2026-06-06 18:00', hasTime: true, content: '電話' }],
  ['来週の月曜日にランチ',              { at: '2026-06-08 00:00', hasTime: false, content: 'ランチ', display: '6月8日(月)' }],
  ['3時半に電話',                       { at: '2026-06-07 15:30', hasTime: true, content: '電話' }], // 15:30 은 이미 지나 내일
  ['15時に打ち合わせ',                  { at: '2026-06-07 15:00', hasTime: true, content: '打ち合わせ' }],
  ['明後日の正午に昼食',                { at: '2026-06-08 12:00', hasTime: true, content: '昼食' }],
  ['金曜日の夜8時に映画',               { at: '2026-06-12 20:00', hasTime: true, content: '映画' }],
  ['明日の会議、30分前に知らせて',      { at: '2026-06-07 00:00', hasTime: false, content: '会議', remind: [30] }],
  ['前日に教えて 木曜日 歯医者',        { at: '2026-06-11 00:00', hasTime: false, content: '歯医者', remind: [1440] }],
  ['午前九時に出発',                    { at: '2026-06-07 09:00', hasTime: true, content: '出発' }],
  ['買い物リスト',                      { at: null, content: '買い物リスト' }],
]);

// ─── 중국어 간체 ──────────────────────────────────────────────────────────────
runCases('zh-Hans', [
  ['明天下午三点开会',                  { at: '2026-06-07 15:00', hasTime: true, content: '开会', display: '6月7日 周日 15:00' }],
  ['10月15日上午10点看牙医',            { at: '2026-10-15 10:00', hasTime: true, content: '看牙医', display: '10月15日 周四 10:00' }],
  ['30分钟后吃药',                      { at: '2026-06-06 17:30', hasTime: true, content: '吃药' }],
  ['下周三晚上8点看电影',               { at: '2026-06-10 20:00', hasTime: true, content: '看电影' }],
  ['3点半打电话',                       { at: '2026-06-07 15:30', hasTime: true, content: '打电话' }],
  ['十五点开会',                        { at: '2026-06-07 15:00', hasTime: true, content: '开会' }],
  ['后天中午吃饭',                      { at: '2026-06-08 00:00', hasTime: false, content: '中午吃饭', display: '6月8日 周一' }],
  ['提前30分钟提醒我 明天开会',         { at: '2026-06-07 00:00', hasTime: false, content: '开会', remind: [30] }],
  ['一小时前提醒我 周五下午两点报告',   { at: '2026-06-12 14:00', hasTime: true, content: '报告', remind: [60] }],
  ['前一天提醒我 6月20日生日',          { at: '2026-06-20 00:00', hasTime: false, content: '生日', remind: [1440] }],
  ['买牛奶',                            { at: null, content: '买牛奶' }],
]);

// ─── 중국어 번체 ──────────────────────────────────────────────────────────────
runCases('zh-Hant', [
  ['明天下午三點開會',                  { at: '2026-06-07 15:00', hasTime: true, content: '開會', display: '6月7日 週日 15:00' }],
  ['10月15日上午10點看牙醫',            { at: '2026-10-15 10:00', hasTime: true, content: '看牙醫' }],
  ['30分鐘後吃藥',                      { at: '2026-06-06 17:30', hasTime: true, content: '吃藥' }],
  ['下週一午餐',                        { at: '2026-06-08 00:00', hasTime: false, content: '午餐', display: '6月8日 週一' }],
  ['明天3點半打電話',                   { at: '2026-06-07 15:30', hasTime: true, content: '打電話' }],
  ['一小時前提醒我 週五下午兩點報告',   { at: '2026-06-12 14:00', hasTime: true, content: '報告', remind: [60] }],
  ['提前一天提醒我 6月20日生日',        { at: '2026-06-20 00:00', hasTime: false, content: '生日', remind: [1440] }],
]);

// ─── 스페인어 ─────────────────────────────────────────────────────────────────
runCases('es', [
  ['mañana a las tres de la tarde reunión de equipo', { at: '2026-06-07 15:00', hasTime: true, content: 'reunión de equipo', display: 'dom 7 jun · 15:00' }],
  ['el 15 de octubre a las 10 de la mañana dentista', { at: '2026-10-15 10:00', hasTime: true, content: 'dentista', display: 'jue 15 oct · 10:00' }],
  ['en 30 minutos tomar la medicina',           { at: '2026-06-06 17:30', hasTime: true, content: 'tomar la medicina' }],
  ['el viernes por la noche cine',              { at: '2026-06-12 00:00', hasTime: false, content: 'cine', display: 'vie 12 jun' }],
  ['pasado mañana almuerzo',                    { at: '2026-06-08 00:00', hasTime: false, content: 'almuerzo' }],
  ['a las 3 y media llamar a mamá',             { at: '2026-06-07 15:30', hasTime: true, content: 'llamar a mamá' }],
  ['reunión a las 15:30',                       { at: '2026-06-07 15:30', hasTime: true, content: 'reunión' }],
  ['avísame 30 minutos antes reunión mañana a las 15:30', { at: '2026-06-07 15:30', hasTime: true, content: 'reunión', remind: [30] }],
  ['el lunes que viene a las 9 de la mañana médico', { at: '2026-06-08 09:00', hasTime: true, content: 'médico' }],
  ['una hora antes avísame cena el sábado a las 20h', { at: '2026-06-06 20:00', hasTime: true, content: 'cena', remind: [60] }],
  ['un día antes recuérdame cumpleaños el 20 de junio', { at: '2026-06-20 00:00', hasTime: false, content: 'cumpleaños', remind: [1440] }],
  ['comprar leche',                             { at: null, content: 'comprar leche' }],
]);

// ─── 프랑스어 ─────────────────────────────────────────────────────────────────
runCases('fr', [
  ["demain à 15h30 réunion d'équipe",          { at: '2026-06-07 15:30', hasTime: true, content: "réunion d'équipe", display: 'dim. 7 juin · 15:30' }],
  ['le 15 octobre à 10 heures dentiste',        { at: '2026-10-15 10:00', hasTime: true, content: 'dentiste', display: 'jeu. 15 oct. · 10:00' }],
  ['dans 30 minutes prendre les médicaments',   { at: '2026-06-06 17:30', hasTime: true, content: 'prendre les médicaments' }],
  ['vendredi soir cinéma',                      { at: '2026-06-12 00:00', hasTime: false, content: 'cinéma', display: 'ven. 12 juin' }],
  ["trois heures de l'après-midi appeler maman", { at: '2026-06-07 15:00', hasTime: true, content: 'appeler maman' }],
  ['après-demain déjeuner',                     { at: '2026-06-08 00:00', hasTime: false, content: 'déjeuner' }],
  ['à 15 heures réunion',                       { at: '2026-06-07 15:00', hasTime: true, content: 'réunion' }],
  ['préviens-moi une heure avant réunion lundi prochain à 9h', { at: '2026-06-08 09:00', hasTime: true, content: 'réunion', remind: [60] }],
  ['la veille rappelle-moi rendez-vous le 20 juin à midi', { at: '2026-06-20 12:00', hasTime: true, content: 'rendez-vous', remind: [1440] }],
  ['30 minutes avant rappelle-moi dentiste jeudi à 14h', { at: '2026-06-11 14:00', hasTime: true, content: 'dentiste', remind: [30] }],
  ['acheter du lait',                           { at: null, content: 'acheter du lait' }],
]);

// ─── 독일어 ───────────────────────────────────────────────────────────────────
runCases('de', [
  ['morgen um 15 Uhr Teammeeting',              { at: '2026-06-07 15:00', hasTime: true, content: 'Teammeeting', display: 'So., 7. Juni · 15:00' }],
  ['am 15. Oktober um 10 Uhr Zahnarzt',         { at: '2026-10-15 10:00', hasTime: true, content: 'Zahnarzt', display: 'Do., 15. Okt. · 10:00' }],
  ['in 30 Minuten Medikamente nehmen',          { at: '2026-06-06 17:30', hasTime: true, content: 'Medikamente nehmen' }],
  ['halb vier anrufen',                         { at: '2026-06-07 15:30', hasTime: true, content: 'anrufen' }],
  ['Freitag abends Kino',                       { at: '2026-06-12 00:00', hasTime: false, content: 'Kino', display: 'Fr., 12. Juni' }],
  ['übermorgen um 9:30 Besprechung',            { at: '2026-06-08 09:30', hasTime: true, content: 'Besprechung' }],
  ['nächsten Montag um 9 Uhr Arzt',             { at: '2026-06-08 09:00', hasTime: true, content: 'Arzt' }],
  ['am 15.10. um 15 Uhr Meeting',               { at: '2026-10-15 15:00', hasTime: true, content: 'Meeting' }],
  ['30 Minuten vorher erinnern Besprechung übermorgen um 9:30', { at: '2026-06-08 09:30', hasTime: true, content: 'Besprechung', remind: [30] }],
  ['eine Stunde vorher Bescheid geben Zahnarzt Donnerstag um 14 Uhr', { at: '2026-06-11 14:00', hasTime: true, content: 'Zahnarzt', remind: [60] }],
  ['am Vortag erinnern Geburtstag am 20. Juni', { at: '2026-06-20 00:00', hasTime: false, content: 'Geburtstag', remind: [1440] }],
  ['Milch kaufen',                              { at: null, content: 'Milch kaufen' }],
]);

// ─── 포르투갈어 ───────────────────────────────────────────────────────────────
runCases('pt', [
  ['amanhã às três da tarde reunião de equipe', { at: '2026-06-07 15:00', hasTime: true, content: 'reunião de equipe', display: 'dom, 7 de jun · 15:00' }],
  ['dia 15 de outubro às 10 da manhã dentista', { at: '2026-10-15 10:00', hasTime: true, content: 'dentista', display: 'qui, 15 de out · 10:00' }],
  ['daqui a 30 minutos tomar remédio',          { at: '2026-06-06 17:30', hasTime: true, content: 'tomar remédio' }],
  ['sexta à noite cinema',                      { at: '2026-06-12 00:00', hasTime: false, content: 'cinema', display: 'sex, 12 de jun' }],
  ['às 15h30 reunião',                          { at: '2026-06-07 15:30', hasTime: true, content: 'reunião' }],
  ['depois de amanhã almoço',                   { at: '2026-06-08 00:00', hasTime: false, content: 'almoço' }],
  ['3 e meia ligar para a mãe',                 { at: '2026-06-07 15:30', hasTime: true, content: 'ligar para a mãe' }],
  ['me avise 30 minutos antes reunião amanhã às 9h', { at: '2026-06-07 09:00', hasTime: true, content: 'reunião', remind: [30] }],
  ['uma hora antes me lembre dentista quinta às 14h', { at: '2026-06-11 14:00', hasTime: true, content: 'dentista', remind: [60] }],
  ['um dia antes me lembre aniversário no dia 20 de junho', { at: '2026-06-20 00:00', hasTime: false, content: 'aniversário', remind: [1440] }],
  ['comprar leite',                             { at: null, content: 'comprar leite' }],
]);

// ─── 직접 호출 (언어 인자) ────────────────────────────────────────────────────
describe('parseScheduleIntl 직접 호출·formatDisplayIntl', () => {
  test('현재 언어와 무관하게 lang 인자로 동작', () => {
    setCurrentLang('ko');
    const p = parseScheduleIntl('明日午後3時に会議', base, 'ja');
    expect(p.date && fmt(p.date)).toBe('2026-06-07 15:00');
    expect(p.display).toBe('6月7日(日) 15:00');
  });
  test('formatDisplayIntl 언어별 표기', () => {
    const d = new Date(2026, 9, 15, 15, 0);
    expect(formatDisplayIntl(d, true, true, 'ja')).toBe('10月15日(木) 15:00');
    expect(formatDisplayIntl(d, true, true, 'zh-Hans')).toBe('10月15日 周四 15:00');
    expect(formatDisplayIntl(d, true, true, 'zh-Hant')).toBe('10月15日 週四 15:00');
    expect(formatDisplayIntl(d, true, true, 'es')).toBe('jue 15 oct · 15:00');
    expect(formatDisplayIntl(d, true, true, 'fr')).toBe('jeu. 15 oct. · 15:00');
    expect(formatDisplayIntl(d, true, true, 'de')).toBe('Do., 15. Okt. · 15:00');
    expect(formatDisplayIntl(d, true, true, 'pt')).toBe('qui, 15 de out · 15:00');
    expect(formatDisplayIntl(d, true, false, 'de')).toBe('Do., 15. Okt.');
    expect(formatDisplayIntl(d, false, true, 'pt')).toBe('15:00');
  });
});

// ─── dateUtils 포맷 + 미리 알림 라벨 (언어별 1개씩) ───────────────────────────
describe('dateUtils·reminders 언어별 포맷', () => {
  const d = new Date(2026, 9, 12, 15, 0); // 2026-10-12 (월) 15:00
  const cases: Array<[Lang, { time: string; day: string; month: string; week: string; weekCross: string; wd: string[]; label: string[]; body: string }]> = [
    ['ja', { time: '15:00', day: '10月12日(月)', month: '2026年10月', week: '2026年10月11日 – 17日', weekCross: '2026年9月27日 – 10月3日',
      wd: ['日', '月', '火', '水', '木', '金', '土'], label: ['10分前', '30分前', '1時間前', '前日'], body: '明日 15:00 · 歯医者' }],
    ['zh-Hans', { time: '15:00', day: '10月12日 周一', month: '2026年10月', week: '2026年10月11日 – 17日', weekCross: '2026年9月27日 – 10月3日',
      wd: ['日', '一', '二', '三', '四', '五', '六'], label: ['提前10分钟', '提前30分钟', '提前1小时', '提前1天'], body: '30分钟后 · 牙医' }],
    ['zh-Hant', { time: '15:00', day: '10月12日 週一', month: '2026年10月', week: '2026年10月11日 – 17日', weekCross: '2026年9月27日 – 10月3日',
      wd: ['日', '一', '二', '三', '四', '五', '六'], label: ['提前10分鐘', '提前30分鐘', '提前1小時', '提前1天'], body: '1小時後 · 牙醫' }],
    ['es', { time: '15:00', day: 'lun 12 oct', month: 'octubre de 2026', week: '11 – 17 oct 2026', weekCross: '27 sep – 3 oct 2026',
      wd: ['D', 'L', 'M', 'X', 'J', 'V', 'S'], label: ['10 min antes', '30 min antes', '1 hora antes', 'Un día antes'], body: 'Mañana 15:00 · Dentista' }],
    ['fr', { time: '15:00', day: 'lun. 12 oct.', month: 'octobre 2026', week: '11 – 17 oct. 2026', weekCross: '27 sept. – 3 oct. 2026',
      wd: ['D', 'L', 'M', 'M', 'J', 'V', 'S'], label: ['10 min avant', '30 min avant', '1 heure avant', 'La veille'], body: 'Dans 30 min · Dentiste' }],
    ['de', { time: '15:00', day: 'Mo., 12. Okt.', month: 'Oktober 2026', week: '11. – 17. Okt. 2026', weekCross: '27. Sept. – 3. Okt. 2026',
      wd: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], label: ['10 Min. vorher', '30 Min. vorher', '1 Stunde vorher', 'Am Vortag'], body: 'In 1 Stunde · Zahnarzt' }],
    ['pt', { time: '15:00', day: 'seg, 12 de out', month: 'outubro de 2026', week: '11 – 17 de out de 2026', weekCross: '27 de set – 3 de out de 2026',
      wd: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'], label: ['10 min antes', '30 min antes', '1 hora antes', 'Um dia antes'], body: 'Amanhã 15:00 · Dentista' }],
  ];
  const bodyArg: Record<string, [number, string]> = {
    ja: [1440, '歯医者'], 'zh-Hans': [30, '牙医'], 'zh-Hant': [60, '牙醫'], es: [1440, 'Dentista'], fr: [30, 'Dentiste'], de: [60, 'Zahnarzt'], pt: [1440, 'Dentista'],
  };
  test.each(cases)('%s', (lang, exp) => {
    setCurrentLang(lang);
    expect(formatTime(d)).toBe(exp.time);
    expect(formatTime(new Date(2026, 9, 12, 9, 5))).toBe('9:05');
    expect(formatDayHeader(d)).toBe(exp.day);
    expect(formatMonthLabel(2026, 9)).toBe(exp.month);
    expect(formatWeekLabel(new Date(2026, 9, 11))).toBe(exp.week);
    expect(formatWeekLabel(new Date(2026, 8, 30))).toBe(exp.weekCross);
    expect(weekdayLabels()).toEqual(exp.wd);
    expect([10, 30, 60, 1440].map(remindLabel)).toEqual(exp.label);
    const [m, c] = bodyArg[lang];
    expect(remindBody(m, c, d)).toBe(exp.body);
  });
  test('해가 바뀌는 주 라벨', () => {
    setCurrentLang('ja');
    expect(formatWeekLabel(new Date(2026, 11, 30))).toBe('2026年12月27日 – 2027年1月2日');
    setCurrentLang('es');
    expect(formatWeekLabel(new Date(2026, 11, 30))).toBe('27 dic 2026 – 2 ene 2027');
    setCurrentLang('de');
    expect(formatWeekLabel(new Date(2026, 11, 30))).toBe('27. Dez. 2026 – 2. Jan. 2027');
    setCurrentLang('pt');
    expect(formatWeekLabel(new Date(2026, 11, 30))).toBe('27 de dez de 2026 – 2 de jan de 2027');
  });
});
