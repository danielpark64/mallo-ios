// 일정 보내기: 링크 만들기·읽기 왕복, 형식 검사(깨진 링크·옛 버전·너무 긴 링크·이상한 날짜),
// 같은 id 다시 받기(새 t·옛 t), 말로 보내기 파싱(9개 언어)
import {
  MAX_LINK,
  MAX_PAYLOAD,
  SHARE_PAGE_URL,
  LEGACY_SHARE_PAGE_URL,
  applySharedUpdate,
  classifyPayload,
  buildShareLink,
  canArmShared,
  decodePayload,
  encodePayload,
  fromBase64Url,
  isPastShared,
  messengerText,
  parseReceiveUrl,
  receiveDecision,
  receivedLabel,
  recordFromShared,
  smsText,
  toBase64Url,
  type SharedSchedule,
} from '../sendSchedule';
import { extractSendIntent } from '../parseSendIntent';
import { parseSchedule } from '../parseSchedule';
import { setCurrentLang, type Lang } from '../i18n/lang';
import type { ScheduleRecord } from '../storage';

const NOW = new Date(2026, 10, 22, 10, 0).getTime(); // 2026-11-22 10:00
const base = (over: Partial<ScheduleRecord> = {}): ScheduleRecord => ({
  id: '1763776000000', uri: 'file:///rec.m4a', durationSec: 3, transcript: '내일 3시 엄마 병원 원문',
  content: '엄마 병원', scheduleAt: new Date(2026, 10, 25, 15, 0).getTime(), scheduleDisplay: '',
  hasDate: true, hasTime: true, remindBefore: [30, 1440], exactAlarm: true, alarmMode: 'both',
  createdAt: NOW - 1000, ...over,
});
const payloadOf = (link: string) => link.slice(link.indexOf('#') + 1);

afterEach(() => setCurrentLang('ko'));

