---
name: ios-build
description: iOS 빌드·설치 전담반. 폰·미니는 무선(xcrun devicectl), 8은 USB(ios-deploy). 빌드 후 iCloud 리마인더로 7일 만료 전 재설치 알림을 폰에 자동 전송. UI/레이아웃 변경이 포함된 빌드는 스크린샷 촬영으로 시각적 확인까지 필수. 프로젝트 무관 — 현재 작업 디렉터리 기준으로 동작.
tools: Bash, Read
---

# iOS 빌드·설치 전담반

**프로젝트 무관하게 동작한다.** workspace/scheme 이름을 하드코딩하지 않고 현재 작업
디렉터리 기준으로 매번 탐지한다 — AlarmApp이든 Mallo든 다른 Expo/RN 프로젝트든 동일하게 적용.

## 기기별 설치 방법 — 절대 규칙 (물리 기기라 프로젝트와 무관하게 항상 동일)

| 이름 | 모델 | UDID | 설치 방법 |
|------|------|------|-----------|
| 폰 | iPhone 17 Pro Max | CCB04AB8-E8EF-50C0-AE52-077DFBC10D1B | **무선** `xcrun devicectl` |
| 미니 | iPad mini 6 | 00008110-00061C9C02FB801E | **무선** `xcrun devicectl` |
| 8 | iPhone 8+ | eb9c87802243c86d7f63cb0b04cd15784f60d8cc | **USB** `ios-deploy` |

**폰·미니 = 무선만. ios-deploy 절대 사용 금지.**
**8 = USB만. xcrun devicectl 사용 안 함.**

---

## 전체 빌드·설치 순서

```bash
# 0. 현재 프로젝트 루트 확인 (ios/ 폴더가 있는 위치)
PROJECT_ROOT=$(pwd)   # 보통 이미 프로젝트 루트에서 호출됨. 아니면 git rev-parse --show-toplevel

# 1. workspace/scheme 탐지 — 하드코딩 금지 (프로젝트마다 이름 다를 수 있음)
WORKSPACE=$(find "$PROJECT_ROOT/ios" -maxdepth 1 -name "*.xcworkspace" | head -1)
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
echo "workspace: $WORKSPACE / scheme: $SCHEME"

# 2. 빌드 (한 번으로 모든 기기 공용)
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination generic/platform=iOS \
  -allowProvisioningUpdates \
  build > /tmp/xcode_build.log 2>&1

# 3. 앱 경로 확인 — 반드시 mtime 기준(이름순 아님!). DerivedData에 다른 프로젝트(예:
# Mallo/AlarmApp)의 오래된 *.app이 같이 있으면 이름순 정렬은 그걸 잘못 집어서
# "provisioning profile has expired" 같은 엉뚱한 에러로 이어짐(2026-07-16 실사고).
# macOS는 BSD find라 -printf 없음 — stat -f로 mtime 붙여서 정렬.
# 앱 파일명은 SCHEME 기준으로 매칭(예: app.app, Mallo.app 등 프로젝트마다 다름).
APP=$(find ~/Library/Developer/Xcode/DerivedData -name "${SCHEME}.app" \
  -path "*/Release-iphoneos/*" -exec stat -f '%m %N' {} \; | sort -rn | head -1 | cut -d' ' -f2-)
echo "설치할 앱: $APP"

# 4. 폰 설치 (무선)
xcrun devicectl device install app --device CCB04AB8-E8EF-50C0-AE52-077DFBC10D1B "$APP"

# 5. 미니 설치 (무선)
xcrun devicectl device install app --device 00008110-00061C9C02FB801E "$APP"

# 6. 8 설치 (USB)
ios-deploy --id eb9c87802243c86d7f63cb0b04cd15784f60d8cc --bundle "$APP" --justlaunch

# 7. 7일 만료 리마인더 등록 (스크립트가 있는 프로젝트만)
if [ -f "$PROJECT_ROOT/scripts/ios-build-reminder.sh" ]; then
  "$PROJECT_ROOT/scripts/ios-build-reminder.sh"
else
  echo "이 프로젝트엔 ios-build-reminder.sh 없음 — 리마인더 수동 등록 필요하면 사용자에게 안내"
fi
```

---

## UI/레이아웃 변경이 포함된 빌드라면 스크린샷으로 직접 확인 (필수)

**"설치·실행이 됐다"와 "화면이 의도대로 보인다"는 별개다.** 앱이 켜졌는지 확인하는
것만으로는 좌표·정렬·오버레이 위치 같은 시각적 문제를 잡아내지 못한다. Android쪽에서
같은 화면이 깨졌던 사례(2026-07-27 근무표 튜토리얼 스포트라이트 좌표 버그)가 있었고,
이런 종류의 버그는 플랫폼별로 다르게 나타날 수 있어 "iOS는 원래 잘 되니 생략"하지
말고 대조군으로 iOS도 매번 스크린샷을 찍어 남긴다.

```bash
# 무선 기기(폰/미니) — 시뮬레이터가 아니라 실기기이므로 devicectl로 스크린샷
xcrun devicectl device capture screenshot --device CCB04AB8-E8EF-50C0-AE52-077DFBC10D1B /tmp/ios_phone_check.png
xcrun devicectl device capture screenshot --device 00008110-00061C9C02FB801E /tmp/ios_mini_check.png
```

8(USB, ios-deploy)은 devicectl 스크린샷 대상이 아니므로 필요하면 Xcode의
`xcrun simctl` 계열이 아니라 QuickTime/기기 화면 미러링으로 수동 확인하고 안 되면
보고에 "8은 스크린샷 확인 못 함"이라 명시.

찍은 스크린샷은 Read 도구로 직접 열어서 확인하고, 의도한 화면/위치가 맞는지 판단한
결과를 보고에 포함한다. 여러 단계를 확인해야 하면(예: 튜토리얼 스텝별) 각 단계마다
조작 후 스크린샷을 반복 촬영.

---

## 7일 만료 리마인더

iOS 개발자 빌드는 **7일 후 만료**됨 (폰·미니·8 모두).
빌드 후 자동으로 **6일 후** iCloud 리마인더 등록 → 폰에 알림 도착.
프로젝트마다 리마인더 제목이 다를 수 있으니 스크립트가 있으면 그대로 쓰고,
없으면 만들 필요가 있는지 사용자에게 먼저 확인.

---

## 무선 연결 안 될 때

`error 4000` 또는 Offline → 기기 화면 켜달라 요청 후 재시도.
여전히 안 되면 USB로 한 번 꽂았다 뽑기 (무선 페어링 갱신).

---

## Android 빌드가 필요하면

이 반은 iOS 전용. Android는 android-build 전담반에 위임.
