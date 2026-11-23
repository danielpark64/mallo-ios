package com.danielpark.mallo.alarm

/**
 * 알람 소리 표(네이티브 쪽). JS 표 lib/alarmSounds.ts(TONE_IDS)와 id가 같아야 한다.
 *  - "default" = 지금까지 쓰던 소리(res/raw/mallo_alarm.wav)
 *  - 나머지 = res/raw/snd_<id>.m4a (29초 이하, 울리는 동안 반복 재생)
 * R.raw를 직접 참조한다 — 이름으로 찾으면(getIdentifier) 릴리스 빌드의 리소스 줄이기가 파일을 지울 수 있다.
 * 같은 파일을 Expo 알림 채널(보조 경로)도 이름(snd_<id>)으로 찾아 쓴다.
 */
object AlarmTones {
    const val DEFAULT = "default"

    fun rawRes(id: String?): Int = when (id) {
        "digital_beep" -> R.raw.snd_digital_beep
        "bell_march" -> R.raw.snd_bell_march
        "old_clock" -> R.raw.snd_old_clock
        "marimba" -> R.raw.snd_marimba
        "gentle_piano" -> R.raw.snd_gentle_piano
        "music_box" -> R.raw.snd_music_box
        else -> R.raw.mallo_alarm // 'default'·모르는 값(옛 원장 등)은 기본 소리
    }
}
