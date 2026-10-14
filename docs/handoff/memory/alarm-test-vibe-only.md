---
name: alarm-test-vibe-only
description: 기기 알람 테스트는 사용자가 따로 지시할 때까지 전부 진동 모드로만 (2026-10-12 지시)
metadata:
  node_type: memory
  type: feedback
  originSessionId: b38eecc0-d7de-4687-b394-1ee950adba3f
  modified: 2026-10-11T22:56:11.576Z
---

2026-10-12 사용자 지시: "테스트는 내가 별도의 지시가 있기 전까지는 전부 진동으로 해줘."
기기(폰·32·노트)에서 알람을 울려 보는 테스트는 alarmMode 'vibe'(진동, 소리 없음)로만 예약한다.

**Why:** 새벽 시간대에 작업하는 일이 많아 소리 알람이 울리면 안 된다. Mac 볼륨도 최소(3)로 둔다 — [[ios-device-build-xcode27]] 참고.

**How to apply:** 테스트 일정을 만들 때 편집기의 알람 방식을 진동으로 고르거나, 저장 데이터의 alarmMode를 'vibe'로 둔다. 소리 모드 테스트가 필요하면 먼저 사용자에게 묻는다. 백그라운드 에이전트(alarm-test, platform-port 등)에 알람 테스트를 맡길 때도 이 지시를 프롬프트에 반드시 넣는다. 사용자가 "소리도 테스트해"라고 하면 이 메모를 갱신한다.
