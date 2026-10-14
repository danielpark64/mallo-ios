---
name: android12-stt-silenced
description: Android 12 이하(노트10+)는 앱 녹음기 + 시스템 음성 인식기를 동시에 돌리면 인식기가 무음 처리됨 — 진단 명령과 결론
metadata:
  type: project
---

노트(SM-N976N, Android 12, API 31)에서 말로 앱의 음성 인식이 한 글자도 안 됐던 원인(2026-10-12):
expo-audio 녹음기(uid=앱)와 구글 음성 인식 서비스(com.google.android.tts, 별도 uid)가 동시에 마이크를 열면
Android 오디오 정책이 화면에 떠 있는 앱만 살리고 인식기를 무음 처리한다. 32(A32, Android 13)는 정상.

**진단 명령(녹음 중에 실행)**
```
adb -s <기기> shell dumpsys audio | grep -A3 RecordActivityMonitor
```
→ `pack:com.google.android.tts ... silenced:true` 가 보이면 이 문제. logcat엔 `onStartOfSpeech` 없이 `NO_SPEECH_DETECTED`만 반복된다.
`pm grant RECORD_AUDIO`, 음성 인식 서비스 존재 여부, Mac TTS 볼륨은 원인이 아니었다(먼저 확인하느라 시간 소모).

**Why:** expo-speech-recognition의 녹음 저장(recordingOptions.persist)·audioSource도 Android 13+ 전용이라 12 이하에선 "녹음 파일 + 시스템 STT"가 원천 불가. 그래서 `lib/voiceCapture.ts`에서 API<33이면 녹음 파일을 포기하고 인식만 돌린다.

**How to apply:** Android 12 이하 기기에서 "마이크가 안 된다"는 보고가 오면 권한부터 보지 말고 위 dumpsys로 silenced 여부를 먼저 본다. 녹음 파일까지 꼭 필요하면 온디바이스 Whisper 같은 자체 STT가 필요하다. [[android-note-install]]
