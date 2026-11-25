// 앱에 묶인 값 — 한 곳에만 둔다(1.2.3 새 버전 안내, 받은 링크의 '업데이트가 필요해요' [업데이트]).
// 교대알람 src/constants/appInfo.ts(1.6.3)와 같은 틀 — 값만 세이람 것. 순수 값만 둔다(import 금지, jest에서 그대로 읽는다).

/** iOS 번들 ID — App Store 조회(itunes lookup)에 보내는 유일한 앱 값 */
export const IOS_BUNDLE_ID = 'com.danielpark.sayram';
/** Android 패키지 이름 */
export const ANDROID_PACKAGE = 'com.danielpark.sayram';
/** App Store 앱 페이지 */
export const STORE_IOS = 'https://apps.apple.com/app/id6825225042';
/** Play 웹 주소 — Play 스토어 앱이 바로 받는다(먼저 연다) */
export const STORE_ANDROID_WEB = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
/** Play 스토어 앱으로 직접(웹 주소가 안 열릴 때만 — 삼성 폰에서 스토어 고르기 창이 뜬다) */
export const STORE_ANDROID = `market://details?id=${ANDROID_PACKAGE}`;

/** iOS 새 버전 확인(App Store 공개 조회 itunes lookup) 스위치.
 *  켜져 있으면 앱을 열 때 App Store에 이 앱의 최신 버전 번호만 묻는다 — 보내는 값은 번들 ID와 기기 지역(2글자)뿐.
 *  꺼 두면 iOS에서는 조회(fetch) 자체를 하지 않는다. 개인정보처리방침·App Store 설명 문구와 맞춰서 바꿀 것
 *  (2026-11-25 사용자 결정: 켜고 문구를 "새 버전 확인을 위해 App Store에 버전만 조회합니다"로 고침).
 *  Android는 이 스위치와 상관없이 Play 인앱 업데이트(Play 스토어 앱이 확인, 앱에 INTERNET 권한 없음)를 쓴다. */
export const IOS_UPDATE_CHECK_ENABLED = true;

/** "필수" 판 — 이보다 낮은 판은 [나중에] 없이 [업데이트]만 보인다. 구조만 열어 둔다: 지금은 쓰지 않는다(null).
 *  쓸지·어느 판부터인지는 사용자가 정한다(본부/규칙/업데이트-안내.md). */
export const UPDATE_REQUIRED: { iosMinVersion: string | null; androidMinVersionCode: number | null } = {
  iosMinVersion: null,
  androidMinVersionCode: null,
};
