// 홍보 배너(광고 칸) 슬라이드: 계좌 후원·교대알람 안내는 한국어 화면에서만
import { promoSlides, SUPPORT_ACCOUNT } from '../promo';
import { EN } from '../i18n/en';

test('한국어 Android: 수수뮤직·교대알람·개발자 응원 3장', () => {
  expect(promoSlides('ko', 'android').map((s) => s.key)).toEqual(['susu', 'alarmapp', 'coffee']);
});
test('한국어 iOS: 교대알람(Play 스토어 주소)은 빼고 2장', () => {
  expect(promoSlides('ko', 'ios').map((s) => s.key)).toEqual(['susu', 'coffee']);
});
test('다른 언어: 한국 계좌 후원은 쓸 수 없으므로 채널 안내 1장만', () => {
  for (const lang of ['en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt'] as const) {
    expect(promoSlides(lang, 'android').map((s) => s.key)).toEqual(['susu']);
  }
});
test('주소가 없는 슬라이드는 후원 화면을 여는 것 하나뿐이고, 계좌 정보가 채워져 있다', () => {
  const noUrl = promoSlides('ko', 'android').filter((s) => !s.url);
  expect(noUrl.map((s) => s.key)).toEqual(['coffee']);
  expect(SUPPORT_ACCOUNT.number).toMatch(/^\d{8,}$/);
});
test('슬라이드 문구는 모두 번역 사전에 있다', () => {
  for (const s of promoSlides('ko', 'android')) {
    expect(EN[s.title]).toBeTruthy();
    expect(EN[s.sub]).toBeTruthy();
  }
});
