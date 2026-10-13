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

- 2026-10-12 17:00: **다크/라이트/시스템 테마 + 글자 크기 4단계(0.88/1/1.3/1.45)** — `lib/theme.tsx`(ThemeProvider/useTheme/useFontScale/useThemeSetting, prefs.json 저장), `lib/colors.ts` DARK/LIGHT 팔레트(+onAccent), `components/AppText.tsx`(fontSize·lineHeight에 배율, OS 배율 상한 1.5). 11개 화면을 `makeStyles(C)`+`useMemo`로 일괄 변환, react-native Text → AppText. 글자에 맞춰 커지는 것: 휠 줄 높이(usePickHeight), 달력 날짜 원(상한 42), 카드 시간 칸 폭, 검색·편집기 입력창. 큰 글자 레이아웃 수정: 헤더 시계 축소·버튼 고정, 달력 기간 라벨 한 줄 축소+flex, 설정 세그먼트 세로 배치, 결과 줄 줄바꿈, 녹음 시트 배경 테마색. 폰(라이트+아주 크게: 달력·상세·내용 추가)·32(설정·달력·전체 일정·필터·편집기·상세) 스크린샷 확인. 테스트 169개. 이름 2차 조사(Malnote·Sayrim 추천) → docs/NAMING_AND_ICON.md.

- 2026-10-12 17:40: **미리 알림**(10분·30분·1시간·하루 전=전날 20시, 복수 선택, 정각 켜기/끄기) — `lib/reminders.ts`(시각·문구·식별자 `id#preN`·말로 추출), parseSchedule에 remindBefore, notifications.scheduleAlarm opts, 설정 기본 미리 알림(prefs.defaultRemind), 편집기 알림 칩, 카드/상세 표시, 설명서. 네이티브 모듈: recordIdFromKey가 `_preN` 인식, cancelKeys가 base `#pre*`까지, 미리 알림 스누즈 1슬롯, ExpoTwin pre 식별자. JS `cancelAlarmGroup`(삭제·편집 시 일정 단위 정리). 32 실측: 하루 전 20:00·08:30·08:50·09:00~02 네이티브+Expo 양쪽 예약, 삭제 시 0건. **iPad 지원 켬**(supportsTablet, TARGETED_DEVICE_FAMILY 1,2), 달력 7칸 폭 측정 기반(세로에서 토요일 사라짐 수정), 본문 maxWidth 760. 큰 글자 카드 세로 배치. `lib/crashLog.ts`(JS 치명 오류 → Documents/mallo/last-error.txt). 테스트 190개.

- 2026-10-12 17:50: 미리 알림 보강 — 상세 화면 알림 칩(즉시 저장·재예약 `handleAlarmChange`), 하루 전 미리 알림을 전날 달력 빈 점(`preMarkedDays`)·전날 목록 점선 줄(`components/PreAlarmRow.tsx`, `lib/dateUtils.ts` preAlarmItems/mergePreAlarms)로 구분 표시. 32 실측(점선 줄·배지 확인, 삭제 시 알람 0건). 테스트 194개. 다음: 커밋 확인 → 영문 작업.

- 2026-10-12 18:30: **영문화 완료(미커밋)** — lib/i18n(키=한국어 원문, en.*.ts 사전 ~330항목, LanguageProvider/useT/t, lang.ts 분리), 설정 › 화면 › 언어(시스템/대한민국/English), 날짜 포맷 영어, 영어 날짜 파서 lib/parseScheduleEn.ts(57케이스), STT en-US 전환. **이름 확정: SayRam(세이람)** — app.json name, Android values/values-ko strings, iOS Info.plist+ko.lproj, 앱 안 제목·알림 제목·내보내기·백업 접두 적용. 테스트 257개 통과. 남은 것: 영어 모드 32 화면 확인 → 커밋 확인 → 아이콘 시안(SayRam) → 네 기기 빌드 → 스토어 준비. 한도 끊기면 여기서 이어서.

- 2026-10-12 18:50: 한도 직전 상태 — 영어 모드 32 확인 완료(요일 라벨·묶음 제목 언어 갱신 수정). i18n 9개 언어 구조(lib/i18n/lang.ts LANGS·STT_LOCALE·langFromLocale, dicts.ts, 빈 사전 ja/zh-Hans/zh-Hant/es/fr/de/pt.ts), 설정 언어 세그먼트 전체 언어·감싸기. **백그라운드 에이전트 3개 진행 중**: ①ja/zh 사전 ②es/fr/de/pt 사전 ③parseScheduleIntl(7개 언어 파서·dateUtils/reminders 포맷). 아이콘 시안 D/E, H/I 사용자 선택 대기. **미커밋**: 영문화+이름 SayRam(커밋 승인 대기). 재개 시: 에이전트 결과 확인(없으면 그 작업 직접 마무리) → tsc/jest → 커밋 승인 요청 → 아이콘 적용 → 4기기 빌드.

