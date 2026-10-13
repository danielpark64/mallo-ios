// ─── 홍보 배너(광고 칸) 내용 ──────────────────────────────────────────────────
// 일정 목록 맨 아래에 붙는 자체 홍보 배너(components/PromoBanner.tsx)의 슬라이드 목록.
// 교대알람과 같은 방식: 외부 광고 SDK가 아니라 링크·후원 안내만 보여 준다 → 인터넷 권한이 필요 없고
// (링크는 폰의 브라우저/유튜브 앱이 연다) 개인정보를 수집하지 않는다.
// 슬라이드를 바꾸거나 더하려면 이 파일만 고치면 된다. 슬라이드가 2개 이상이면 5초마다 넘어간다.
import { Platform } from 'react-native';
import type { Lang } from './i18n/lang';

export type PromoSlide = {
  key: string;
  icon: string;
  /** 번역 키(한국어 원문) */
  title: string;
  sub: string;
  /** 색조: 보라 / 노랑 / 파랑 */
  tone: 'purple' | 'amber' | 'blue';
  /** 누르면 열 주소. 없으면 후원 화면을 연다 */
  url?: string;
};

/** 후원 계좌 — 교대알람과 같은 계좌 */
export const SUPPORT_ACCOUNT = { bank: '카카오뱅크', number: '3333166925857', holder: '장미향' };

export const ALARMAPP_STORE_URL = 'https://play.google.com/store/apps/details?id=com.danielpark.alarmapp';

/** 언어·플랫폼에 맞는 슬라이드. 계좌 후원과 교대알람 안내는 한국어 화면에서만 보인다. */
export function promoSlides(lang: Lang, os: string = Platform.OS): PromoSlide[] {
  const slides: PromoSlide[] = [
    { key: 'susu', icon: '🎵', title: '수수뮤직과 기분좋은 하루', sub: '채널 바로가기', tone: 'purple', url: 'https://www.youtube.com/@music_susu' },
  ];
  if (lang === 'ko') {
    if (os === 'android') {
      slides.push({ key: 'alarmapp', icon: '⏰', title: '교대근무라면 교대알람', sub: '근무표대로 울리는 알람 앱 보러 가기', tone: 'blue', url: ALARMAPP_STORE_URL });
    }
    slides.push({ key: 'coffee', icon: '☕', title: '개발자 응원하기', sub: '작은 후원으로 응원해주세요', tone: 'amber' });
  }
  return slides;
}
