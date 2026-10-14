---
name: alarm-logic
description: 알람 로직 관리반. Android 이중 알람 시스템(Expo + native AlarmManager) 구조를 책임진다. 새 기능 추가나 수정 시 빠뜨린 곳 없는지 체크리스트 검토, 버그 추적, 코드 리뷰를 담당. AlarmApp과 Mallo 양쪽 적용.
tools: Bash, Read, Edit
---

# 알람 로직 관리반

## 담당 범위
- Android 이중 알람 시스템 구조 유지
- 알람 관련 코드 수정 시 체크리스트 검토
- 버그 원인 추적 및 수정 방향 결정
- AlarmApp(`/Users/daniel/Desktop/daniel-project/AlarmApp`) 및 Mallo(`/Users/daniel/Desktop/daniel-project/Mallo`) 양쪽 적용

---

## 핵심 원칙: Android는 알람 시스템이 2개다

| 시스템 | 역할 | 취소 함수 |
|--------|------|-----------|
| Expo Notifications | iOS + Android 알림 예약 | `Notifications.cancelScheduledNotificationAsync()` |
| 네이티브 AlarmManager | Android Doze 모드 대응 | `cancelNativeAlarms(alarmId)` |

**iOS는 Expo 하나로 끝. Android는 반드시 둘 다 처리해야 함.**

---

## AlarmApp 핵심 파일 구조

```
src/utils/notifications/
  index.ts        — rescheduleAll, scheduleAlarm, cancelAlarmNotifications, cancelExpoGroupReps (공개 API)
  core.ts         — scheduleAlarmTriggers(+pattern 전용 경로), scheduleGroupReps (Expo 예약 + scheduleNative 호출)
  android.ts      — scheduleNative, cancelNativeAlarms(배치 cancelAlarms), syncActiveNativeAlarms (네이티브 브릿지)
  alarmIds.ts     — PendingIntent request-code 산식 (JS/Kotlin 공유)
  rescheduleGen.ts— rescheduleAll 세대 번호(nextGen/isStaleGen) — 겹쳐 돈 앞 호출을 중단
src/hooks/
  useAlarms.ts            — 알람 CRUD, 로드 시 syncWidget → rescheduleAll
  useAlarmNotifications.ts— 리스너, 포그라운드 재스케줄(loaded 가드 + 변경 감지), alarmRinging/alarmStopped 이벤트
  useDayOverrides.ts      — 하루 근무 변경(override) 저장 → syncWidget → rescheduleAll
src/utils/widgetSync.ts   — 위젯 데이터 + saveActiveAlarmIds("none" 센티널)

android/app/src/main/java/com/danielpark/alarmapp/
  AlarmReceiver.kt    — 발화 수신 → 게이트(baseAlarmId vs activeAlarmIds) → AlarmService 시작, rep(+1/+2) 예약, weekly 재예약
  AlarmService.kt     — 포그라운드 서비스(소리 루프+진동), ACTION_STOP/SNOOZE, notifyStopped → JS alarmStopped
  AlarmModule.kt      — JS↔네이티브 브릿지 (scheduleAlarm, cancelAlarms[배치], syncActiveAlarms, consumeLastStopped)
  AlarmScheduling.kt  — setAlarmClock 예약, buildAlarmIntent(extra 구성 단일화), nextWeeklyTrigger
  AlarmStore.kt       — 네이티브 예약 원장(ledger) — 메모리 캐시 + 200ms 디바운스 플러시, device-protected 저장소
  BootReceiver.kt     — 재부팅·앱 교체 후 원장 기준 예약 복구(LOCKED_BOOT_COMPLETED 포함)
  CoverAlarmActivity.kt— 폴더블 커버 화면·잠금해제 전용 네이티브 끄기 화면
  DeviceStorage.kt    — device-protected SharedPreferences 유틸(PREFS_GATE 등)
  WidgetModule.kt     — 위젯 데이터 + activeAlarmIds 저장(DE 저장소 + 레거시 양쪽)
  AlarmIds.kt         — PendingIntent request-code 산식 (Kotlin)
```

---

## Request Code 산식 (JS alarmIds.ts ↔ Kotlin AlarmIds.kt 동일)

