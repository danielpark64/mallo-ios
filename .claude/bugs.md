# 버그 이력

## 2026-08-22 · Android 크래시 — CollapsibleCalendar 아래로 당기면 앱 꺼짐

**증상**: 32에서 주간→월간 드래그(아래로 당기기) 시 앱 강제종료 (adb 재현: `input swipe` 후 logcat에 FATAL EXCEPTION).
**원인**: `snapTo` 함수가 Pan 제스처 `onEnd` 워클릿(UI 스레드) 안에서 직접 호출되는데 `'worklet'` 지시어가 없어 UI 스레드에서 "Object is not a function"(com.facebook.jni.CppException)으로 크래시.
**수정**: `snapTo` 본문 첫 줄에 `'worklet';` 추가 — reanimated의 "양쪽 스레드에서 호출 가능한 워클릿 헬퍼" 패턴.
**파일**: `components/calendar/CollapsibleCalendar.tsx`
**재발 감시 포인트**: 리애니메이티드 제스처 콜백(`.onBegin/.onUpdate/.onEnd`) 안에서 호출하는 지역 함수는 전부 `'worklet'`이 있는지, 아니면 `runOnJS`로 감쌌는지 확인. 같은 파일에서 `<GestureDetector gesture={pan}>`으로 이전 값을 그대로 참조해 새로 만든 `Gesture.Race(pan, swipe)`가 실제로 안 붙던 배선 누락도 같이 발견·수정.
