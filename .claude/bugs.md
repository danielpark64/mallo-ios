# 버그 이력

> 최신순. 각 항목의 **상태**가 "미커밋"이면 작업 트리에만 있고 아직 커밋되지 않은 수정이다.

## 2026-10-18 · iPhone — 새로 녹음한 일정 ▶가 무음 (녹음 파일은 있는데 소리가 0.2초)

**상태**: 미커밋
**증상**: 메인 마이크로 만든 11월 일정 2건(13:58·13:59)의 ▶를 눌러도 소리가 안 남. 글·날짜·알람은 정상.
**확인**: 폰 `Documents/mallo`를 devicectl로 가져와 m4a 구조를 봄 — 두 파일 모두 57KB인데 소리 상자(mdat)가 62바이트(0.2초).
records.json의 `uri`·`durationSec`(6·9초)은 정상 → **저장·경로 문제가 아니라 녹음기가 시작 0.2초 만에 멈춘 것**.
같은 폰의 이전 녹음 10개는 모두 정상.
**사용자에게 같은 버그로 보인 이유**: 증상("▶ 해도 소리 안 남")이 10-13 버그(새 일정 마이크가 녹음을 저장 안 함, uri '')와 같다.
원인은 다르지만 사용자 입장에선 "고쳤는데 또" — 그래서 이번엔 원인 수정 + 감지·알림 + 자동 복구를 모두 넣었다.
**원인(유력)**: iOS 오디오 세션 충돌. 녹음기(expo-audio)는 `playAndRecord`+섞기 허용인데, 0.06초 뒤 켜지는 음성 인식기
(expo-speech-recognition)는 기본값으로 `playAndRecord`+**measurement 모드**+섞기 없음으로 세션을 다시 짠다. 이때 블루투스·다른 앱 소리 등
상황에 따라 녹음기가 중단(pause)되거나 멈춘다. 또 expo-audio는 녹음 중 누가 `setAudioModeAsync({allowsRecording:false})`를 부르면
녹음기를 즉시 stop한다(ScheduleDetail의 `resetAudioIdle` 등).
**수정(세 겹)**:
1. 원인: 인식기에 녹음기와 똑같은 세션을 넘김 — `STT_IOS_CATEGORY`(lib/useVoiceRecorder.ts), 처음 켤 때·재시작 때 둘 다.
2. 복구: 녹음 중 녹음기가 멈춘 것을 폴링(100ms)이 두 번 연속 보면 녹음 세션을 다시 켜고 `record()` (최대 3번).
3. 감지: 멈춘 뒤 m4a의 mdat 크기를 읽어(lib/audioCheck.ts) 1초 넘게 녹음했는데 1KB 미만이면 uri를 버리고 `audioLost` →
   글·알람은 저장하고 "녹음 소리가 저장되지 않았어요" 알림(lib/audioLostNotice.ts, 메인·편집기 두 곳).
4. 기존 데이터: 앱 시작 때 무음 녹음의 uri를 비움(lib/healRecordings.ts) → ▶가 글 읽어 주기로 동작.
**파일**: `lib/useVoiceRecorder.ts`, `lib/audioCheck.ts`, `lib/audioLostNotice.ts`, `lib/healRecordings.ts`, `App.tsx`, `components/ScheduleEditor.tsx`, i18n 8개
**테스트**: `audioCheck.test.ts`(폰 파일과 같은 구조), `useVoiceRecorder.test.tsx` ①②③, `healRecordings.test.ts`
**재발 감시 포인트**: "녹음 ▶ 무음" 계열 **4번째**. 녹음 경로를 고칠 때 ① 녹음 중에 `setAudioModeAsync`를 부르는 코드가 생기지 않았는지
(특히 `allowsRecording:false`) ② 인식기 `start()`에 `iosCategory: STT_IOS_CATEGORY`가 빠지지 않았는지 ③ 저장 직전 빈 녹음 검사가
살아 있는지 확인. 증상이 다시 보이면 추측하지 말고 폰 m4a의 mdat 크기부터 볼 것(이 항목의 확인 방법).

## 2026-10-13 · iPhone — 편집기에서 키보드가 내용 칸을 가림

