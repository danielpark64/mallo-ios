# 말로 앱 설계

⚠️ 이 프로젝트는 AlarmApp과 **완전히 별개**입니다.

**프로젝트 경로**: `/Users/daniel/Desktop/daniel-project/Mallo/`
**앱 이름**: 말로 | **번들ID**: com.danielpark.mallo | **scheme**: mallo

## 핵심 흐름
녹음 → STT로 텍스트화 → LLM이 `{일시, 내용, 추가/삭제 의도}` 구조화 추출
→ 일시(datetime)를 키로 일정 저장
- 같은 일시 → 기존 일정에 메모 추가
- 새 일시 → 새 일정 생성
- 일정 + 텍스트 + 녹음파일 함께 보관

## 삭제
- 메모 내용 일부 → 메모장 화면에서 편집
- 일정 전체 → 일정관리 화면 또는 음성("○시 삭제")
- 음성 삭제 시 반드시 삭제 전 미리보기 후 확인받기

## 확정된 기술 선택
- **날짜 인식**: 자유 말투 + LLM (Claude API). "내일 오후 3시" 같은 자연어 인식. LLM 한 번 호출로 일시추출 + 내용정돈 + 의도판단 동시 처리
- **STT**: 미정 → 3단계에서 iOS 내장(expo-speech-recognition) vs 클라우드(Whisper) 비교 후 채택
- **저장**: expo-sqlite
- **녹음**: expo-audio + expo-file-system
- **알람**: 말로 프로젝트 안에서 별도 구현 (AlarmApp 코드 미사용)

## 데이터 구조
```
일정(Schedule)
 ├─ id
 ├─ datetime  ← 키값 (예: 2026-06-10 14:00)
 ├─ 알람등록 여부
 └─ 메모리스트[]
       ├─ id
       ├─ 텍스트
       ├─ 녹음파일 경로
       └─ 생성시각
```

## 빌드 주의사항
- `expo install` 시 `npm_config_legacy_peer_deps=true` 필요
- 빌드 시 `LANG=en_US.UTF-8` 설정 필요 (없으면 pod install UTF-8 오류)
- 네이티브 모듈 추가 시 JS 리로드만으론 안 되고 네이티브 재빌드 필요

## 작업 규칙
- 코드 수정 후 항상 시뮬레이터로 먼저 확인, 폰 업로드는 사용자 요청 시에만
- 항상 Expo v56 문서(https://docs.expo.dev/versions/v56.0.0/) 확인 후 코딩
- 작업 완료 시 커밋/푸시 여부 사용자에게 물어볼 것
