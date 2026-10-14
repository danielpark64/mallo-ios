# 세이람(SayRam) 작업 인계 — 같은 맥의 다른 계정에서 이어 하기

작성: 2026-10-14 밤. 마지막 커밋은 이 문서를 넣은 커밋(브랜치 `claude/awesome-pasteur-jgemfk`).

다른 macOS 계정에서는 이 계정의 `/Users/daniel` 폴더(바탕화면 포함)와 `~/.claude`(대화 기록·메모리·에이전트)를 볼 수 없습니다. 그래서 이어 하는 데 필요한 것을 모두 저장소 안에 넣었습니다.

| 무엇 | 저장소 안 위치 |
|---|---|
| 프로젝트 지침(이름 구분·규칙) | `CLAUDE.md` |
| 진행 기록(날짜별 무엇을 했나) | `.claude/memory/project_mallo_progress.md` |
| 버그 이력 | `.claude/bugs.md` |
| 기억해 둔 주의사항(원래 `~/.claude/.../memory`) | `docs/handoff/memory/` |
| 에이전트 정의(verify-fix·alarm-logic 등 8개) | `.claude/agents/` — 프로젝트 에이전트라 다른 계정에서도 그대로 쓰인다 |
| Android 화면 조작·스크린샷 도구 | `scripts/dev/ui.py`, `scripts/dev/pad.py` |
| Play 출시 안내 | `docs/PLAY_CONSOLE_GUIDE.md` |

## 1. 이름 (정확히)

- **앱 이름은 세이람, 영문 SayRam**입니다. 스토어 제목은 "SayRam 세이람 – 말로 하는 알람·일정".
- **패키지 이름·번들 ID는 `com.danielpark.sayram`**입니다(Android·iOS 모두).
- **말로(Mallo)**는 옛 이름입니다. 저장소 `danielpark64/mallo-ios`, 폴더 `Mallo`, 코드 namespace `com.danielpark.mallo`, 모듈 `modules/mallo-alarm`, 데이터 폴더 `Documents/mallo`에만 남아 있고, 바꾸지 않습니다(바꾸면 기존 데이터 경로·네이티브 클래스가 깨짐).
- **교대알람**(AlarmApp, `com.danielpark.alarmapp`)은 별개 앱입니다. 세이람의 홍보 배너가 소개만 합니다.

## 2. 새 계정에서 처음 준비

1. **GitHub 접근**: 이 계정의 SSH 키는 새 계정에 없습니다. 새 계정에서 SSH 키를 만들어 GitHub(danielpark64)에 등록하거나 HTTPS로 받습니다.
   ```bash
   git clone git@github.com:danielpark64/mallo-ios.git ~/dev/sayram
   ```
   ```bash
   cd ~/dev/sayram && git checkout claude/awesome-pasteur-jgemfk
   ```
   - **iCloud 동기화 폴더(Desktop·Documents) 밖에 두세요.** iCloud가 `파일 2.java` 같은 중복을 만들어 빌드가 계속 깨집니다(이 계정에서 여러 번 겪음).
2. **도구**: Node(이 계정과 같은 메이저 버전), Xcode 27, Android Studio(SDK·adb), CocoaPods. `npm install`.
3. **네이티브 폴더 만들기**: `android/`, `ios/`는 커밋되지 않습니다(.gitignore). 새로 만듭니다.
   ```bash
   npx expo prebuild --clean
   ```
   - 서명·앱 이름 현지화·권한 제거는 `plugins/`와 `app.json`(`blockedPermissions`)이 자동으로 넣습니다.
   - iOS 프로젝트·스킴 이름이 이 계정과 다를 수 있습니다(이 계정은 `ios/app.xcworkspace`, 스킴 `app`). `ls ios`로 확인해 아래 명령을 맞춥니다.
   - `cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install` — Ruby 4에서 이 변수 없이 돌리면 `Unicode Normalization` 오류로 죽습니다.
4. **Xcode 계정**: Xcode › Settings › Accounts에 Apple ID 로그인(사용자가 직접). 팀 `T5Z6ACK2PU`. 새 번들 ID는 로그인해야 프로파일이 만들어집니다.
5. **Claude Code**: 새 계정에서 저장소 폴더를 열면 `CLAUDE.md`와 `.claude/agents/`가 자동으로 적용됩니다. 전역 지침(한국어로 답하기 등)은 새 계정의 `~/.claude/CLAUDE.md`에 없으므로, 첫 대화에서 "CLAUDE.md와 docs/HANDOFF.md를 읽고 이어서 해줘"라고 시작하세요. `docs/handoff/memory/`의 메모는 필요하면 새 계정의 메모리로 옮겨 달라고 하면 됩니다.

## 3. 기기

| 기기 | 식별자 | 연결 | 설치 방법 |
|---|---|---|---|
| 폰(iPhone 17 Pro Max) | UDID `00008150-000C61A11AE9401C` | 무선(devicectl) | 아래 iOS 명령. 무료 개발 프로파일이라 **7일마다 재설치**(마지막 설치 10-14) |
| 미니(iPad mini 6) | UDID `00008110-00061C9C02FB801E` | USB | 같음. 무료 프로파일은 기기당 앱 3개 한도(세이람·교대알람·WebDriverAgentRunner) |
| 32(Galaxy, Android 13) | adb `RF9R3049REV` | USB | `adb -s RF9R3049REV install -r <apk>` |
| 노트(Note10+, Android 12) | adb `R3CM909QRGK` | USB | **adb install이 멈춤** → `adb push <apk> /data/local/tmp/sayram.apk` 후 `adb shell pm install -r /data/local/tmp/sayram.apk`, 그리고 `pm grant com.danielpark.sayram android.permission.RECORD_AUDIO` |
| 플립 | adb `R5CR80EAMRE` | 미연결 | 커버 화면 알람 미검증 |

