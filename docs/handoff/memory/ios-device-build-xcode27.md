---
name: ios-device-build-xcode27
description: "이 Mac(Xcode 27)에서 말로 iOS 실기기 빌드 시 겪은 함정 4가지와 검증된 빌드 명령 — 계정 부재, iCloud 중복 파일, expo CLI 시뮬레이터 탐지 실패, iPhone 8+(iOS 16) 미지원"
metadata:
  node_type: memory
  type: project
  originSessionId: b38eecc0-d7de-4687-b394-1ee950adba3f
  modified: 2026-10-10T14:37:41.782Z
---

2026-10-10 말로를 폰(iPhone 17 Pro Max)에 올리면서 확인한 것.

**검증된 빌드 명령** (워크트리/메인 어디서든 동일):
```
xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Release \
  -destination "id=00008150-000C61A11AE9401C" \
  -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/mallo-manual" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=T5Z6ACK2PU build
```
설치: `xcrun devicectl device install app --device 00008150-000C61A11AE9401C <app.app>` → `device process launch ... com.danielpark.mallo`. 리마인더: `/Users/daniel/Desktop/daniel-project/Mallo/scripts/ios-build-reminder.sh 폰` (메인 체크아웃에만 있는 untracked 스크립트).

**함정**
1. `No Accounts` 오류 = Xcode에 Apple ID가 없음. 캐시된 프로파일이 유효한 앱(교대알람)은 계정 없이도 빌드돼서 "말로만 안 된다"로 보인다. 키체인 `Xcode-Token` 유무로 판별. 로그인은 Xcode → Settings → Apple Accounts → Sign In (사용자가 직접).
2. iCloud(Desktop) 동기화가 node_modules 안에 `파일 2.cpp` 같은 중복을 만들어 `duplicate symbol` 링크 오류 발생(expo-modules-jsi). `find node_modules -name "* [0-9].*"`로 찾아 해당 패키지를 지우고 `npm install`로 복구.
3. `npx expo run:ios`는 Xcode 27에서 Simulator.app을 못 찾아(`Can't determine id of Simulator app`) 실패 → xcodebuild 직접 사용.
4. iPhone 8+(iOS 16.7)는 Xcode 27 CoreDevice에서 `Pairing State: unsupported` → 팀에 기기 등록 불가 → 무료 팀 프로파일에 UDID가 안 들어가 ios-deploy 설치가 `0xe8008015`로 거부됨. 현재 툴체인으로는 8+ 설치 불가.
5. ios/ 폴더를 메인 체크아웃(redesign/toss)에서 복사하면 Pretendard 폰트 리소스를 요구함 → `assets/fonts/`에 복사(리뷰 브랜치엔 없는 파일, 커밋 금지).
6. **실행 직후 크래시(EXC_BREAKPOINT, `__UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`)** = iOS 27 SDK는 UIScene 미채택 앱을 강제 종료. 교대알람의 `plugins/withIosSceneDelegate.js` + app.json `ios.infoPlist.UIApplicationSceneManifest`를 말로에 그대로 이식해 해결(2026-10-12). 크래시 로그는 `xcrun devicectl device copy from --domain-type systemCrashLogs --source . --destination <dir>`로 가져온다(idevicecrashreport는 무선 폰을 못 봄).
7. npm install로 패키지를 다시 쓰면 iCloud가 곧바로 `파일 2/3.cpp` 중복본을 또 만든다 → 재설치 없이 `find node_modules -name "* [0-9].*" -delete` + 해당 패키지 `.DerivedData` 삭제 후 **바로** 빌드.
8. 시뮬레이터 빌드 2가지 함정(2026-10-12 해결, 둘 다 node_modules 로컬 패치라 npm install 후 재적용 필요):
   - ExpoModulesJSI xcframework 스크립트(`node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh`)가 node_modules 안 `.DerivedData`에 빌드 → iCloud Finder 속성 때문에 `CodeSign failed (detritus)`. `DERIVED_DATA_PATH`를 `$HOME/Library/Developer/Xcode/DerivedData/mallo-jsi`로 바꾸고 `.xcframework-slices` 삭제.
   - x86_64 슬라이스 Swift 컴파일이 조용히 죽음(`failed with exit code 0 but produced no further output`) → 스크립트의 중첩 xcodebuild에 `ARCHS=arm64` 추가 + 메인 xcodebuild에도 `ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO -sdk iphonesimulator -derivedDataPath .../mallo-sim`.
   - 폰 빌드와 동시에 돌리면 xcframework 산출물을 같이 건드려 둘 중 하나가 깨진다 — 순차로.
   - 시뮬레이터 검증 데이터: `xcrun simctl get_app_container <sim> com.danielpark.mallo data`의 `Documents/mallo/`에 records.json + m4a 주입(스크래치 mkrecords.js 참고). 제스처는 iOS Simulator MCP `touch_path`(길게 누르기 = 같은 점에 dt_ms 550).

**Why:** 같은 오류를 세 번 다른 방식으로 재시도하며 시간을 썼음. [[ios-build-icloud-codesign-fail]]의 AlarmApp 교훈(generic 대상 금지, derivedData iCloud 밖)도 그대로 적용된다.

**How to apply:** iOS 실기기 빌드 전에 (1) `security find-generic-password -s Xcode-Token`으로 계정 확인, (2) node_modules 중복 파일 검사, (3) 위 명령 그대로 사용. 8+ 요청이 오면 불가 사유를 바로 안내.

**추가(2026-10-13):** `assets/fonts/`(Pretendard otf)는 코드에서 안 쓰지만 ios 프로젝트 리소스 목록이 참조하므로 **삭제하면 iOS 빌드가 'No such file' 로 실패**한다. 지우지 말고 .gitignore로만 제외(assets/fonts 삭제 금지). 지웠다면 메인 체크아웃 /Users/daniel/Desktop/daniel-project/Mallo/assets/fonts 에서 복사.