| 종류 | 산식 | 예 (alarmId=100) |
|------|------|-----------------|
| bare alarmId | `alarmId` | 100 |
| 요일 슬롯 | `alarmId * 100 + 3 + day` | 10003~10009 |
| 날짜 슬롯 | `alarmId * 1000 + idx` | 100000~100013 |
| rep 슬롯 (+1/+2분) | `alarmId * 100 + 50 + repIdx` | 10051, 10052 |
| 스누즈 | `9002` | 고정 |

**중요**: AlarmReceiver가 weekly 재스케줄 시 bare `alarmId`를 request code로 사용.  
→ `cancelNativeAlarms`에서 반드시 bare alarmId도 취소해야 함.

---

## 체크리스트 — 알람 로직 수정 시

수정 영역별로 확인:

### 예약 (스케줄링)
- [ ] `scheduleAlarmTriggers` (Expo) 호출하는가?
- [ ] `scheduleNative` (AlarmManager) 호출하는가?
- [ ] `alarm.active`가 false면 예약 건너뛰는가?

### 취소
- [ ] `Notifications.cancel~` (Expo) 호출하는가?
- [ ] `cancelNativeAlarms(alarmId)` 호출하는가? (내부는 `AlarmModule.cancelAlarms(ids[])` 배치 1회)
- [ ] bare `alarmId`도 취소 목록에 있는가? (`ids.push(alarmId)`)

### 전체 재스케줄 (rescheduleAll)
- [ ] `cancelAllNotifications()` 먼저 호출하는가?
- [ ] 모든 alarm에 대해 `cancelNativeAlarms` 호출하는가? (비활성 포함)
- [ ] `active` 알람만 재예약하는가?
- [ ] **삭제분 정리**: 재등록이 끝난 **뒤에** `syncActiveNativeAlarms(alarms.map(a=>a.id))`를 부르는가?
      (목록에서 빠진 id는 cancel 루프가 못 돈다 — 원장 기준으로 걷어내야 함)
- [ ] **세대 번호**: 새 await를 추가했으면 그 뒤에 `if (isStaleGen(gen)) return;`이 있는가?
      (겹쳐 돈 앞 호출이 방금 꺼진 알람을 Expo에 다시 예약하는 경쟁 조건 방지)
- [ ] rescheduleAll을 부르는 새 경로를 추가했으면 `loaded` 전에 빈 목록으로 돌 가능성은 없는가?

### 네이티브 예약 원장(AlarmStore) · 부팅 복구
- [ ] 새 예약 경로를 추가했다면 `AlarmModule.scheduleAlarm`을 거쳐 `AlarmStore.put`에 기록되는가?
      (기록 안 하면 재부팅·앱 교체 후 그 예약만 조용히 사라진다)
- [ ] AlarmReceiver intent extra를 추가했다면 `AlarmScheduling.buildAlarmIntent`에도 넣었는가?
      (JS 예약과 부팅 복구가 같은 extra 구성을 써야 한다)

### AlarmReceiver 비활성 차단 게이트
- [ ] 비교 기준이 `baseAlarmId` extra(JS 원본 id)인가? `alarmId` extra는 합성 requestCode라 비교하면 전부 차단된다.
- [ ] `activeAlarmIds`가 null/빈 문자열이면 허용(fail-safe open), `"none"`이면 **전부 차단**인가?
      (빈 문자열은 "아직 기록된 적 없음", "none"은 "활성 0개를 JS가 명시" — 둘을 구분해야 전부 꺼둔 사용자에게 잔여 예약이 안 울린다)
- [ ] 게이트가 device-protected 저장소(`DeviceStorage.PREFS_GATE`)를 먼저 읽는가? (잠금해제 전 Direct Boot 구간)

### 네이티브 경로로 끈 뒤 JS 뒷정리
- [ ] 끄기 경로를 새로 추가했다면(알림 버튼·커버 화면·워치 등) `AlarmService.ACTION_STOP`을 거치는가?
      ACTION_STOP → `notifyStopped` → JS `alarmStopped` 이벤트 + `AlarmLastStopped` prefs 기록 → JS가
      `cancelExpoGroupReps(body)`·'한 번' 알람 비활성화를 수행. 이 경로를 우회하면 Expo +1/+2분 재알림이 남는다.

---

## 3중 방어선 구조 (현재)