- 2026-10-12 21:50: **다국어 9개 언어 완료(미커밋)** — 사전 ja/zh-Hans/zh-Hant/es/fr/de/pt 각 290키, `lib/parseScheduleIntl.ts` 표 기반 파서(7개 언어)+formatDisplayIntl, dateUtils/reminders 언어별 포맷, STT_LOCALE 표. dateUtils/notifications의 t()가 DICTS 전체 참조. 아이콘 I 적용(assets/icon.png, android mipmap webp 전부, iOS 1024). 테스트 344개. 32 빌드 중 → 설정 화면 확인 → 커밋 승인 요청 → 4기기 빌드.

- 2026-10-13 00:10: 다국어·이름·아이콘 **커밋·푸시 완료**(1b4cfd2, 1494e7a). 네 기기 빌드 진행 중(32·노트 Android, 미니·폰 iOS). 다음 후보: 홈 화면 아이콘 확인, Google Play 출시 준비(릴리스 키스토어·개인정보처리방침·데이터 안전·권한 사유·스크린샷 9개 언어), KIPRIS 상표 조회(사용자), 알람 모듈 진동 실기기 검증(32).

- 2026-10-13 04:10: **지난 일정 접기**(달력·전체 일정 탭, '지난 일정 N건 보기' 토글, 검색·필터 중엔 접지 않음, 접힌 상태 빈 문구 '앞으로 올 일정이 없어요') — `lib/dateUtils.ts` isPastItem/collapsePast, 테스트 346개. 32 확인 완료. 전체 일정은 30건씩 펼침(PAST_PAGE). **커밋·푸시 완료 d4be4e7**. 32·노트 설치, 미니·폰 iOS 빌드 중.

- 2026-10-13 04:30: **배터리·시스템 부담 점검·수정(미커밋)** — 녹음 상태 폴링을 녹음 중에만(useVoiceRecorder 자체 폴링 100ms), 카드 플레이어를 앱 공용 하나로(`lib/sharedPlayer.tsx`, 백그라운드 시 정지), 헤더 시계 타이머 AppState 연동. 큰 글자에서 시계를 제목 아래에 항상 표시. 겹친 시각 토큰 제거(parseSchedule). assets/fonts는 iOS 리소스라 삭제 금지(복구). 32·노트·미니 설치 확인(폰 제외). 테스트 348개. **11:53 cron 예약**: 12:00~12:30 알람·음성 인식 실기기 테스트(소리 허용 창). caffeinate 12:40까지.

- 2026-10-13 05:10: **Google Play 제출 자료 준비(미커밋)** — store-assets/(listing-ko/en, icon-512, feature-graphic 1024×500, screenshots 8장 1350×2400, release-notes-1.0.0, keystore.properties.example), docs/privacy.html·privacy-en.html, docs/PLAY_CONSOLE_GUIDE.md(콘솔 답안·권한 신고·데이터 보안·테스터 12명×14일). 빌드: 인터넷·저장소 권한 제거(app.json blockedPermissions + 매니페스트), plugins/withAndroidReleaseSigning.js·withLocalizedAppName.js, versionCode 1, AAB 빌드 확인(debug 서명). 실기기에서 찾은 버그 수정: SAF 주소 baseName(폴더에서 가져오기 항상 실패), 날짜 미정 카드 흐림·종 아이콘. 스크린샷은 노트에 예시 백업 가져오기로 촬영 후 pm clear(알람 0 확인). **남은 것**: 12시 테스트 때 32에서 한국어 녹음 시트 스크린샷(02_speaking) 촬영 → store-assets/screenshots/02_speaking.png(9:16 패딩). 사용자 결정 대기: 패키지명(com.danielpark.mallo 유지 vs sayram), 업로드 키 생성, main 병합+Pages, 데이터 보안 신고 방식. 7개 언어 등록 문구는 백그라운드 에이전트 작성 중.

