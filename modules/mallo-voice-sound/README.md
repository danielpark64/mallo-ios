# mallo-voice-sound — [VOICE_ALARM] 보류된 기능

"내 목소리" 알람(알람 소리를 그 일정의 녹음 앞부분으로)의 iOS 쪽 모듈입니다.
녹음(m4a)을 알림 소리로 쓸 수 있는 wav로 바꿔 `Library/Sounds/voice_<id>.wav`에 둡니다.

**지금은 상용 빌드에서 빠져 있습니다** (2026-10-13 결정, 1년 뒤인 2027-10 무렵 다시 검토).
`expo-module.config.json`의 `"platforms"`가 `[]`라서 앱에 링크되지 않습니다.

다시 켜는 순서
1. 이 폴더 `expo-module.config.json`의 `"platforms"`를 `["ios"]`로
2. `cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`
3. `lib/voiceAlarm.ts`의 `VOICE_ALARM.enabled`를 `true`로
4. `lib/helpContent.ts`의 `[VOICE_ALARM]` 주석 문단을 되살리고 9개 언어 번역 확인

관련 코드는 저장소 전체에서 `[VOICE_ALARM]`으로 검색됩니다.