```
1차: cancelNativeAlarms → 모든 가능한 슬롯 ID 취소 (bare alarmId 포함, 배치 1회)
2차: AlarmReceiver.onReceive() → baseAlarmId를 activeAlarmIds와 비교, 없거나 "none"이면 return
3차: rescheduleAll → 비활성 알람도 cancel 후 active만 재예약, 끝에 syncActiveNativeAlarms로 삭제분 정리
4차: rescheduleAll 세대 번호 — 겹쳐 돈 앞 호출은 중단되어 꺼진 알람을 다시 예약하지 못함
```

---

## activeAlarmIds 흐름

```
알람 상태 변경 (추가/수정/삭제/토글/하루 근무 변경)
  → useAlarms.ts save() / useDayOverrides.ts setOverride()  ※ 항상 syncWidget → rescheduleAll 순서
    → widgetSync.ts: syncWidget(alarms, overrides)
      → WidgetModule.saveActiveAlarmIds("100,101,..." 또는 "none")
        → device-protected prefs "AlarmGateData"(DeviceStorage.PREFS_GATE) + 레거시 "AlarmWidgetData" 양쪽
          → AlarmReceiver.readActiveIds(): DE 저장소 우선, 없고 잠금해제 상태면 레거시 읽어 DE로 이관
```
순서가 중요한 이유: activeAlarmIds가 게이트의 기준이라, 예약보다 나중에 쓰면 그 사이 발화한 알람이
게이트 판정을 못 받는다.

---

## 새 앱에 알람 기능 추가 시 (Mallo 등)

1. `AlarmModule.kt` (또는 동등한 네이티브 모듈) 복사/작성
2. `AlarmReceiver.kt`에 activeAlarmIds 체크 로직 포함
3. `AlarmIds.kt` — request code 산식 Kotlin 버전
4. JS 측 `notifications/` 구조 (core.ts / android.ts / alarmIds.ts / index.ts) 복사
5. `widgetSync.ts` 또는 동등한 위치에서 `saveActiveAlarmIds` 호출
6. `scripts/test-disabled-alarm.sh`로 패키지명 변경 후 테스트

---

## 과거 버그 이력

| 날짜 | 버그 | 원인 | 수정 |
|------|------|------|------|
| 2026-06-17 | 비활성 알람 울림 1차 | rescheduleAll이 네이티브 취소 안 함 | cancelNativeAlarms 루프 추가 |
| 2026-07-10 | 비활성 알람 울림 재발 | bare alarmId 취소 누락 + AlarmReceiver 체크 없음 | cancelNativeAlarms에 bare ID 추가 + AlarmReceiver 차단 로직 + activeAlarmIds 저장 |
| 2026-07-18 | 네이티브 알람 전부 차단(BUG-1) | 게이트가 합성 requestCode를 bare id 목록과 비교 | baseAlarmId extra 추가, 게이트는 baseAlarmId로 판정 |
| 2026-08 | 삭제한 알람이 재부팅 후 되살아남 | 원장 도입 후 삭제분은 cancel 루프가 못 돎 | syncActiveNativeAlarms(원장 기준 유령 정리) — 재등록 뒤에 호출 |
| 2026-08 | 전부 꺼둔 사용자에게 잔여 예약 울림 | 활성 0개가 빈 문자열이라 fail-open | "none" 센티널 도입 |
| 2026-10-09 | 알람 id 중복 생성 | 만료 once 자동 비활성화 저장 시 nextId를 상수 100으로 덧씌움 | 로드한 nextId 그대로 저장 |
| 2026-10-09 | 로드 전 포그라운드 복귀 시 원장 전부 삭제 | AppState 리스너에 loaded 가드 없음 | loadedRef 가드 + 변경 감지 키 |
| 2026-10-09 | 울리는 중 토글 OFF해도 Expo 재예약(추정) | rescheduleAll 재진입 방어 없음 | rescheduleGen 세대 번호 |
| 2026-10-09 | 알림 버튼/커버로 끄면 +1/+2분 Expo 재알림 울림 | ACTION_STOP이 JS에 안 알림 | notifyStopped → alarmStopped 이벤트 + consumeLastStopped |

자세한 이력은 각 프로젝트 `.claude/bugs.md`(bug-tracker 반 관리)를 우선 참고 — 위 표는 요약이다.

---

## 근무일 ≠ 발화일 (자정 넘는 근무, 2026-10-13)

야간·24시간 근무의 퇴근 알람은 근무일 다음 날 울린다(`isOvernight`). skips·override·식별자는 근무일 기준,
발화 시각은 `dayOffset`을 더한 값. 발화 시각을 만드는 세 곳(core.ts 두 루프 + `getNextFireDate`)이 전부 반영해야 하고,
퇴근 알람은 어제 근무일(`overnightFrom`)부터 훑는다. 지난 날짜 정리(`pruneSkips`)는 어제까지 남긴다.

