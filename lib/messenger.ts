// ─── 일정 보내기: 나라(지역)별 메신저 고르기 ──────────────────────────────────────
// 폰의 "지역" 설정으로 정한다(화면 언어가 아니다 — 일본에 사는 한국어 사용자도 LINE을 쓴다).
//   KR → 카카오톡 / JP·TW·TH → LINE / CN → WeChat / US·CA → 문자를 위에, 메신저는 일반(공유 창)
//   그 밖의 나라 → WhatsApp / 나라를 모르면 → "메신저" 일반(공유 창)
// 지역은 expo-localization getLocales()[0].regionCode(iOS 지역 설정·Android 지역 설정에서 온다).
// 순수 함수는 지역을 인자로 받는다 — 테스트에서 나라를 넣어 볼 수 있게.

export type MessengerId = 'kakao' | 'line' | 'wechat' | 'whatsapp' | 'generic';

export type Messenger = {
  id: MessengerId;
  /** Android에서 ACTION_SEND를 바로 보낼 패키지(일반이면 null → 공유 창) */
  androidPkg: string | null;
  /** 이 나라에서 문자를 첫 버튼으로 둘지(미국·캐나다) */
  smsFirst: boolean;
};

export const MESSENGER_PKG: Record<Exclude<MessengerId, 'generic'>, string> = {
  kakao: 'com.kakao.talk',
  line: 'jp.naver.line.android',
  wechat: 'com.tencent.mm',
  whatsapp: 'com.whatsapp',
};

const LINE_REGIONS = new Set(['JP', 'TW', 'TH']);
const SMS_FIRST_REGIONS = new Set(['US', 'CA']);

/** 지역 코드(예: "KR") → 메신저. 모르는 값·빈 값이면 일반 */
export function messengerForRegion(region: string | null | undefined): Messenger {
  const r = typeof region === 'string' ? region.trim().toUpperCase() : '';
  const make = (id: MessengerId, smsFirst = false): Messenger => ({
    id,
    androidPkg: id === 'generic' ? null : MESSENGER_PKG[id],
    smsFirst,
  });
  if (!/^[A-Z]{2}$/.test(r)) return make('generic');
  if (r === 'KR') return make('kakao');
  if (LINE_REGIONS.has(r)) return make('line');
  if (r === 'CN') return make('wechat');
  if (SMS_FIRST_REGIONS.has(r)) return make('generic', true);
  return make('whatsapp');
}

/** 폰의 지역 코드. 못 읽으면 null(→ 일반 메신저) */
export function deviceRegion(): string | null {
  try {
    // 쓸 때만 불러온다(네이티브 모듈이 없는 환경에서도 앱이 죽지 않게)
    const { getLocales } = require('expo-localization') as typeof import('expo-localization');
    const code = getLocales()[0]?.regionCode;
    return typeof code === 'string' && code ? code : null;
  } catch {
    return null;
  }
}

type T = (k: string, p?: Record<string, string | number>) => string;

/** 버튼·안내에 쓸 앱 이름. 카카오톡만 언어별로 부른다(한국어 '카톡') */
export function messengerName(id: MessengerId, t: T): string | null {
  switch (id) {
    case 'kakao': return t('카톡');
    case 'line': return 'LINE';
    case 'wechat': return 'WeChat';
    case 'whatsapp': return 'WhatsApp';
    default: return null;
  }
}

/** 나라 메신저 버튼 이름: '💬 {앱}으로 보내기'(일반이면 null — 버튼을 두지 않고 '다른 앱으로 보내기'만 둔다) */
export function messengerButtonLabel(id: MessengerId, t: T): string | null {
  const name = messengerName(id, t);
  return name ? t('💬 {app}으로 보내기', { app: name }) : null;
}

/** 버튼 아래 안내: 나라 메신저가 있으면 "{앱}은 무료예요"까지, 없으면 문자 요금 안내만 */
export function messengerNote(id: MessengerId, t: T): string {
  const name = messengerName(id, t);
  return name
    ? t('문자는 글이 길면 요금이 나올 수 있어요. {app}은 무료예요', { app: name })
    : t('문자는 글이 길면 요금이 나올 수 있어요');
}

export type SendButton = 'messenger' | 'sms' | 'share';

/**
 * 보내기 시트의 버튼 순서. 첫 번째가 큰 버튼.
 *  - 나라 메신저(카톡·LINE·WeChat·WhatsApp)가 있으면 [메신저, 문자, 다른 앱]
 *  - 없으면(미국·캐나다·모름) 메신저 버튼 없이 [문자, 다른 앱] — 미국·캐나다는 문자가 위, 모르면 '다른 앱'(공유 창)이 위
 *  - 사용자가 마지막에 고른 방식(via)이 있으면 그것을 맨 위로 올린다
 * '다른 앱으로 보내기'(OS 공유 창)는 교대알람 근무표 보내기와 같은 경로로, 어느 나라든 항상 있다.
 */
export function sendButtons(m: Messenger, via: SendButton | 'auto'): SendButton[] {
  const hasApp = m.id !== 'generic';
  const base: SendButton[] = hasApp ? ['messenger', 'sms', 'share'] : m.smsFirst ? ['sms', 'share'] : ['share', 'sms'];
  // 고른 방식이 이 나라에 없는 버튼이면(예: 한국에서 메신저를 고르던 사람이 지역을 미국으로) 공유 창을 위로
  const pick: SendButton | 'auto' = via === 'messenger' && !hasApp ? 'share' : via;
  if (pick === 'auto' || !base.includes(pick)) return base;
  return [pick, ...base.filter((b) => b !== pick)];
}
