---
name: voice-alarm-deferred
description: 세이람 "내 목소리 알람"은 구현됐지만 상용에서 꺼 둠 — 2027-10 무렵 재검토
metadata:
  type: project
---

"내 목소리" 알람(알람 소리를 그 일정 녹음 앞부분으로)은 2026-10-13에 Android·iOS 모두 구현하고 32에서 울림까지 확인했지만, 사용자가 "효능감에 비해 비효율적"이라며 **상용에서는 빼고 코드는 표시만 해 남기기**로 결정했다. "일년 지나서 적용하자" → 2027-10 무렵 다시 검토.

**Why:** 지금 넣기엔 복잡도 대비 효용이 낮다는 사용자 판단. 코드를 지우지 않은 것은 나중에 바로 되살리기 위해서다.

**How to apply:** 관련 코드는 전부 `[VOICE_ALARM]`으로 검색된다. 스위치는 `lib/voiceAlarm.ts`의 `VOICE_ALARM.enabled`(false). iOS 모듈 `modules/mallo-voice-sound`는 `expo-module.config.json`의 `platforms: []`로 링크에서 빠져 있다. 되살리는 순서는 그 폴더 README.md. 사용자가 먼저 말하기 전에는 다시 켜거나 스토어 문구에 넣지 말 것. 아이폰 실제 울림은 끝내 검증하지 못했다.
