@AGENTS.md

# 프로젝트: 말로 (Mallo)

이 프로젝트는 **AlarmApp과 완전히 별개인 독립 앱**입니다.
- 앱 이름: 말로
- 번들ID: com.danielpark.mallo
- 경로: /Users/daniel/Desktop/daniel-project/Mallo/

## 앱 개요
음성 녹음으로 일정·메모를 관리하는 앱.
- 녹음 → STT → LLM이 `{일시, 내용, 추가/삭제 의도}` 추출 → 일시를 키로 일정 저장
- 같은 일시면 기존 일정에 메모 추가, 없으면 새 일정 생성
- 저장: expo-sqlite / 녹음: expo-audio + expo-file-system / 날짜인식: Claude API (자유 말투)

## 작업 완료 후 규칙
- 작업이 끝날 때마다 항상 커밋 및 푸시 여부를 사용자에게 물어볼 것

## 개발 진행 상황
항상 memory/project_mallo_progress.md 를 먼저 읽고 현재 위치를 확인한 뒤 작업할 것.