describe('base64url', () => {
  test('한글·이모지·악센트 왕복', () => {
    for (const s of ['엄마 병원 🏥', 'mamá à l’hôpital', '母の病院', '', 'a', 'ab', 'abc']) {
      expect(fromBase64Url(toBase64Url(s))).toBe(s);
    }
  });
  test('URL에 안전한 글자만', () => {
    expect(toBase64Url('??>>~~엄마')).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  test('깨진 글자는 null', () => {
    expect(fromBase64Url('a')).toBeNull();
    expect(fromBase64Url('ab+/')).toBeNull();
    expect(fromBase64Url('_w')).toBeNull(); // 0xFF 한 바이트 — UTF-8이 아님
  });
});

describe('링크 만들기·읽기 왕복', () => {
  test('내용·시각·미리 알림·정각·이름·id·t가 그대로', () => {
    const { link } = buildShareLink(base(), '아들', NOW);
    expect(link.startsWith(`${SHARE_PAGE_URL}#v1.`)).toBe(true);
    const d = decodePayload(payloadOf(link), NOW)!;
    expect(d).toMatchObject({ id: '1763776000000', content: '엄마 병원', hasTime: true, remindBefore: [30, 1440], exactAlarm: true, from: '아들', t: NOW });
    expect(d.date.getTime()).toBe(new Date(2026, 10, 25, 15, 0).getTime());
  });
  test('목소리·원문·첨부는 보내지 않는다', () => {
    const { link } = buildShareLink(base({ attachments: [{ ref: 'ph:1', kind: 'photo', name: 'a.jpg', addedAt: 1 }] }), '', NOW);
    const json = fromBase64Url(payloadOf(link).slice(3))!;
    expect(json).not.toMatch(/rec\.m4a|원문|ph:1|a\.jpg/);
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(['c', 'd', 'h', 'i', 'r', 't']);
  });
  test('알람 소리는 보내지 않고, 받은 일정은 받는 사람의 기본 소리(필드 없음)', () => {
    const { link } = buildShareLink(base({ alarmSound: 'marimba' }), '', NOW);
    const json = fromBase64Url(payloadOf(link).slice(3))!;
    expect(json).not.toMatch(/marimba/);
    const d = decodePayload(payloadOf(link), NOW)!;
    expect(recordFromShared(d, 'n9', true, NOW).alarmSound).toBeUndefined();
  });
  test('시간 미정·기간 일정·정각 끔·이름 없음', () => {
    const r = base({ hasTime: false, scheduleAt: new Date(2026, 11, 20).getTime(), endAt: new Date(2026, 11, 24).getTime(), exactAlarm: false, remindBefore: [] });
    const d = decodePayload(payloadOf(buildShareLink(r, '  ', NOW).link), NOW)!;
    expect(d.hasTime).toBe(false);
    expect(d.endDate!.getTime()).toBe(new Date(2026, 11, 24).getTime());
    expect(d.exactAlarm).toBe(false);
    expect(d.from).toBeUndefined();
  });
  test('받은 일정을 다시 보내면 처음 id를 이어 쓴다', () => {
    const r = base({ id: 'local9', received: { id: 'orig1', t: NOW - 5, at: NOW - 4 } });
    expect(decodePayload(payloadOf(buildShareLink(r, '', NOW).link), NOW)!.id).toBe('orig1');
  });
  test('mallo://receive?d= 로도 읽는다(안내 페이지가 여는 주소)', () => {
    const { link } = buildShareLink(base(), '아들', NOW);
    const p = payloadOf(link);
    expect(parseReceiveUrl(`mallo://receive?d=${p}`, NOW)).toMatchObject({ ok: true, data: { content: '엄마 병원' } });
    expect(parseReceiveUrl(`mallo://receive?d=${encodeURIComponent(p)}`, NOW)).toMatchObject({ ok: true });
    expect(parseReceiveUrl(link, NOW)).toMatchObject({ ok: true });
  });
  test('페이로드 뒤 꼬리(?utm·&x·마침표)와 %23으로 바뀐 #도 읽는다', () => {
    const { link } = buildShareLink(base(), '아들', NOW);
    expect(parseReceiveUrl(`${link}?utm=1`, NOW)).toMatchObject({ ok: true });
    expect(parseReceiveUrl(`${link}&x=1`, NOW)).toMatchObject({ ok: true });
    expect(parseReceiveUrl(`${link}.`, NOW)).toMatchObject({ ok: true });
    expect(parseReceiveUrl(link.replace('#', '%23'), NOW)).toMatchObject({ ok: true });
  });
  test('받기 주소가 아니면 null(다른 링크 처리로 넘긴다)', () => {
    expect(parseReceiveUrl('mallo://import-shifts?v=1&p=x', NOW)).toBeNull();
    expect(parseReceiveUrl('mallo://widget/mic', NOW)).toBeNull();
    expect(parseReceiveUrl('https://example.com/#v1.abc', NOW)).toBeNull();
  });
});

describe('받기 주소 — 새 주소·옛 주소·mallo://', () => {
  const p = () => payloadOf(buildShareLink(base(), '아들', NOW).link);
  test('보내는 링크는 새 주소', () => {
    expect(SHARE_PAGE_URL).toBe('https://danielpark64.github.io/sayram/s/');
    expect(buildShareLink(base(), '', NOW).link.startsWith('https://danielpark64.github.io/sayram/s/#v1.')).toBe(true);
  });
  test('세 주소 모두 같은 일정으로 읽는다', () => {
    for (const u of [
      `https://danielpark64.github.io/sayram/s/#${p()}`,
      `${LEGACY_SHARE_PAGE_URL}#${p()}`,
      `https://sayram-app.github.io/s/#${p()}`,
      `mallo://receive?d=${p()}`,
    ]) expect(parseReceiveUrl(u, NOW)).toMatchObject({ ok: true, data: { content: '엄마 병원', from: '아들' } });
  });
  test('index.html·슬래시 없음·메신저가 붙인 ?꼬리도 읽는다', () => {
    expect(parseReceiveUrl(`https://danielpark64.github.io/sayram/s/index.html#${p()}`, NOW)).toMatchObject({ ok: true });
    expect(parseReceiveUrl(`https://danielpark64.github.io/sayram/s#${p()}`, NOW)).toMatchObject({ ok: true });
    expect(parseReceiveUrl(`https://danielpark64.github.io/sayram/s/?fbclid=abc#${p()}`, NOW)).toMatchObject({ ok: true });
    expect(parseReceiveUrl(`https://sayram-app.github.io/s/?x=1#${p()}`, NOW)).toMatchObject({ ok: true });
  });
  test('같은 도메인의 다른 길·다른 앱 주소는 받기 주소가 아니다(null)', () => {
    expect(parseReceiveUrl(`https://danielpark64.github.io/alarmapp/s/#${p()}`, NOW)).toBeNull();
    expect(parseReceiveUrl(`https://danielpark64.github.io/sayram/#${p()}`, NOW)).toBeNull();
    expect(parseReceiveUrl(`https://danielpark64.github.io/sayram/s/`, NOW)).toBeNull();
    expect(parseReceiveUrl(`https://evil.example/danielpark64.github.io/sayram/s/#${p()}`, NOW)).toBeNull();
    expect(parseReceiveUrl(`https://danielpark64.github.io.evil.example/sayram/s/#${p()}`, NOW)).toBeNull();
  });
  test('새 주소의 깨진 링크는 { ok: false }', () => {
    expect(parseReceiveUrl('https://danielpark64.github.io/sayram/s/#v1.@@@', NOW)).toEqual({ ok: false });
    expect(parseReceiveUrl('https://danielpark64.github.io/sayram/s/#', NOW)).toEqual({ ok: false });
  });
});

describe('더 새 형식 — 업데이트가 필요해요', () => {
  const body = toBase64Url(JSON.stringify({ i: 'a1', c: '병원', d: '2026-11-25', h: 900, t: NOW }));
  test('v2·v10 은 깨진 링크가 아니라 업데이트 필요', () => {
    expect(classifyPayload(`v2.${body}`, NOW)).toEqual({ ok: false, needsUpdate: true });
    expect(classifyPayload('v10.아무거나~모양', NOW)).toEqual({ ok: false, needsUpdate: true });
    expect(parseReceiveUrl(`mallo://receive?d=v2.${body}`, NOW)).toEqual({ ok: false, needsUpdate: true });
    expect(parseReceiveUrl(`https://danielpark64.github.io/sayram/s/#v2.${body}`, NOW)).toEqual({ ok: false, needsUpdate: true });
    expect(parseReceiveUrl(`https://sayram-app.github.io/s/#v3.${body}`, NOW)).toEqual({ ok: false, needsUpdate: true });
  });
  test('v1 은 지금처럼 일정, 깨진 것·옛 번호·번호 없음은 깨진 링크', () => {
    expect(classifyPayload(`v1.${body}`, NOW)).toMatchObject({ ok: true });
    expect(classifyPayload('v1.@@@', NOW)).toEqual({ ok: false });
    expect(classifyPayload(`v0.${body}`, NOW)).toEqual({ ok: false });
    expect(classifyPayload(body, NOW)).toEqual({ ok: false });
    expect(classifyPayload('v2.', NOW)).toEqual({ ok: false });
    expect(classifyPayload('vx.abc', NOW)).toEqual({ ok: false });
    expect(classifyPayload('v2.' + 'A'.repeat(9000), NOW)).toEqual({ ok: false });
  });
});

describe('너무 긴 내용·링크', () => {
  test('긴 내용은 잘라 넣고 링크는 상한 안', () => {
    const long = '가'.repeat(2000);
    const { link, payload } = buildShareLink(base({ content: long }), '이름'.repeat(30), NOW);
    expect(link.length).toBeLessThanOrEqual(MAX_LINK);
    expect(payload.c.endsWith('…')).toBe(true);
    expect([...payload.n!].length).toBeLessThanOrEqual(20);
    expect(decodePayload(payloadOf(link), NOW)).not.toBeNull();
  });
  test('너무 긴 페이로드는 읽지 않는다', () => {
    expect(decodePayload('v1.' + 'A'.repeat(MAX_PAYLOAD + 10), NOW)).toBeNull();
  });
});

describe('형식 검사 — 깨진 링크는 거절', () => {
  const enc = (o: object) => 'v1.' + toBase64Url(JSON.stringify(o));
  const ok = { i: 'a1', c: '병원', d: '2026-11-25', h: 900, t: NOW };
  test('정상', () => expect(decodePayload(enc(ok), NOW)).not.toBeNull());
  test('옛 버전·새 버전·버전 없음', () => {
    expect(decodePayload('v0.' + enc(ok).slice(3), NOW)).toBeNull();
    expect(decodePayload('v2.' + enc(ok).slice(3), NOW)).toBeNull();
    expect(decodePayload(enc(ok).slice(3), NOW)).toBeNull();
  });
  test('깨진 글·JSON 아님', () => {
    expect(decodePayload('v1.@@@', NOW)).toBeNull();
    expect(decodePayload('v1.' + toBase64Url('{깨짐'), NOW)).toBeNull();
    expect(decodePayload('v1.' + toBase64Url('[1,2]'), NOW)).toBeNull();
    expect(parseReceiveUrl('mallo://receive?d=v1.%E0%A4%A', NOW)).toEqual({ ok: false });
    expect(parseReceiveUrl('mallo://receive?x=1', NOW)).toEqual({ ok: false });
  });
  test('필수 필드 빠짐', () => {
    for (const k of ['i', 'c', 'd', 't']) {
      const o: any = { ...ok };
      delete o[k];
      expect(decodePayload(enc(o), NOW)).toBeNull();
    }
    expect(decodePayload(enc({ ...ok, c: '   ' }), NOW)).toBeNull();
  });
  test('이상한 날짜·시각', () => {
    expect(decodePayload(enc({ ...ok, d: '2026-02-30' }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, d: '2026-13-01' }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, d: '9999-01-01' }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, d: '2020-01-01' }), NOW)).toBeNull(); // 1년 넘게 지난 날
    expect(decodePayload(enc({ ...ok, d: '26-11-25' }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, h: 1440 }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, h: 9.5 }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, e: '2026-11-24' }), NOW)).toBeNull(); // 끝이 시작보다 앞
    expect(decodePayload(enc({ ...ok, e: '2028-11-24' }), NOW)).toBeNull(); // 너무 긴 기간
    expect(decodePayload(enc({ ...ok, t: NOW + 3 * 86_400_000 }), NOW)).toBeNull(); // 미래에 만든 링크
    expect(decodePayload(enc({ ...ok, t: 1000 }), NOW)).toBeNull();
  });
  test('문자열 길이·형식', () => {
    expect(decodePayload(enc({ ...ok, c: '가'.repeat(500) }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, n: '이'.repeat(50) }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, i: '<script>' }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, i: 'x'.repeat(41) }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, r: 'abc' }), NOW)).toBeNull();
    expect(decodePayload(enc({ ...ok, x: 1 }), NOW)).toBeNull();
  });
  test('모르는 미리 알림 값은 버린다', () => {
    expect(decodePayload(enc({ ...ok, r: [30, 7, 1440, 30] }), NOW)!.remindBefore).toEqual([30, 1440]);
  });
});