- 노트는 Android 12라 **녹음 파일 없이 글만 저장**됩니다(녹음기와 인식기가 마이크를 같이 못 씀 — `lib/voiceCapture.ts`). 정상입니다.
- 폰 데이터 사본이 이 계정 바탕화면 `세이람_데이터백업_2026-10-13`에 있습니다(새 계정에선 안 보임).

### 빌드 명령 (이 계정에서 검증)

```bash
find node_modules ios android modules -name "* [0-9].*" -delete
```
```bash
cd android && ./gradlew assembleRelease
```
```bash
xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Release -destination "id=00008150-000C61A11AE9401C" -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/mallo-manual" -allowProvisioningUpdates -allowProvisioningDeviceRegistration CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=T5Z6ACK2PU build
```
```bash
xcrun devicectl device install app --device 00008150-000C61A11AE9401C "$HOME/Library/Developer/Xcode/DerivedData/mallo-manual/Build/Products/Release-iphoneos/app.app"
```
- APK: `android/app/build/outputs/apk/release/app-release.apk`. 업로드용 AAB: `./gradlew bundleRelease`.
- 테스트: `npx tsc --noEmit`, `npx jest`(2026-10-14 기준 418개 통과).
- 화면 조작: `python3 scripts/dev/ui.py <adb시리얼> list | tap "<글자>" | shot <이름>` (스크린샷은 `UI_SHOT_DIR` 폴더, 기본 /tmp). 녹음 시트 같은 Modal은 목록에 안 잡혀 좌표로 눌러야 할 때가 있습니다. 32의 마이크 버튼 (540,2096) 근처.
- 스토어 스크린샷: `python3 scripts/dev/pad.py <원본.png> <출력.png>` → 1350×2400(9:16) 여백 붙이기.

## 4. 지금 상태 (2026-10-14 밤)

**완료**
- 기능: 말로 일정·알람, 미리 알림(10분·30분·1시간·하루 전), 단어 구간 재생, 9개 언어, 다크/라이트·글자 4단계, iPad, 백업·폴더 내보내기/가져오기, 알람 전체화면(플립 커버 화면 대응 코드), 워치 브릿지 알림.
- 10-13~14 추가: 홍보 배너(목록 맨 아래, `lib/promo.ts`), 글 읽어 주기(녹음 없는 일정 ▶), 편집 화면 "눌러서 말하기" 막대, 날짜 없이 말하면 녹음 시각으로 저장(+정하기), 상세 보기의 "🔔 알림 바꾸기" 시트, 수정 화면에서 고치기·말로 덧붙이기·알림을 한 번에, 주 보기 "몇째 주" 표시, 목록 ▶ 재생 되다 안 되다 버그 수정, 마이크 버튼 고정 영역.
- 패키지·번들 ID `com.danielpark.sayram`, 네 기기 모두 이 ID로 설치(옛 `com.danielpark.mallo` 앱은 삭제).
- Play 자료: `store-assets/`(9개 언어 등록 문구, 아이콘, 그래픽, 스크린샷 9장 최신), 개인정보처리방침 `docs/privacy*.html`, 콘솔 답안 `docs/PLAY_CONSOLE_GUIDE.md`. 업로드는 하지 않음.

**사용자가 결정·직접 할 것**
- 업로드 키 생성(비밀번호) → `android/keystore.properties`(커밋 금지).
- ~~main 병합 + GitHub Pages~~ — 2026-10-14 완료(main = 작업 브랜치, https://danielpark64.github.io/mallo-ios/privacy.html). 이후 작업도 main에 병합해 두면 새 계정은 main만 받으면 된다.
- 콘솔 광고 신고 "예"(홍보 배너), 후원 슬라이드는 넣은 채로 올리기로 결정(교대알람이 같은 화면으로 통과).
- 비공개 테스트 12명·14일.

**미검증·남은 것**
- 플립 커버 화면 알람, Wear OS·애플워치 알람 끄기, 재부팅 후 알람 유지, 폴더 내보내기→다른 기기 가져오기 왕복.
- 아이폰: 무음 스위치를 켠 상태의 글 읽어 주기, "🔔 알림 바꾸기" 시트 저장 직후 "수정" 누르기.
- 경미: 설정에서 테마 바꾼 직후 상태 표시줄 아이콘 색, 일부 알림창 버튼 "OK", 울림 화면 24시간제, 네이티브 "5분 후 다시" 직후 5분 안에 앱 콜드 스타트 시 미룬 알람 유실 가능(코드상).
- 7개 언어 등록 문구는 초안(원어민 검토 권장).

## 5. 일하는 방식 (사용자가 원하는 것)

- 사용자는 한국어로, 짧게 지시합니다. 답도 한국어로, 결과부터.
- 수정 → `npx tsc --noEmit` + `npx jest` → **verify-fix 에이전트** → 지적 반영 → **32에서 확인** → 사용자 승인 후 커밋·푸시 → 네 기기에 설치.
- 폰은 사용자가 iPhone 미러링을 켜 주면 화면을 볼 수 있지만, 미러링 창으로는 클릭이 폰에 전달되지 않았습니다. 폰 조작이 필요한 확인은 사용자에게 부탁합니다.
- 세션 한도로 끊겨도, 한도가 풀리면 따로 말이 없어도 이어서 끝까지 진행합니다(커밋은 확인).
