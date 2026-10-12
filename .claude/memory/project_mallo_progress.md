# 말로 개발 진행상황

⚠️ 이 파일은 **말로 앱 전용**입니다. 매 세션 시작 시 반드시 읽고 현재 위치 확인 후 작업할 것.

진행 표기: `[ ]`=미시작 / `[~]`=진행중 / `[x]`=완료

- [x] **1. 녹음/재생** — expo-audio로 녹음, 파일 저장, 재생. 실시간 파형. lib/useVoiceRecorder.ts로 공통화(메인 FAB + 편집기 "추가" 녹음 공유).
- [x] **2. 저장 구조 + 일정 화면** — lib/storage.ts (expo-file-system JSON, records.json + records.bak.json 백업). 달력 탭 + 전체 일정 탭(조회/필터/내보내기). ※sqlite 대신 파일 JSON 채택.
- [x] **3. STT 채택** — 내장 expo-speech-recognition ko-KR 실시간. iOS 세션 끊김 자동 재시작 + 단어별 타임스탬프(segments) 저장 → 상세 화면 구간재생.
- [~] **4. 텍스트 구조화** — lib/parseSchedule.ts 규칙 파서 (lib/__tests__/parseSchedule.test.ts 회귀 테스트). ※LLM(Claude API) 고도화는 미착수.
- [x] **5. 키 매칭 분기** — 같은 시각 ±5분에 기존 일정 있으면 "추가로 붙이기 / 새 일정" 선택. 추가는 appends[] 독립 엔트리(자기 녹음·전사·구간재생 보유).
- [x] **6. 메모장 화면** — components/ScheduleDetail.tsx(상세·구간재생·내보내기) + ScheduleEditor.tsx(수정/삭제/추가모드, 24시간 스크롤 피커, 에디터 내 STT).
- [x] **7. 음성 삭제 + 미리보기** — 문장 끝 "…삭제해줘/지워줘" → 해당 날짜 일정 미리보기 Alert 후 확인 삭제. ※같은 날 여러 건이면 첫 건만 대상(선택 UI 없음).
- [x] **8. 알람 연동** — expo-notifications DATE 트리거 3슬롯(+0/+1/+2분), 끄기/5분 스누즈 액션, 앱 시작 시 resyncAlarms(64개 제한 대응). Android는 모드별 채널(alarm_both/sound/vibe). ※네이티브 AlarmManager 모듈은 이 앱엔 없음(Expo 알림 단일 경로).
- [~] **9. 예외 처리** — 날짜·시간 없으면 저장 거부, 녹음 파일/인식 실패 안내 구현. 수동 입력 폴백은 헤더 ＋ 버튼(편집기)으로 대체. 중복 처리는 5단계로 해결.