describe('같은 id를 다시 받기', () => {
  const shared = (t: number, over: Partial<SharedSchedule> = {}): SharedSchedule => ({
    id: 'orig1', content: '엄마 병원', date: new Date(2026, 10, 25, 15, 0), hasTime: true,
    remindBefore: [30], exactAlarm: true, from: '아들', t, ...over,
  });
  const have = recordFromShared(shared(NOW - 100), 'local1', true, NOW);
  test('처음이면 new', () => expect(receiveDecision(shared(NOW), []).kind).toBe('new'));
  test('새 t면 update(바꿀까요?)', () => expect(receiveDecision(shared(NOW), [have])).toMatchObject({ kind: 'update', existing: { id: 'local1' } }));
  test('내가 보낸 일정이 되돌아오면 own(저장 안 함)', () => {
    const mine = { ...recordFromShared(shared(NOW - 100), 'orig1', true, NOW), received: undefined };
    expect(receiveDecision(shared(NOW), [mine])).toMatchObject({ kind: 'own', existing: { id: 'orig1' } });
    expect(receiveDecision(shared(NOW), [have, mine]).kind).toBe('update'); // 받은 기록이 있으면 그쪽이 먼저
  });
  test('같은 t·옛 t면 stale(이미 받은 일정)', () => {
    expect(receiveDecision(shared(NOW - 100), [have]).kind).toBe('stale');
    expect(receiveDecision(shared(NOW - 500), [have]).kind).toBe('stale');
  });
  test('바꾸면 내 id·녹음은 그대로, 내용·시각·받은 표시는 새것', () => {
    const next = applySharedUpdate({ ...have, attachments: [], notifIds: ['x'] }, shared(NOW, { content: '엄마 치과', date: new Date(2026, 10, 26, 10, 0) }), true, NOW);
    expect(next).toMatchObject({ id: 'local1', content: '엄마 치과', received: { id: 'orig1', t: NOW, from: '아들' } });
    expect(next.scheduleAt).toBe(new Date(2026, 10, 26, 10, 0).getTime());
    expect(next.notifIds).toBeUndefined();
  });
});

