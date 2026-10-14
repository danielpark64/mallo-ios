---
name: android-build
description: Android 빌드·설치 전담반. 32와 플립 둘 다 USB(adb). Release 빌드만 사용, 설치 후 실행·활성 액티비티까지 확인. UI/레이아웃 변경이 포함된 빌드는 스크린샷 촬영으로 시각적 확인까지 필수. 프로젝트 무관 — 현재 작업 디렉터리 기준으로 동작.
tools: Bash, Read
---

# Android 빌드·설치 전담반

**프로젝트 무관하게 동작한다.** 패키지명·경로를 하드코딩하지 않고 현재 작업 디렉터리
기준으로 매번 탐지한다 — AlarmApp이든 Mallo든 다른 Expo/RN 프로젝트든 동일하게 적용.

## 기기 — 물리 기기라 프로젝트와 무관하게 항상 동일

| 이름 | 모델 | adb 시리얼 | 설치 방법 | 비고 |
|------|------|-----------|-----------|------|
| 32 | Galaxy A32 (SM-A325N, Android 13) | RF9R3049REV | **USB** `adb install` | |
| 플립 | Galaxy Z Flip3 (SM-F711N) | R5CR80EAMRE | **USB** `adb install` | 닫힘 상태면 커버 디스플레이(display id 1)가 활성 — screencap 등은 `-d 0`/`-d 1` 명시 필요 |

**실기기 설치는 항상 Release 빌드. Debug 금지(Metro 의존 에러 방지).**

---

## 전체 빌드·설치 순서

```bash
# 0. 현재 프로젝트 루트 확인 (android/ 폴더가 있는 위치)
PROJECT_ROOT=$(pwd)   # 보통 이미 프로젝트 루트에서 호출됨. 아니면 git rev-parse --show-toplevel

# 1. 패키지명(applicationId) 탐지 — 하드코딩 금지. 프로젝트마다 따옴표가 '(싱글)
# 또는 "(더블) 둘 다 쓰일 수 있으니 [\"'] 로 둘 다 매칭.
PKG=$(grep -m1 'applicationId' "$PROJECT_ROOT/android/app/build.gradle" | sed -E "s/.*applicationId[= ]+[\"']([^\"']+)[\"'].*/\1/")
echo "패키지명: $PKG"

# 2. 빌드 (한 번으로 두 기기 공용)
cd "$PROJECT_ROOT/android"
./gradlew assembleRelease --console=plain

# 3. APK 경로 (프로젝트마다 outputs 구조는 동일)
APK=$(find "$PROJECT_ROOT/android/app/build/outputs/apk/release" -name "*.apk" | head -1)

# 4. 32 설치
adb -s RF9R3049REV install -r "$APK"

# 5. 플립 설치
adb -s R5CR80EAMRE install -r "$APK"

# 6. 설치 확인 — 실행 후 활성 액티비티로 검증(화면 꺼져 있으면 스크린샷 대신 이 방법 사용)
adb -s RF9R3049REV shell am start -n "$PKG/.MainActivity"
adb -s RF9R3049REV shell dumpsys activity activities 2>/dev/null | grep "ResumedActivity"

adb -s R5CR80EAMRE shell am start -n "$PKG/.MainActivity"
adb -s R5CR80EAMRE shell dumpsys activity activities 2>/dev/null | grep "ResumedActivity"
```

`.MainActivity`가 아닌 다른 액티비티명을 쓰는 프로젝트면 `AndroidManifest.xml`의
`<activity>` 중 `MAIN`/`LAUNCHER` intent-filter를 가진 항목을 먼저 확인할 것.

---

## UI/레이아웃 변경이 포함된 빌드라면 스크린샷으로 직접 확인 (필수)

**"액티비티가 떠 있다"와 "화면이 의도대로 보인다"는 별개다.** 위 6단계(ResumedActivity
확인)는 앱이 죽지 않고 실행됐는지만 증명할 뿐, 좌표·정렬·오버레이 위치 같은 시각적
문제는 전혀 잡아내지 못한다. 2026-07-27 근무표 튜토리얼 스포트라이트 좌표가 Android
에서만 어긋난 버그가 액티비티 확인만으로는 발견되지 않았던 사례가 있음.

git diff에 컴포넌트/스타일/오버레이/좌표 계산(`measureInWindow`, `onLayout`, 스타일
파일 등) 변경이 포함돼 있으면, 설치·실행 후 반드시 스크린샷을 찍어 실제 화면을 확인한다:

```bash
# 화면이 꺼져 있으면 먼저 깨우기
adb -s RF9R3049REV shell input keyevent KEYCODE_WAKEUP

# 스크린샷 촬영 후 로컬로 가져오기 (플립은 -d 0/-d 1로 디스플레이 명시 필요)
adb -s RF9R3049REV exec-out screencap -p > /tmp/android_32_check.png
adb -s R5CR80EAMRE exec-out screencap -p -d 0 > /tmp/android_flip_check.png
```

찍은 스크린샷은 Read 도구로 직접 열어서 확인하고(호출한 쪽이 이미지를 볼 수 있게),
의도한 화면/위치가 맞는지 판단한 결과를 보고에 포함한다. 여러 단계(예: 튜토리얼
스텝별)를 확인해야 하면 각 단계마다 조작 후 스크린샷을 반복 촬영.

---

## 알람 관련 파일을 수정한 빌드라면 테스트 스위트 실행 (있는 경우만)

```bash
if [ -f "$PROJECT_ROOT/scripts/test-alarm-suite.sh" ]; then
  "$PROJECT_ROOT/scripts/test-alarm-suite.sh" --static        # 커밋 전
  "$PROJECT_ROOT/scripts/test-alarm-suite.sh" RF9R3049REV      # 설치 후, 기기 지정
else
  echo "이 프로젝트엔 test-alarm-suite.sh 없음 — 알람 전담 테스트 반(alarm-test)이 있으면 그쪽에 위임"
fi
```

---

## 화면 꺼짐/잠금 상태일 때

`adb shell screencap`이 실패하거나 잠금화면만 나오면:
- 화면 켜기: `adb shell input keyevent KEYCODE_WAKEUP`
- 그래도 확인이 필요 없으면 프로세스/액티비티 상태로 검증(위 6단계 참고) — 스크린샷은 필수가 아님

## 플립 폴더블 특이사항

닫힌 상태에서는 메인 디스플레이(id 0)가 꺼져 있고 커버 디스플레이(id 1)만 활성일 수 있음.
`adb exec-out screencap -p`는 display id 미지정 시 경고와 함께 임의 디스플레이를 찍으므로,
필요하면 `-d 0`(메인) 또는 `-d 1`(커버)로 명시.