**현재 위치** (2026-10-09): 1~9단계 사실상 완료, 규칙 파서로 전체 파이프라인 동작. 2026-10-09 리뷰에서 수정한 것:
- 파서: "밤 12시"→자정, 존재하지 않는 날짜(2월 30일·13월)/25시 거부, "N일 후" 자정 기준, 시간대 단어(저녁/점심)가 내용일 때 보존
- 재생: expo-audio `useAudioPlayerStatus` 적용 → 카드 ⏸ 고착, 구간재생 미정지, 단어 하이라이트 미동작 해결
- 달력이 바깥 selectedDate 변경(저장 후 이동)을 따라가지 않던 문제
- Android 알림 채널 미등록(커스텀 알람음·중요도 미적용) 보완
- records.json 쓰기 중 크래시 대비 백업/복구
- jest-expo 도입: `npm test` 59개 (파서/저장/알림/달력/카드재생/구간재생). ScheduleCard를 components/로 분리
- 수정 내역·순서도·실기기 체크리스트: docs/REVIEW_2026-10-09.md
- 실기기 검증(2026-10-09, Galaxy A32·Android 13 Release): 카드 재생 1-a~d·달력 4-a~c·파서 3-a~c·Android 채널 5·재시작 6·권한 7 전부 ✅. 상세 구간재생 2-a~c는 Android(API 33/31) 단어 타임스탬프 미지원이라 iOS 확인 필요. 발견: Android 정확 알람 권한 없어 알림이 ~1분45초 늦게 옴, 문장 사이 쉼 뒤 STT 두 번째 문장 누락. Xcode 27 빌드용 expo-modules-jsi 56.0.14 업데이트(package-lock).
- 2026-10-12 폰(iPhone 17 Pro Max) 설치: iOS 27 SDK UIScene 미채택 크래시 → plugins/withIosSceneDelegate.js + app.json 매니페스트로 해결. 8+(iOS 16)는 Xcode 27 미지원으로 설치 불가.
- 2026-10-12 상세 범위선택 재설계: 단어 길게 누른 채 끌기 → 범위 띠 → 떼면 구간 재생, 선택 바(다시 듣기/✕). iOS는 scrollEnabled 토글이 진행 중 터치를 취소해 canCancelContentTouches로 잠금(Android는 scrollEnabled). 순수 로직 lib/wordRange.ts. jest 90개. 시뮬레이터 검증 완료, 폰 끌기만 사용자 확인 대기.
- 2026-10-12 폰에서 발견·수정: (1) iOS 음성인식이 단어 시각을 안 주는 녹음(전부 같은 ms, 길이 0) → 저장 시(useVoiceRecorder, 첫/마지막 STT 결과 시각 기준)·표시 시(ScheduleDetail, 전체 길이 기준) 글자 수 비례 합성. (2) 상세 화면이 재생마다 playAndRecord 세션을 써 블루투스 이어폰 무음 → 스피커 모드는 playback 카테고리. (3) 재생 위치를 시계+status로 계산해 소리 유무와 무관하게 단어 하이라이트 진행, duration 0 기기는 durationSec 예비. (4) Modal 안 SafeAreaProvider(닫기/수정이 상태바 위로 올라가던 문제).
- 2026-10-12 UX 재설계: 달력 월/주 보기(lib/prefs.ts에 기본값 저장) + 보이는 기간의 일정 전부를 날짜별 목록으로(날짜 탭 → 해당 묶음으로 스크롤), 카드 내용 2줄 요약, 전체 일정 조회를 검색창+기간 칩(전체/오늘/이번 주/이번 달/직접 선택 휠)으로 교체(lib/filterRecords.ts, components/FilterSheet.tsx), 텍스트/PDF는 미리보기(components/ExportPreview.tsx) 후 내보내기. ScrollPicker는 components/ScrollPicker.tsx로 분리. 마이크는 components/MicIcon.tsx(View로 그린 표준 모양). 편집기 Modal SafeAreaProvider·시간 박스 아이콘 overflow 수정. jest 118개. 폰 미러링으로 월/주·조회·휠 시트·미리보기·편집기 화면 확인. ※Modal 안에선 반드시 SafeAreaProvider를 따로 둘 것(상세·편집기·미리보기 모두 적용됨).
- 2026-10-12 날짜 없는 녹음: 거부 대신 오늘(시간 미정)로 저장 + needsDate 꼬리표(카드·상세 "정하기" → 편집기, 편집기 오늘/내일/모레 빠른 선택). lib/autoDate.ts. 저장된 녹음 절대경로는 loadRecords에서 현재 mallo 폴더 기준으로 재해석(resolveAudioUri, 재설치·폰 이전 대비).
- 2026-10-12 백업·폰 옮기기: lib/backup.ts(Documents/mallo-backups/<말로백업_날짜_시각>/records.json + m4a, 복원은 id 병합·경로 재배치, Android는 SAF 폴더 내보내기/가져오기), components/BackupSheet.tsx. iOS는 UIFileSharingEnabled로 파일 앱에 노출. 복원 후 notifIds 비우고 resyncAlarms.
- 2026-10-12 설정 화면(components/SettingsSheet.tsx): 달력 기본 보기, 백업, 사용설명서(lib/helpContent.ts 10개 항목, HelpSheet), 앱 정보. 헤더 "설정" 버튼. jest 134개.
- 사용자 계획: 정리되면 구글 플레이 출시(한국어 먼저, 이후 같은 앱에서 언어 선택으로 영어 추가). 앱 이름(말로는 임시, 영어 표기+한국에서 읽기 쉬운 것)·아이콘은 더 고민 — 후보는 docs/NAMING_AND_ICON.md에 틈날 때마다 모아 둘 것. 알람은 교대알람 수준 신뢰성 필수(네이티브 AlarmManager 이중 경로 이식 중).