**상태**: 미커밋
**증상**: iPhone 편집기에서 키보드가 올라오면 내용 입력 칸이 키보드에 가려 보이지 않음.
**원인**: 위쪽 칸(날짜·시간·알림)이 화면 공간을 다 차지해, 키보드가 올라온 뒤 내용 칸이 들어갈 자리가 없음.
**수정**: 키보드가 올라오면 날짜·시간·알림 칸을 접고(`kbOpen`), 키보드를 내리는 '입력 완료' 버튼 추가.
**파일**: `components/ScheduleEditor.tsx`
**재발 감시 포인트**: 입력 칸이 화면 아래쪽에 있는 시트·편집기를 새로 만들 때는 키보드가 올라온 상태에서 입력 칸이 보이는지 작은 iPhone 기준으로 확인. 고정 높이 칸이 위에 쌓여 있으면 같은 문제가 난다.

## 2026-10-13 · Android — '폴더에서 가져오기'가 항상 실패

**상태**: 미커밋
**증상**: Android 백업 화면의 '폴더에서 가져오기'가 어떤 폴더를 골라도 실패.
**원인**: SAF(저장소 접근 프레임워크) 주소는 경로 구분자가 `%2F`로 인코딩돼 오는데, `baseName`이 `/`로만 잘라 폴더 이름을 뽑지 못함.
**수정**: `baseName`에서 `decodeURIComponent`로 푼 뒤 `/[/:]/`로 분리.
**파일**: `lib/backup.ts`, `lib/__tests__/backup.test.ts`
**재발 감시 포인트**: Android `content://` 주소를 문자열로 자르는 코드는 전부 인코딩(`%2F`, `%3A`)과 `primary:폴더` 형태의 콜론 구분을 고려했는지 확인. iOS `file://` 경로 기준으로만 짜면 Android에서 같은 실패가 난다.

## 2026-10-13 · 헤더 시계가 최대 59초 늦게 바뀜

**상태**: 미커밋
**증상**: 헤더의 현재 시각이 실제 분이 바뀐 뒤 최대 59초 지나서야 갱신됨.
**원인**: 앱이 켜진 시점부터 고정 60초 간격으로 도는 타이머라, 분 경계와 어긋난 만큼 계속 늦음.
**수정**: 다음 분 경계까지 남은 시간만큼 `setTimeout`을 걸어 분 경계에 맞춰 갱신하도록 변경.
**파일**: `App.tsx`
**재발 감시 포인트**: 시·분·날짜처럼 "경계에서 바뀌는 값"을 화면에 보여줄 때는 고정 간격 `setInterval` 대신 경계 정렬 타이머를 쓴다. 자정에 바뀌는 '오늘' 표시도 같은 계열.

## 2026-10-13 · Android 12 — 말 마친 뒤 인식 글이 사라짐 / 확정 결과가 꼬리 조각만 와서 앞 문장(날짜) 유실

**상태**: 미커밋
**증상**: 말을 마치면 화면에 보이던 인식 글이 사라지거나, 확정 결과로 문장 끝 조각만 들어와 앞부분(날짜 등)이 통째로 빠짐. Android 32(Android 12) 12시 테스트에서 발견.
**원인**: 중간 결과·확정 결과·세션 종료를 받는 대로 덮어써서, 확정 결과가 비었거나 꼬리 조각만 올 때 그때까지 쌓인 글이 지워짐.
**수정**: 전사 병합 규칙을 `lib/transcriptMerge.ts`로 분리(`applyPartial` / `applyFinal` / `applySessionEnd`)하고 테스트 7개 추가.
**파일**: `lib/transcriptMerge.ts`, `lib/__tests__/transcriptMerge.test.ts`, `lib/useVoiceRecorder.ts`
**재발 감시 포인트**: 음성 인식 결과는 기기·OS 버전마다 확정 결과의 형태가 다르다(전체 문장 / 꼬리 조각 / 빈 값). 인식 콜백에서 상태를 직접 덮어쓰지 말고 반드시 `transcriptMerge`를 거칠 것. Android 12 이하는 실기기 재검증 필요.

## 2026-10-13 · 녹음 준비 중 취소하면 화면 없이 마이크만 도는 경합