describe('받은 일정 → 레코드', () => {
  const s: SharedSchedule = { id: 'o', content: '병원', date: new Date(2026, 10, 25, 15, 0), hasTime: true, remindBefore: [30], exactAlarm: true, t: NOW };
  test('알람 켬: 보낸 사람 설정 그대로', () => {
    expect(recordFromShared(s, 'n1', true, NOW)).toMatchObject({ id: 'n1', uri: '', remindBefore: [30], exactAlarm: true, received: { id: 'o', t: NOW } });
  });
  test('알람 끔: 미리 알림·정각 모두 끔', () => {
    expect(recordFromShared(s, 'n1', false, NOW)).toMatchObject({ remindBefore: [], exactAlarm: false });
  });
  test('지난 일정은 알람 토글이 없다', () => {
    const past = { ...s, date: new Date(2026, 10, 1, 9, 0) };
    expect(isPastShared(past, NOW)).toBe(true);
    expect(canArmShared(past, NOW)).toBe(false);
    expect(canArmShared(s, NOW)).toBe(true);
    expect(canArmShared({ ...s, hasTime: false }, NOW)).toBe(false);
    expect(isPastShared({ ...s, hasTime: false, date: new Date(2026, 10, 22) }, NOW)).toBe(false); // 오늘(시간 미정)은 아직
  });
  test('📩 이름표', () => {
    expect(receivedLabel(recordFromShared({ ...s, from: '아들' }, 'a', true, NOW))).toBe('📩 아들');
    expect(receivedLabel(recordFromShared(s, 'a', true, NOW))).toBe('📩 받은 일정');
    expect(receivedLabel(base())).toBeNull();
  });
});