- 2026-10-13 05:40: **플립·워치 대응(교대알람 참조, 미커밋)** — 교대알람과 비교해 빠진 3가지 이식: ①Wear OS: 서비스(상시) 알림은 워치로 브릿지 안 됨 → 알림을 둘로 분리(서비스 알림 LOW 채널 `mallo_alarm_service` id 7001 + 사용자용 알람 알림 HIGH `mallo_alarm_alert(_vib)` id 7002, 끄기/5분 후 버튼·deleteIntent=끄기, 워치로 브릿지) ②플립 커버 화면: DisplayListener로 커버 디스플레이 지정 실행(setLaunchDisplayId)+2.5초 재실행+커버에서 키가드 해제, AlarmRingActivity 3단계 축소 레이아웃, 오버레이 권한 있으면 FSI 생략(경쟁 방지) ③네이티브 버튼 글자 현지화(`AlarmLabels`, JS `setNativeAlarmLabels`), 설정 › 알람 › '알람 화면 항상 띄우기'(오버레이 권한). iOS 알림 액션은 opensAppToForeground=false(잠금화면·애플워치에서 바로 끄기). **플립·워치 실기기 미검증**(플립 미연결, 워치 없음). 12시 테스트에서 확인할 것 추가: 알림이 2개(조용한 '알람이 울리는 중' + 알람 알림)로 뜨는지, 끄면 둘 다 사라지는지, 32는 오버레이 켜짐이라 울림 화면이 직접 뜨는지, 노트는 오버레이 꺼짐이면 FSI 경로.

- 2026-10-13 12:30: **12시 실기기 테스트 완료(미커밋)** — 32(Android 13, 오버레이 켬): 미리 알림 12:00 정시·화면 꺼짐에서 울림 화면, 알림 2개(7002 알람/7001 서비스), 5분 후 다시 → 1슬롯만 재울림, 정각 12:10 끄기 → +1·+2분 네이티브·Expo 모두 취소, 소리 재생(MediaPlayer USAGE_ALARM started) 확인, 미리 알림 미룬 뒤 일정 삭제 → 대기 0건. 노트(Android 12, 오버레이 끔): 12:15 화면 꺼짐에서 깨어나 울림 화면(FSI), 끄기 후 대기 0건. 음성: 한국어·영어·일본어 날짜 추출. **찾아 고친 것**: ①말 마친 뒤 기다리면 글이 사라짐/확정 결과가 꼬리만 와서 앞 문장 유실 → `lib/transcriptMerge.ts`(+테스트 7) 32에서 한·영 재검증 ②헤더 시계가 최대 59초 늦게 바뀜 → 분 경계 정렬 타이머 ③접근성 이름이 한국어 고정(설정 테마·글자 크기·언어·기본 미리 알림, 백업 복원·삭제) → 번역, 편집기 휴지통 버튼에 이름 추가. 테스트 358개. 테스트 일정 전부 삭제, 32 글자 크기 '크게'·stayon 원복. 최신 빌드 32·노트 설치, 미니 iOS 설치 진행. 남은 한계: 문장 사이를 1초쯤만 쉬면 인식기 재시작 틈에 뒤 문장이 빠질 수 있음. 미검증: 플립·워치, 재부팅 후 유지, 폴더 내보내기 왕복. 다음: 커밋·푸시 승인 → 패키지명 결정·업로드 키·Pages.

- 2026-10-13 17:00: **폰 사용 피드백 4건 수정(미커밋)** — ①편집기에서 키보드가 내용 칸을 가림 → 키보드가 올라오면 날짜·시간·알림 칸을 접고 '입력 완료' 버튼 표시(`kbOpen`) ②기존 카드 '내용 추가' 녹음 중 파형·글이 안 보임 → `components/Waveform.tsx`로 분리해 편집기에도 표시, 입력 칸에 실시간 글(liveText) ③삭제가 깊음 → 상세 화면 상단 휴지통 + 카드 길게 누르기 메뉴(수정/삭제), 확인 창 공용 `confirmDelete` ④녹음 시작 지연 → 인식기 시작 지연 300→60ms(`STT_START_DELAY_MS`, 32 실측 녹음기 시작 후 165ms), 훅 `listening`('start' 이벤트)로 시트 제목 '준비 중…'→'🎙 지금 말씀하세요'. 테스트 362개. 32 화면 확인, 노트·폰·미니 설치. 폰 실사용 확인은 사용자 몫. **사용자 아이디어(미결정)**: 알람 소리를 해당 메모 녹음 앞부분으로.