**상태**: 미커밋
**증상**: 녹음을 시작하자마자 취소하면, 녹음 화면은 닫혔는데 마이크(녹음·인식)는 계속 돌아감.
**원인**: `start()`가 prepare를 기다리는 사이 `cancel()`이 먼저 끝나면, 뒤늦게 깨어난 `start()`가 취소된 줄 모르고 `record()`와 STT를 시작함.
**수정**: `runIdRef` 실행 번호를 두고, 기다림이 끝날 때마다 번호가 바뀌었으면(취소됨) 그만두도록 변경.
**파일**: `lib/useVoiceRecorder.ts`, `lib/__tests__/useVoiceRecorder.test.tsx`
**재발 감시 포인트**: `await` 뒤에 마이크·알람·타이머 같은 부수 효과를 시작하는 비동기 함수는, 기다리는 동안 취소·언마운트가 끼어들 수 있다. `await` 뒤마다 "아직 유효한 실행인가"를 확인하는지 볼 것.

## 2026-10-13 · 한 화면에서 두 번 녹음하면 앞 녹음이 조용히 빠짐 / 두 번째 인식 실패 시 녹음 통째 유실

**상태**: 미커밋 (verify-fix가 발견)
**증상**: 편집기에서 녹음을 한 번 한 뒤 다시 녹음하면 앞 녹음 파일은 안내 없이 버려지고 글만 이어 붙음. 두 번째 인식이 실패하면 녹음이 하나도 남지 않음.
**원인**: 두 번째 녹음을 시작할 때 `setAppendCapture(null)`로 앞 녹음을 지운 뒤 글만 이어 붙임. 새 전사가 비었을 때 되돌릴 방법이 없었음.
**수정**: 다시 녹음하기 전 확인 창 표시, 앞 녹음이 적어 준 글은 새 것으로 교체, 새 전사가 비면 앞 녹음·글 복구(`prevTakeRef`), stop 실패를 try/catch로 처리, 연타 방지(`voiceBusyRef`).
**파일**: `components/ScheduleEditor.tsx`, `components/__tests__/ScheduleEditor.test.tsx`
**재발 감시 포인트**: "녹음 uri/segments가 저장·수정 과정에서 조용히 빠진다" 계열의 **3번째**(과거 `6105101`, `52369d8` 참고). 녹음을 버리는 경로는 반드시 (1) 사용자 확인을 거치고 (2) 새 것이 성공한 뒤에만 앞 것을 버릴 것. 녹음 상태를 `null`로 초기화하는 코드를 추가할 때마다 이 항목을 다시 볼 것.

## 2026-10-13 · iPhone — 새 일정 화면 마이크로 만든 일정에 ▶ 재생 버튼 없음

**상태**: 미커밋
**증상**: '＋ 새 일정' 편집기의 마이크로 말해 만든 일정은 상세 화면 메인에 ▶가 없고, '내용 추가' 엔트리에만 있음. 사용자는 "수정 로직이 건드린 것 같다"고 의심함.
**원인**: 편집기의 새 일정/수정 마이크(`toggleStt`)는 글만 받아 적고 녹음을 저장하지 않았음(`uri: ''`, `transcript: ''`). 수정 저장(`handleEditorSave`)이 uri를 지우는 것은 아님 — 폰의 `records.json`을 devicectl로 가져와 확인.
**수정**: `captureMode = appendMode || !record`로 바꿔 새 일정도 `useVoiceRecorder`로 녹음+전사를 캡처하고, `EditorResult.capture`로 넘겨 `handleEditorSave`의 새 일정 분기에서 `persistAudio`로 메인 녹음을 저장. 기존 일정 수정은 원래 녹음을 보호하기 위해 글만 받음.
**파일**: `components/ScheduleEditor.tsx`, `App.tsx`, `components/__tests__/ScheduleEditor.test.tsx`
**재발 감시 포인트**: 마이크 버튼이 있는 화면을 새로 만들 때 "글만 받는가, 녹음도 저장하는가"를 명시적으로 정할 것. 녹음이 사라진 것처럼 보이면 추측하지 말고 기기의 `records.json`에서 `uri`가 처음부터 비어 있었는지, 중간에 지워졌는지부터 확인.
