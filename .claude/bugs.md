# 버그 이력

## 2026-08-22 · Android 크래시 — CollapsibleCalendar 아래로 당기면 앱 꺼짐

**증상**: 32에서 주간→월간 드래그(아래로 당기기) 시 앱 강제종료 (adb 재현: `input swipe` 후 logcat에 FATAL EXCEPTION).
**원인**: `snapTo` 함수가 Pan 제스처 `onEnd` 워클릿(UI 스레드) 안에서 직접 호출되는데 `'worklet'` 지시어가 없어 UI 스레드에서 "Object is not a function"(com.facebook.jni.CppException)으로 크래시.
**수정**: `snapTo` 본문 첫 줄에 `'worklet';` 추가 — reanimated의 "양쪽 스레드에서 호출 가능한 워클릿 헬퍼" 패턴.
**파일**: `components/calendar/CollapsibleCalendar.tsx`
**재발 감시 포인트**: 리애니메이티드 제스처 콜백(`.onBegin/.onUpdate/.onEnd`) 안에서 호출하는 지역 함수는 전부 `'worklet'`이 있는지, 아니면 `runOnJS`로 감쌌는지 확인. 같은 파일에서 `<GestureDetector gesture={pan}>`으로 이전 값을 그대로 참조해 새로 만든 `Gesture.Race(pan, swipe)`가 실제로 안 붙던 배선 누락도 같이 발견·수정.

## 2026-08-22 · STT 앞부분 발화 유실 — 녹음 버튼 누르고 바로 말하면 인식 안 됨

**증상**: 녹음 버튼을 누르자마자 말하면 앞 부분이 전사(transcript)에서 누락됨. 오디오 파일 자체엔 녹음돼 있지만 실시간 STT 결과에는 안 잡힘.
**원인**: `lib/useVoiceRecorder.ts`의 `start()`가 `recorder.record()`(오디오 녹음, 즉시 시작)를 먼저 호출하고 `startSTT()`(음성인식 시작)는 그 뒤에, 게다가 `startSTT` 내부에 불필요한 300ms 고정 지연(`setTimeout(() => attempt(0), 300)`)까지 있어 STT 엔진이 실제로 듣기 시작하기 전에 사용자가 이미 말을 시작하는 타이밍 갭이 있었음. UI("듣고 있어요" 타이틀 + "말씀해보세요…" 플레이스홀더)는 녹음 시작과 동시에 즉시 "말해도 된다"고 보여줘서 이 갭을 더 키움.
**수정**: (1) `startSTT()`의 선행 300ms 지연 제거, 실패 시에만 120ms 백오프 재시도로 축소. (2) `start()`에서 `startSTT()`를 `recorder.record()`보다 먼저 호출해 갭을 최소화. (3) `expo-speech-recognition`의 `audiostart` 이벤트(엔진이 실제로 오디오 캡처를 시작한 시점)를 구독해 `sttReady` 상태 추가, App.tsx 녹음 오버레이가 `sttReady`가 true가 되기 전엔 "준비 중… / 잠시만요, 인식 준비 중이에요…"를 보여주고, true가 된 뒤에야 "듣고 있어요 / 말씀해보세요…"로 전환 — 근본적인 엔진 초기화 지연(기계적 한계)은 없앨 수 없지만 사용자가 그 타이밍을 시각적으로 알 수 있게 함.
**파일**: `lib/useVoiceRecorder.ts`, `App.tsx`
**재발 감시 포인트**: `ScheduleEditor.tsx`의 "추가" 녹음(`appendVoice`)도 같은 훅을 쓰지만 거긴 "말해도 된다"고 명시적으로 유도하는 UI가 없어 이번엔 손대지 않음 — 나중에 거기서도 같은 불만이 나오면 `appendVoice.sttReady`를 노출해 같은 처리 필요.