describe('메신저·문자 글', () => {
  const s: SharedSchedule = { id: 'o', content: '엄마 병원', date: new Date(2026, 10, 25, 15, 0), hasTime: true, remindBefore: [], exactAlarm: true, t: NOW };
  test('메신저: 이름이 있으면 "○○에게서 일정이 왔어요"', () => {
    expect(messengerText({ ...s, from: '아들' }, 'L')).toBe('📅 아들에게서 일정이 왔어요\n11월 25일 (수) 오후 3:00\n엄마 병원\n\n눌러서 세이람에 넣기 ▶ L');
  });
  test('메신저: 이름이 없으면 "세이람 일정이 도착했어요"', () => {
    expect(messengerText(s, 'L').split('\n')[0]).toBe('📅 세이람 일정이 도착했어요');
  });
  test('문자는 짧게', () => {
    expect(smsText({ ...s, content: '가'.repeat(100) }, 'L').length).toBeLessThan(60);
  });
  test('encodePayload는 v1. 로 시작', () => {
    expect(encodePayload({ i: 'a', c: 'b', d: '2026-11-25', t: NOW })).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
  });
});

describe('말로 보내기 — 받는 사람 뽑기(9개 언어)', () => {
  const cases: Array<[Lang, string, string, string]> = [
    ['ko', '내일 3시 병원, 엄마한테 보내줘', '엄마', '내일 3시 병원'],
    ['en', 'Hospital tomorrow at 3pm, send it to mom', 'mom', 'Hospital tomorrow at 3pm'],
    ['ja', '明日3時に病院、母に送って', '母', '明日3時に病院'],
    ['zh-Hans', '明天下午三点去医院，发给妈妈', '妈妈', '明天下午三点去医院'],
    ['zh-Hant', '明天下午三點去醫院，發給媽媽', '媽媽', '明天下午三點去醫院'],
    ['es', 'Mañana a las 3 hospital, envíaselo a mamá', 'mamá', 'Mañana a las 3 hospital'],
    ['fr', "Demain à 15h hôpital, envoie-le à maman", 'maman', 'Demain à 15h hôpital'],
    ['de', 'Morgen um 15 Uhr Krankenhaus, schick es an Mama', 'Mama', 'Morgen um 15 Uhr Krankenhaus'],
    ['pt', 'Amanhã às 15h hospital, manda pra mãe', 'mãe', 'Amanhã às 15h hospital'],
  ];
  test.each(cases)('%s: %s', (lang, text, to, rest) => {
    expect(extractSendIntent(text, lang)).toEqual({ sendTo: to, text: rest });
  });

  test.each([
    ['ko', '내일 3시 엄마한테 보내 주세요', '엄마'],
    ['ko', '이거 아빠에게 보내줘', null],           // 남은 일정 말이 없으면 보내기로 보지 않는다
    ['ko', '모레 10시 회의 팀장님께 이거 보내줘.', '팀장님'],
    ['ko', '금요일 저녁 7시 저녁 약속 동생한테도 전해 줘', '동생'],
    ['en', 'Dinner Friday at 7 and send this to John please', 'John'],
    ['en', 'Dentist tomorrow 9am, share it with Mary Jane', 'Mary Jane'],
    ['ja', '明日10時歯医者お母さんに送ってください', 'お母さん'],
    ['de', 'Freitag 19 Uhr Essen, schick es Mama bitte', 'Mama'],
    ['pt', 'Sexta 19h jantar, envia para a minha mãe', 'mãe'],
    ['fr', 'Vendredi 19h dîner, envoie ça à Paul', 'Paul'],
    ['es', 'Viernes 19h cena, mándaselo a mi papá por favor', 'papá'],
    ['zh-Hans', '周五晚上七点吃饭，把这个发给爸爸吧', '爸爸'],
  ] as Array<[Lang, string, string | null]>)('%s: %s → %s', (lang, text, to) => {
    expect(extractSendIntent(text, lang).sendTo).toBe(to);
  });

  test.each([
    ['ko', '내일 3시 팀장님께 메일 보내기'],
    ['ko', '내일 오후 2시 택배 보내기'],
    ['ko', '모레 엄마한테 전화하기'],
    ['ko', '10분 전에 알려줘 내일 3시 회의'],
    ['en', 'Send the report to John tomorrow at 3pm'],
    ['en', 'Tomorrow 3pm send flowers to mom'],
    ['ja', '明日3時に母に荷物を送って'],
    ['zh-Hans', '明天三点把文件发给妈妈'],
    ['es', 'Mañana enviar el informe a Juan'],
    ['fr', 'Demain envoyer le rapport à Paul'],
    ['de', 'Morgen den Bericht an Paul schicken'],
    ['de', 'Morgen 15 Uhr schick den Bericht an Paul'],
    ['pt', 'Amanhã enviar o documento para João'],
  ] as Array<[Lang, string]>)('할 일 자체가 보내기면 건드리지 않는다 — %s: %s', (lang, text) => {
    expect(extractSendIntent(text, lang)).toEqual({ sendTo: null, text });
  });
});

