---
name: continue-after-limit
description: 사용량 한도로 끊기면 한도 복구 후 사용자 말 없이도 하던 작업을 끝까지 이어간다 (2026-10-12 지시)
metadata:
  node_type: memory
  type: feedback
  originSessionId: b38eecc0-d7de-4687-b394-1ee950adba3f
  modified: 2026-10-12T08:33:46.274Z
---

2026-10-12 사용자 지시: "작업하다 세션 한도가 다 되면 다시 한도가 생긴 후에 별다른 말 없어도 작업을 계속 이어가서 최종까지 끝내줘."

**Why:** 긴 작업(빌드·기기 검증·여러 기능)을 하다 한도에 걸리면 중간 상태로 멈추는 일이 잦았고, 매번 "계속해"라고 말하는 걸 원치 않음.

**How to apply:** 한도 복구 후 재개되면 진행 메모(`.claude/memory/project_mallo_progress.md` 현재 위치)와 마지막 보고를 기준으로 남은 단계를 그대로 이어서 완료까지 진행한다. 단, 커밋·푸시는 [[alarm-test-vibe-only]]처럼 기존 규칙대로 사용자 확인을 받는다(CLAUDE.md). 백그라운드 에이전트가 한도로 죽었으면 그 작업도 직접 마무리한다.
