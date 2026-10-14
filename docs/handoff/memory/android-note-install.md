---
name: android-note-install
description: 노트(Galaxy Note10+ 5G, SM-N976N, Android 12, adb R3CM909QRGK)는 `adb install`이 무한 대기함 — push 후 `pm install`로 설치해야 한다
metadata:
  type: project
---

노트(SM-N976N, Android 12, adb 시리얼 R3CM909QRGK)에 75MB APK를 `adb -s R3CM909QRGK install -r app.apk`로 넣으면 끝나지 않고 멈춘다(2026-10-12, 두 번 재현). 32(A32)는 같은 명령으로 30초 안에 끝남.

**되는 방법**
```
adb -s R3CM909QRGK push android/app/build/outputs/apk/release/app-release.apk /data/local/tmp/mallo.apk
adb -s R3CM909QRGK shell pm install -r /data/local/tmp/mallo.apk
adb -s R3CM909QRGK shell am start -n com.danielpark.mallo/.MainActivity
```
설치 직후 마이크 권한 다이얼로그가 떠서 `pm grant com.danielpark.mallo android.permission.RECORD_AUDIO`와 `POST_NOTIFICATIONS`를 미리 주면 자동화가 편하다.

**Why:** 설치가 멈춘 줄 모르고 10분 넘게 기다렸음. [[ios-device-build-xcode27]]처럼 기기별 설치 경로 메모.

**How to apply:** 노트에 설치할 때는 처음부터 push + pm install. android-build 전담반 문서(~/.claude/agents/android-build.md)엔 노트가 없으니 추가 후보.