describe('말로 보내기 — 1인칭·목적어·붙은 이름은 보내기가 아니다', () => {
  test.each([
    ['ko', '내일 아침 7시에 약 먹으라고 나한테 알려줘'],
    ['ko', '회의 저한테 알려주세요'],
    ['ko', '내일 3시 회의 나한테 보내줘'],
    ['ko', '내일 3시 병원 저한테 보내 주세요'],
    ['ko', '모레 회의 우리한테 보내줘'],
    ['ko', '모레 회의 저희에게 공유해줘'],
    ['ko', '내일 3시 회의 팀장님께 알려줘'],
    ['ko', '내일 3시 회의 팀장님께 전달해줘'],
    ['ko', '회의 자료 팀장님께 보내줘'],
    ['ko', '내일 3시 보고서를 팀장님께 보내줘'],
    ['ko', '내일 사진 엄마한테 보내줘'],
    ['ko', '내일 3시 병원엄마한테 보내줘'],
    ['en', 'Meeting tomorrow at 3pm, send it to me'],
    ['en', 'Meeting tomorrow at 3pm, send it to myself'],
    ['ja', '資料を部長に送って'],
    ['ja', '明日3時の会議、私に送って'],
    ['ja', '明日3時の会議、自分に送って'],
    ['zh-Hans', '明天三点开会，发给我'],
    ['zh-Hans', '明天三点开会，发给我们'],
    ['zh-Hant', '明天三點開會，發給我'],
    ['es', 'Mañana a las 3 reunión, envíalo a mí'],
    ['fr', 'Demain à 15h réunion, envoie-le à moi'],
    ['de', 'Morgen um 15 Uhr Meeting, schick es mir'],
    ['pt', 'Amanhã às 15h reunião, manda pra mim'],
  ] as Array<[Lang, string]>)('%s: %s → 원문 그대로', (lang, text) => {
    expect(extractSendIntent(text, lang)).toEqual({ sendTo: null, text });
  });
  test.each([
    ['ko', '내일 3시 병원, 엄마한테 공유해줘', '엄마'],
    ['ko', '내일 3시 병원 엄마한테 보내줘', '엄마'],
    ['ko', '내일 3시 병원 엄마한테 전해줘', '엄마'],
  ] as Array<[Lang, string, string]>)('%s: %s → %s', (lang, text, to) => {
    expect(extractSendIntent(text, lang).sendTo).toBe(to);
  });
});

