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

다음 후보:
(a) 규칙 파서 → Claude API 구조화(자유 말투/의도 추출) — 4단계 마무리
(b) 음성 삭제 시 같은 날 여러 일정 중 선택 UI
(c) 카드마다 AudioPlayer 생성 → 일정 많아지면 메모리 부담, 재생 시점에 지연 생성으로 개선
(d) 스누즈 후 앱 재시작 시 resyncAlarms가 원래 시각 기준으로 재등록해 스누즈가 사라짐
