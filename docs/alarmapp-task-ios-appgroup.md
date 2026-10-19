# 교대알람 작업 지시서 — 아이폰도 세이람과 자동 공유 (App Group)

(2026-10-19, 세이람 쪽 완료: 세이람 커밋 c3fe6b9. 세이람 채팅이 주도, 교대알람 채팅에 직접 전달)

## 배경
- 애플 유료 개발자 계정이 활성화됨. 팀 ID는 그대로 `T5Z6ACK2PU`(무료 팀이 유료로 올라감) → 빌드 서명 설정은 안 바꿔도 되고, 서명 유효기간이 7일 → 1년.
- 애플 개발자 사이트에 App Group `group.com.danielpark.shared` 등록 완료, 세이람 App ID(com.danielpark.sayram)에 연결 완료.
- **교대알람 App ID(com.danielpark.alarmapp)에도 연결돼 있어야 한다.** 사용자가 했는지 불확실 — 빌드 때 "Provisioning profile ... doesn't match the entitlements file's value for the com.apple.security.application-groups" 오류가 나면 아직 안 된 것. 그때는 사용자에게 안내: developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → (분류 App IDs) com.danielpark.alarmapp → App Groups 체크 → Configure → group.com.danielpark.shared 체크 → Continue → Save → Confirm.
- 사용자 원칙: 시스템 부하 절대 금지, 가장 쉽고 단순하게, 사용자에게 보이는 글·주석·커밋 메시지는 한국어.

## 할 일

1. **app.json** (`expo.ios`)
   - `entitlements`: `"com.apple.security.application-groups": ["group.com.danielpark.shared"]`
   - `infoPlist.LSApplicationQueriesSchemes`에 `"mallo"` 추가(세이람의 URL scheme — 세이람 설치 확인용)
   - 이후 `npx expo prebuild --platform ios`, `cd ios && LANG=en_US.UTF-8 pod install` (UTF-8 안 주면 pod가 인코딩 오류로 실패함)

2. **iOS 네이티브 모듈** — `modules/alarmapp-share`에 iOS 추가(Android와 같은 함수 이름).
   - `expo-module.config.json`: `"platforms": ["apple","android"]`, `"apple": {"modules": ["AlarmappShareModule"]}`
   - `ios/AlarmappShare.podspec`, `ios/AlarmappShareModule.swift` — 세이람 `modules/sayram-share/ios/` 두 파일을 그대로 옮기고 아래만 바꾼다:
     - `Name("AlarmappShare")`
     - `mine = "alarmapp"`, `sibling = "sayram"`
     - `ownNames = ["shifts", "config"]`, `siblingNames = ["events", "config"]`
     - `isInstalled`: `pkg == "com.danielpark.sayram"`, URL `mallo://`
   - 공유 폴더 구조(세이람과 약속): `<그룹>/alarmapp/shifts.json·config.json`(교대알람이 씀), `<그룹>/sayram/events.json·config.json`(세이람이 씀). 내용 형식은 Android와 같음.
   - iOS는 파일을 읽어도 상대 앱이 실행되지 않으니 `pushToSibling`은 `"same"`, `pullToInbox`는 그냥 상대 폴더 파일 읽기. `isInstalled`의 메인 스레드 대기는 최대 0.3초(세이람 코드 그대로).

3. **JS** (`src/utils/sayramShareNative.ts` 등): Android용 로직 그대로 두면 iOS에서도 동작한다(`siblingShareAvailable`이 iOS에서도 true가 됨). 설정 화면에서 iOS에 옛 v1 "근무 보내기" 버튼이 있었다면 자동 공유 스위치로 바뀌는지 확인. 링크(v1)로 받은 옛 데이터가 있다면 지울 수 있게 남겨 둘 것.

4. **빌드·설치(사용자 폰 "폰", iPhone 17 Pro Max, UDID 00008150-000C61A11AE9401C)** — Release, `-allowProvisioningUpdates`, `DEVELOPMENT_TEAM=T5Z6ACK2PU`, `CODE_SIGN_STYLE=Automatic`. 이제 빈 entitlements로 바꿔치기하지 말 것(유료 계정이라 aps-environment 그대로 됨). 설치 후 `codesign -d --entitlements - <앱>`에 application-groups가 들어 있는지 확인.

5. **확인(폰)**: 교대알람 설정에 "세이람과 일정 공유" 스위치가 보이는지. 세이람은 이미 폰에 iOS 공유 버전이 설치돼 있다. 한쪽 스위치를 켜고 → 교대알람에서 근무가 있는 상태로 앱을 내렸다가 세이람을 열면 달력에 근무(초번·말번·비번)가 보여야 한다. 세이람 일정도 교대알람 달력에. 폰 화면은 미러링하지 말고, 화면 확인은 사용자에게 부탁할 것.

6. verify-fix 등 평소 점검. 커밋·푸시는 사용자에게 먼저 묻기(Android v3 브랜치 feat/sayram-share 위에 이어서 해도 됨 — main 병합은 출시 날).

끝나면 세이람 채팅(세션 이름 "세이람")으로 결과를 SendMessage 해 주세요.