다음 후보:
(a) 규칙 파서 → Claude API 구조화(자유 말투/의도 추출) — 4단계 마무리
(b) 음성 삭제 시 같은 날 여러 일정 중 선택 UI
(c) 카드마다 AudioPlayer 생성 → 일정 많아지면 메모리 부담, 재생 시점에 지연 생성으로 개선
(d) 스누즈 후 앱 재시작 시 resyncAlarms가 원래 시각 기준으로 재등록해 스누즈가 사라짐

- 2026-10-12 08:00: **노트(Android 12) 마이크 인식 안 됨 원인 확정·수정** — 앱 녹음기(expo-audio)와 구글 음성 인식기가 동시에 마이크를 열면 Android 12 이하는 인식기 쪽을 무음 처리(`dumpsys audio` RecordActivityMonitor `silenced:true`). 32(Android 13)는 정상. 수정: `lib/voiceCapture.ts`(API<33이면 녹음 파일 포기) + `useVoiceRecorder` 인식 전용 모드(타이머 상태 합성, uri null) + App/편집기에서 uri 없이 저장 + 녹음 시트·설명서 안내. 노트 실기기 검증 완료(11:41): 인식기 silenced:false, '내일 오후 3시에 치과 예약' 인식·저장·알람 2경로 예약 확인, 테스트 데이터는 pm clear로 정리. 테스트 155개 통과. 알람 이식 에이전트(platform-port)는 사용량 한도로 중단 — modules/mallo-alarm(AlarmRingActivity 전체화면 팝업 포함)·lib/nativeAlarm.ts·notifications.ts 이중 호출·dualAlarm.test.ts는 작성돼 32에 설치됨, 진동 모드 실기기 울림 검증은 미완. 사용자 지시: 알람 테스트는 전부 진동, 알람 울림은 별도 전체화면 팝업(에이전트에 전달). 스토어 조사: 동일 기능 앱 없음, '말로'·'Saylo' 중복, '세이요'는 영문 Sayo 충돌 → docs/NAMING_AND_ICON.md.

- 2026-10-12 15:30: **폰 상세 재생 2건 수정·검증** — (1) 끝까지 들은 뒤 다시 ▶ 무음: `playFrom`이 비동기 `seekTo`를 안 기다리고 play해 끝 지점에서 바로 종료(하이라이트만 시계로 진행) → `await player.seekTo`. (2) 글을 고친 '추가' 엔트리 단어 선택 불가: 편집기가 segments를 비워 칩 미생성 → `lib/wordRange.ts chipsForEntry`(단어 시각 없으면 표시 글을 나눠 길이에 비례 합성), 녹음 없는 항목 안내 문구 분리. 테스트 161개 통과. 폰(iOS) 빌드·설치 후 미러링으로 추가 항목 칩 탭(빨간 하이라이트·⏸)과 두 번째 재생 시 처음부터 하이라이트 진행 확인(소리 자체는 사용자 확인 필요). iCloud 중복 파일은 node_modules·ios·android·modules 전부 `find -name "* [0-9].*" -delete` 후 빌드.
