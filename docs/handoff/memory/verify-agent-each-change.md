---
name: verify-agent-each-change
description: 세이람 코드를 고칠 때마다 커밋 전에 버그 점검 에이전트(verify-fix)를 돌려 확인
metadata:
  type: feedback
---

코드를 수정할 때마다 커밋 전에 버그 점검 에이전트(verify-fix, 필요하면 alarm-logic)를 돌려 인접 흐름까지 확인한다. 2026-10-14 사용자 지시: "수정시마다 버그 에이전트 돌려서 확인해줘".

**Why:** 이전에도 verify-fix가 "다시 녹음 시 앞 녹음 유실", "긴 글 TTS 거부" 같은 확정 버그를 커밋 전에 잡아냈다. 사용자는 실기기에서 문제를 발견하는 것보다 미리 잡히길 원한다.

**How to apply:** 수정 → tsc/jest → verify-fix 에이전트(백그라운드, 읽기 전용) → 지적 반영 → 기기 확인 → 커밋·푸시 순서. 알람 경로를 건드리면 alarm-logic도 함께. 관련: [[continue-after-limit]]
