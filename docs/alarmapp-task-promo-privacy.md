# 교대알람 작업 지시서 — 세이람 소개 배너 + 개인정보처리방침 연동 안내

(세이람 쪽에서 2026-10-18에 한 작업을 교대알람에도 똑같이 적용. 교대알람 채팅에 그대로 붙여 넣어 실행)

---

교대알람(~/Desktop/daniel-project/AlarmApp)에 아래 두 가지를 해 줘. 세이람 쪽은 이미 끝났고(세이람 저장소 aeb13c1, 5e93e56), 교대알람도 같은 방식으로 맞추는 작업이야. 우리 앱은 항상 사용자가 가장 쉽고 단순하게 — 사용자가 따로 누르거나 설정할 것 없이 저절로 되게.

## 1. 홍보 배너에 "세이람" 소개 넣기 — 세이람이 이미 깔려 있으면 숨김 (Android만)

지금 `src/components/Home/PromoBanner.tsx` 슬라이드는 수수뮤직(susu)·개발자 응원하기(coffee) 2장. 여기에 세이람 소개를 넣는다.

- 슬라이드: key `sayram`, 아이콘 🎙️, 제목 "말로 하는 일정·알람, 세이람", 부제 "말하면 일정이 되는 앱 보러 가기", 누르면 `https://play.google.com/store/apps/details?id=com.danielpark.sayram`. 순서는 susu → sayram → coffee.
- **보이는 조건**: Android + 한국어 화면 + **세이람이 이 폰에 안 깔려 있을 때만**. iOS에서는 넣지 않는다(Play 주소라서. App Store 출시 후 다시 정함).
- **설치 확인**: 이미 있는 `modules/alarmapp-share` 네이티브 모듈에 함수 하나 추가. 매니페스트 `<queries>`에 `com.danielpark.sayram`이 이미 있어서 권한 추가 필요 없음(QUERY_ALL_PACKAGES 아님).
  ```kotlin
  // 매니페스트 <queries>에 적힌 앱만 보인다(세이람). 다른 앱 목록을 훑지 않는다
  Function("isInstalled") { pkg: String ->
    if (!pkg.matches(Regex("^com\\.danielpark\\.[a-z]+$"))) return@Function false
    try {
      context.packageManager.getPackageInfo(pkg, 0)
      true
    } catch (_: Exception) {
      false
    }
  }
  ```
- JS(`src/utils/sayramShareNative.ts`): Native 타입에 `isInstalled?(pkg: string): boolean` 추가, `export function sayramInstalled(): boolean { try { return !!native?.isInstalled?.('com.danielpark.sayram'); } catch { return false; } }` — iOS·모듈 없음·예외는 false.
- PromoBanner: 슬라이드 계산을 `useMemo(() => makeSlides(..., { hasSayram: sayramInstalled() }), [lang, active])` 식으로 — **앱으로 돌아올 때(AppState active)마다 한 번 다시 확인**(세이람을 새로 깔거나 지우고 돌아오면 바로 반영). 백그라운드 타이머·폴링은 만들지 않는다. 배너에 AppState active 상태가 없으면 추가(세이람 PromoBanner와 같은 방식). 슬라이드 수가 2↔3으로 바뀌어도 무한 회전(extended 배열·점 위치)이 처음으로 되돌아가는지 확인.
- 새 문구 2개는 교대알람 번역 사전(9개 언어 쓰는 방식 그대로)에 추가. 한국어 화면에서만 보이지만 번역 누락 검사가 있으면 통과하게.
- 단위 테스트: 세이람 없음 → susu·sayram·coffee 3장 / 세이람 있음 → susu·coffee 2장 / iOS → sayram 없음.
- ⚠️ **출시 순서**: 이 배너가 든 교대알람 버전은 **세이람이 Play에 공개된 뒤**에 공개되게 할 것(먼저 나가면 링크가 "앱을 찾을 수 없음"). 세이람과 같이 올릴 예정이면, 세이람 공개를 확인한 다음 교대알람 출시 버튼을 누른다.

## 2. 개인정보처리방침(docs/privacy.html, 한글+영문 #en)에 세이람 연동 안내

최종 수정일을 작업한 날짜로 바꾸고, 한글·영문 양쪽에 같은 내용을 넣는다. "3. 외부 서비스 이용" 다음에 새 장 "4. 세이람 연동(기기 안 공유)"을 넣고 뒤 장 번호를 하나씩 민다(영문도 같게).

한글:
> 같은 기기에 같은 개발자의 앱 "세이람"이 설치되어 있고, 두 앱 중 어느 한쪽 설정에서 일정 공유를 켜면, 두 앱은 인터넷을 거치지 않고 **기기 안에서만** 정보를 주고받아 각자의 달력에 함께 보여 줍니다. 교대알람은 근무표(날짜별 근무 이름·색)를 세이람에 보여 주고, 세이람의 일정(날짜·시간·일정 이름)을 받아 달력에 표시합니다. 이 두 앱 말고는 다른 앱이 이 정보를 읽을 수 없습니다. 공유를 멈추려면 두 앱 모두에서 공유를 끄면 됩니다. (현재 Android에서 제공)
>
> 앱 안의 홍보 배너는 세이람이 이미 설치되어 있는지 기기 안에서만 확인하여, 설치되어 있으면 세이람 소개를 보여 주지 않습니다. 이 확인 결과는 어디로도 보내지 않습니다.

영문:
> If the same developer's app SayRam (세이람) is installed on the same device and schedule sharing is turned on in either app, the two apps exchange information **only inside the device**, without using the internet, and show it on each other's calendar. RotaWake shares its shift roster (shift name and color for each date) with SayRam, and receives SayRam's schedules (date, time and title) to show on its calendar. No other app can read this information. To stop sharing, turn it off in both apps. (Currently available on Android.)
>
> The in-app promotional banner checks only on the device whether SayRam is already installed; if it is, the banner does not show the SayRam introduction. This result is never sent anywhere.

- 실제 교대알람 설정 화면의 스위치 이름이 있으면 괄호로 넣어 줘(예: 설정 → "세이람과 일정 공유").
- 방침에 홍보 배너 장이 없다면, 배너 문단은 이 4장 안에 그대로 두면 된다.
- 공개 페이지(GitHub Pages)에 반영되는 건 main에 푸시할 때 — 푸시 전에 바뀐 문장을 보여 주고 확인받기.

## 마무리

- verify-fix(수정 검증)와 교대알람 알람 테스트 스위트를 평소처럼 돌리고, 32(교대알람·세이람 둘 다 깔림)에서 배너가 susu·coffee 2장만 도는지 확인. 세이람을 잠깐 지울 수는 없으니 "세이람 없음" 경우는 단위 테스트로 확인.
- 커밋·푸시 전에 물어보기.