describe('parseSchedule — 받는 사람 구절은 내용에서 빠진다', () => {
  const BASE = new Date(2026, 10, 22, 10, 0);
  test('ko', () => {
    setCurrentLang('ko');
    const p = parseSchedule('내일 3시 병원, 엄마한테 보내줘', BASE);
    expect(p.sendTo).toBe('엄마');
    expect(p.content).toBe('병원');
    expect(p.hasDate && p.hasTime).toBe(true);
    expect(p.date!.getDate()).toBe(23);
  });
  test('en', () => {
    setCurrentLang('en');
    const p = parseSchedule('Hospital tomorrow at 3pm, send it to mom', BASE);
    expect(p.sendTo).toBe('mom');
    expect(p.content.toLowerCase()).toContain('hospital');
    expect(p.content.toLowerCase()).not.toContain('send');
    expect(p.date!.getHours()).toBe(15);
  });
  test.each([
    ['ja', '明日3時に病院、母に送って', '送'],
    ['zh-Hans', '明天下午三点去医院，发给妈妈', '发给'],
    ['es', 'Mañana a las 3 hospital, envíaselo a mamá', 'env'],
    ['fr', 'Demain à 15h hôpital, envoie-le à maman', 'envoie'],
    ['de', 'Morgen um 15 Uhr Krankenhaus, schick es an Mama', 'schick'],
    ['pt', 'Amanhã às 15h hospital, manda pra mãe', 'manda'],
  ] as Array<[Lang, string, string]>)('%s', (lang, text, verb) => {
    setCurrentLang(lang);
    const p = parseSchedule(text, BASE);
    expect(p.sendTo).toBeTruthy();
    expect(p.content).not.toContain(verb);
    expect(p.hasDate).toBe(true);
  });
  test('보내기 말이 없으면 sendTo 없음', () => {
    setCurrentLang('ko');
    expect(parseSchedule('내일 3시 병원', BASE).sendTo).toBeUndefined();
  });
});
