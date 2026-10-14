@AGENTS.md

# 프로젝트: 세이람 (SayRam)

**작업을 시작하기 전에 `docs/HANDOFF.md`(인계 문서)와 `.claude/memory/project_mallo_progress.md`(진행 기록)를 먼저 읽을 것.**

## 이름 — 정확히 구분할 것

| 구분 | 값 |
|---|---|
| 앱 이름(사용자에게 보이는 이름) | **세이람** · 영문 **SayRam** |
| 스토어 제목 | SayRam 세이람 – 말로 하는 알람·일정 |
| 패키지 이름(Android) · 번들 ID(iOS) | **com.danielpark.sayram** (2026-10-13~14 변경, 첫 업로드 후 변경 불가) |
| 옛 이름 | 말로(Mallo) — 개발 초기 이름. 앱 화면·스토어에는 쓰지 않는다 |
| 옛 이름이 남아 있는 곳(바꾸지 말 것) | GitHub 저장소 `danielpark64/mallo-ios`, 폴더 `Mallo`, 코드 패키지(namespace) `com.danielpark.mallo`, 네이티브 모듈 `modules/mallo-alarm`, 앱 데이터 폴더 `Documents/mallo`, app.json `slug`·`scheme` `mallo`, 이 진행 기록 파일명 |
| 교대알람(AlarmApp) | **완전히 별개인 다른 앱** (`com.danielpark.alarmapp`, 폴더 `AlarmApp`). 세이람 안의 홍보 배너가 교대알람을 소개할 뿐 코드는 공유하지 않는다 |

## 앱 개요
말로 일정·알람을 만드는 앱. 마이크로 말하면 기기 음성 인식(STT) → 규칙 기반 파서(lib/parseSchedule*.ts)가 날짜·시간·미리 알림을 뽑아 일정으로 저장하고 알람을 건다. 녹음 파일도 함께 저장해 단어 단위로 다시 들을 수 있다.
- 저장: expo-file-system JSON(`Documents/mallo/records.json`) / 녹음: expo-audio / 인식: expo-speech-recognition / 읽어 주기: expo-speech
- 인터넷 권한 없음(스토어 문구의 근거이므로 유지). 외부 광고 SDK 없음(자체 홍보 배너만).
- 9개 언어(lib/i18n, 키 = 한국어 원문). 번역 누락은 `lib/__tests__/i18nParity.test.ts`가 잡는다.

## 반드시 지킬 규칙 (사용자 지시)
1. **사용자에게 보이는 모든 글은 한국어.** 코드 주석·커밋 메시지도 한국어(변수·함수명만 영어).
2. **커밋·푸시는 사용자에게 먼저 묻는다.** 작업이 끝날 때마다 커밋·푸시 여부를 물어볼 것(사용자가 "커밋 푸시해줘"라고 한 범위만 진행).
3. **코드를 고칠 때마다 커밋 전에 버그 점검 에이전트(`verify-fix`)를 돌린다.** 알람 경로를 건드리면 `alarm-logic`도. 지적을 반영한 뒤 기기(32)에서 확인하고 커밋.
4. **Android 알람은 두 경로**: Expo Notifications + 네이티브 AlarmManager(`modules/mallo-alarm`). 예약·취소·재스케줄 모두 둘 다 처리. 진입점은 `lib/notifications.ts`(scheduleAlarm / cancelAlarmGroup / resyncAlarms)만 쓴다.
5. **워치 연동 고려**: iOS 알림 카테고리 `customDismissAction: true`, Android 알람 알림은 워치로 브릿지되는 별도 알림(7002).
6. **알람 소리 테스트**는 사용자가 허락한 시간에만. 기본은 진동 모드로 테스트.
7. 자격 증명·비밀번호 입력 금지(Apple ID 로그인, 업로드 키 비밀번호는 사용자가 직접). 공개 게시(main 병합·GitHub Pages)는 승인 후.
8. `assets/fonts/`는 커밋도 삭제도 하지 않는다(로컬 iOS 프로젝트가 참조할 수 있음).
9. "내 목소리 알람"은 보류 기능 — `[VOICE_ALARM]`으로 표시돼 있고 꺼져 있다. 사용자가 요청하기 전에는 켜지 않는다(2027-10 무렵 재검토).
10. 세이람은 늘 가볍게: 백그라운드 타이머·폴링을 만들지 않는다(AppState로 앞에 있을 때만).
