// 스토어 세이람 페이지 열기 — [업데이트] 버튼 공용(1.2.2 받은 링크의 '업데이트가 필요해요', 1.2.3 '새 버전이 있어요').
// 두 안내가 같은 함수를 쓴다(본부/규칙/업데이트-안내.md "같은 버튼·같은 스토어 이동 코드"). 주소는 lib/appInfo.ts.
// Android는 Play 웹 주소를 먼저 연다 — Play 스토어 앱이 이 주소를 바로 받는다. market://는 삼성 폰에서
// 원스토어·갤럭시 스토어·Play를 고르는 창이 떠서(11-24 기기 확인) 웹 주소가 안 열릴 때만 쓴다. (교대알람 utils/storeLink.ts와 같다)
import { Linking, Platform } from 'react-native';
import { STORE_ANDROID, STORE_ANDROID_WEB, STORE_IOS } from './appInfo';

export function openStore(): void {
  if (Platform.OS === 'ios') { Linking.openURL(STORE_IOS).catch(() => {}); return; }
  Linking.openURL(STORE_ANDROID_WEB).catch(() => Linking.openURL(STORE_ANDROID).catch(() => {}));
}