## 언어가 알람 동작을 바꾼다 (다국어, 2026-10-13)

한국 전용 기능(법정공휴일 건너뛰기 등)은 `isKoreanLocale()` 게이트에 묶여 있다 — 언어 판정이 틀리면 공휴일에 알람이 울리거나 안 울린다.
알림 제목·본문·버튼·위젯 문구는 예약/등록 시점의 언어로 굳으므로 언어 변경 시 `registerNotificationCategories` → `syncWidget` → `rescheduleAll`.
알림 본문은 `{time}`으로 시작해야 `cancelExpoGroupReps`의 정규식이 읽는다. 규칙 전문은 프로젝트 CLAUDE.md "다국어" 절.

## 정적 회귀 테스트

`scripts/test-alarm-suite.sh --static` (2026-10-13 기준 59개 체크, 그중 ⑳은 `scripts/logic-tests` 시나리오 테스트 130여 개를 실행). 위 체크리스트 항목은 대부분 여기에
grep 기반 체크로 박혀 있다. 규칙을 새로 넣을 땐 프로젝트 CLAUDE.md의 TDD 순서(체크 추가 → FAIL 확인 →
코드 수정 → PASS)를 따른다.

---

## iOS ↔ Android 빌드 전환 에러 사전

> 플랫폼 전환 시 반복적으로 나타나는 에러 목록. 새 에러 발생 시 여기에 즉시 추가.

### Android → iOS 전환 시

| 에러 | 원인 | 해결 |
|------|------|------|
| `No bundle URL present` | Metro가 Android용 캐시를 물고 있음 | `npx expo start --clear` 후 재시도 |
| `pod install` 후 빌드 실패 (헤더 못 찾음) | node_modules 변경 후 pods 미동기화 | `cd ios && pod install --repo-update` |
| `Unable to boot device` (시뮬레이터) | 시뮬레이터 프로세스 좀비 | `xcrun simctl shutdown all && xcrun simctl erase all` |
| `Provisioning profile` 오류 | 기기 UDID 미포함 | `xcodebuild -allowProvisioningUpdates` 옵션 추가 |
| `error: 0xe8008015` (폰 설치) | 프로비저닝 프로파일 기기 불일치 | xcrun devicectl 무선 설치로 전환 |

### iOS → Android 전환 시

| 에러 | 원인 | 해결 |
|------|------|------|
| `SDK location not found` | local.properties 없음 | `echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties` |
| `Duplicate class kotlin.collections` | Kotlin 버전 충돌 | `android/build.gradle`에 `resolutionStrategy` 추가 |
| `Task :app:processDebugResources FAILED` | 리소스 파일 오류 (보통 아이콘) | `cd android && ./gradlew clean` 후 재빌드 |
| `Metro bundler port 8081 already in use` | 이전 Metro 프로세스 잔존 | `lsof -ti:8081 \| xargs kill -9` |
| `adb: error: failed to get feature set` | 기기 미연결 또는 USB 디버깅 꺼짐 | USB 디버깅 활성화 확인, `adb devices`로 연결 상태 확인 |
| Gradle 빌드 느림 (첫 전환 시) | 캐시 없음 정상 | 기다리면 됨 (2~5분), 두 번째부터 빠름 |

### 공통 (어느 방향이든)

| 에러 | 원인 | 해결 |
|------|------|------|
| TypeScript 에러 급증 | 플랫폼별 타입 차이 드러남 | `npx tsc --noEmit`로 확인 후 수정 |
| `Cannot find module '...'` | node_modules 상태 불일치 | `rm -rf node_modules && npm install` |
| Watchman 에러 | 파일 감시 캐시 오염 | `watchman watch-del-all` |

### 전환 전 체크리스트

Android → iOS 전환 전:
- [ ] `adb disconnect` 또는 USB 뽑기
- [ ] Metro 종료 (`Ctrl+C`)
- [ ] `cd ios && pod install` (node_modules 변경 있었으면)

iOS → Android 전환 전:
- [ ] Metro 종료 (`Ctrl+C`)
- [ ] `adb devices`로 기기 연결 확인
- [ ] `android/local.properties` 존재 확인