- 2026-10-13 17:40: **새 일정 화면 마이크 녹음 저장(미커밋)** — 폰에서 "추가엔 ▶ 있는데 메인엔 없음" 보고. 원인: 새 일정 편집기 마이크가 글만 받아 적음(uri ''), 수정 로직 문제 아님(폰 records.json을 devicectl로 가져와 확인). 수정: `captureMode = appendMode || !record`, EditorResult.capture → handleEditorSave에서 persistAudio. 기존 일정 수정 마이크는 글만(원래 녹음 보호). verify-fix 지적 반영: 다시 녹음 확인 창·앞 녹음 교체/복구(prevTakeRef), 정지 실패·연타 방지, 녹음 준비 중 취소 경합(runIdRef), 녹음 시작·삭제 시 공용 재생기 정지. 테스트 368개. 폰·미니·32·노트 설치, 사용자 폰에서 ▶ 확인("수정 잘 되었어"). 버그 이력 `.claude/bugs.md` 신규(7건). 남은 의심(미수정): 알림 칩 직후 삭제 시 재예약 경합, iOS Alert 연쇄(길게 누르기 → 삭제 확인), 저장 연타 중복 생성. 다음: 커밋·푸시 승인.

- 2026-10-13 18:00: **내 목소리 알람(미커밋)** — 기본은 기존 알람음, 설정 › 알람 › 알람 소리(기본 알람음/내 목소리, prefs.voiceAlarm)가 새 일정 기본값, 일정마다 편집기·상세의 '🎙 내 목소리' 칩(record.voiceAlarm). 녹음 있는 일정·소리 모드·지원 기기에서만 칩 표시. `lib/voiceAlarm.ts`(voiceUriOf/prepareVoiceAlarm/removeVoiceAlarm/resetVoiceAlarms), scheduleAlarm opts.voiceUri(호출 6곳+resync). Android: `AlarmVoice.kt`(device-protected prefs 일정 id→파일), AlarmService startVoiceCycle(알람음 2.5초→녹음 앞 10초×2 반복, LoudnessEnhancer, 실패 시 fallbackToChime). iOS: 신규 로컬 모듈 `modules/mallo-voice-sound`(m4a→Library/Sounds/voice_<id>.wav, 알람음 3초+목소리×2, 28초 이하; pod install은 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 필요). 32 실측: 17:30 정시 알람음→목소리 전환, 끄기 시 정지·재알림 0. alarm-logic 지적 반영(재생 중 실패 무음, 음성 삭제 경로 정리, 지난 일정 iOS 소리 파일 정리, resync 순서). 테스트 377개. **아이폰 실제 울림 미검증**(사용자 확인 필요). 알려진 기존 문제(미수정): 네이티브 스누즈 후 5분 안에 앱 콜드 스타트하면 resync가 스누즈를 지움.

- 2026-10-13 19:00: **커밋·푸시 f8037dc**(내 목소리 알람·플립/워치·배터리·Play 자료·피드백 수정). 그 뒤 **내 목소리 알람 보류**(사용자 결정: 효용 대비 비효율, 1년 뒤 재검토, 그때 사용자가 요청) — `VOICE_ALARM.enabled=false`, 관련 코드 전부 `[VOICE_ALARM]` 표시, iOS 모듈 `platforms: []`로 링크 제외(pod install 반영), 설명서 문단 주석 보존. 설정 "모든 일정에 적용 + 일정별 예외" 로직(voiceAlarmOn/voiceAlarmToStore)은 남아 있음. **전 기능 테스트**: 32(직접, 전 항목 통과)·노트(에이전트, 13항목 통과, 알람은 진동)·미니(실행·화면만). 찾아 고침: 7개 언어 번역 누락 22건(+자동 테스트 i18nParity), 백업 안내의 옛 이름 '말로', 카드 미리 알림 두 줄, 지난 일정 버튼 접근성 이름, 내용 추가 머리글 오전/오후, 아주 큰 글자 편집기 내용 칸 최소 높이. 설명서 갱신(말하기 신호·새 일정 녹음·입력 완료·삭제 2경로·아이콘 뜻, '7일 재설치' 문구 삭제). Play: AAB 빌드 확인(55MB, debug 서명), 권한에 INTERNET 없음, 02_speaking 재촬영, PLAY_CONSOLE_GUIDE 10~12절. 테스트 389개. **미수정 경미 문제**: 설정에서 테마 바꾼 직후 상태 표시줄 아이콘 색, 버튼 없는 알림창의 "OK", 영어 설정 칩 글자 크기 불균일, 텍스트 내보내기 빈 줄, 울림 화면 24시간제 표기, 네이티브 스누즈 후 콜드 스타트 시 스누즈 유실. **사용자 결정 대기**: 패키지명(sayram 권장), 업로드 키, main 병합+Pages, 미커밋분 커밋.
