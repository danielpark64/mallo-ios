package com.danielpark.mallo.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.UserManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments

/**
 * 실제로 소리/진동을 내는 포그라운드 서비스. 네이티브 경로가 "진짜 울림"을 담당한다.
 *
 *  - ACTION_RING   : AlarmReceiver가 시작. 모드(soundOn/vibOn)대로 울리고 알림(끄기/5분 후 다시)을 띄운다.
 *                    잠금 상태면 전체화면 AlarmRingActivity가 함께 뜬다(fullScreenIntent).
 *  - ACTION_STOP   : 울림 중지 + 같은 일정의 남은 슬롯(+1/+2분, 스누즈)을 네이티브·Expo 양쪽 모두 취소.
 *  - ACTION_SNOOZE : 위 정리 후 5분 뒤 네이티브 슬롯 3개를 다시 건다(JS 없이도 동작).
 *
 * 한 슬롯은 최대 RING_MAX_MS 동안만 울린다 — 다음 슬롯(+1분)이 이어서 울리므로 사용자가 아무것도
 * 안 해도 총 3번, 각 ~50초. 울림이 끝나도 알림은 남겨(STOP_FOREGROUND_DETACH) 끄기/스누즈를 누를 수 있다.
 */
class AlarmService : Service() {

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var autoStop: Runnable? = null
    private var fade: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val recordId = intent?.getStringExtra(AlarmScheduling.EXTRA_RECORD_ID) ?: ""
        val title = intent?.getStringExtra(AlarmScheduling.EXTRA_TITLE) ?: "말로"
        val body = intent?.getStringExtra(AlarmScheduling.EXTRA_BODY) ?: ""
        val soundOn = intent?.getBooleanExtra(AlarmScheduling.EXTRA_SOUND_ON, true) ?: true
        val vibOn = intent?.getBooleanExtra(AlarmScheduling.EXTRA_VIB_ON, true) ?: true

        when (intent?.action) {
            ACTION_STOP -> {
                val rid = recordId.ifEmpty { currentRinging?.recordId ?: "" }
                stopEverything(rid)
                emit("malloAlarmStopped", rid)
                return START_NOT_STICKY
            }
            ACTION_SNOOZE -> {
                val info = currentRinging
                val rid = recordId.ifEmpty { info?.recordId ?: "" }
                stopEverything(rid)
                scheduleSnooze(rid, title.ifEmpty { info?.title ?: "말로" }, body.ifEmpty { info?.body ?: "" }, soundOn, vibOn)
                emit("malloAlarmSnoozed", rid)
                return START_NOT_STICKY
            }
        }

        // ACTION_RING (기본)
        stopRinging()
        currentRinging = RingingInfo(recordId, title, body, soundOn, vibOn)
        val notif = buildNotification(recordId, title, body, soundOn, vibOn)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notif)
        }
        acquireWakeLock()
        startRinging(soundOn, vibOn)
        emit("malloAlarmRinging", recordId)
        showRingScreen(recordId, title, body, soundOn, vibOn)

        autoStop?.let { handler.removeCallbacks(it) }
        autoStop = Runnable {
            // 이 슬롯은 그만 울리되 알림은 남긴다 — 다음 슬롯이 1분 뒤 이어 울린다.
            stopRinging()
            releaseWakeLock()
            currentRinging = null
            AlarmRingActivity.finishIfShowing()
            stopForeground(STOP_FOREGROUND_DETACH)
            stopSelf()
        }.also { handler.postDelayed(it, RING_MAX_MS) }
        return START_NOT_STICKY
    }

    /**
     * 교대알람처럼 배너가 아니라 "별도의 팝업"(전체화면 AlarmRingActivity)을 띄운다.
     *  - 화면 꺼짐/잠금: 알림의 fullScreenIntent로 시스템이 띄워 주지만, 여기서도 직접 띄워 둘 중 먼저 되는 쪽을 쓴다.
     *  - 화면 켜짐 + 말로가 전면: 앱에 보이는 창이 있으므로 startActivity가 그대로 허용된다.
     *  - 화면 켜짐 + 다른 앱 전면: Android 10+ 백그라운드 액티비티 제한에 걸린다. "다른 앱 위에 표시"
     *    (SYSTEM_ALERT_WINDOW)가 허용돼 있으면 예외로 허용되므로 JS(canDrawOverlays/requestOverlayPermission)에서
     *    한 번 안내한다. 권한이 없으면 조용히 막히고(예외 없음) heads-up 배너만 남는다.
     */
    private fun showRingScreen(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean) {
        try {
            startActivity(AlarmRingActivity.intent(this, recordId, title, body, soundOn, vibOn))
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun stopEverything(recordId: String) {
        autoStop?.let { handler.removeCallbacks(it) }
        autoStop = null
        stopRinging()
        releaseWakeLock()
        currentRinging = null
        AlarmRingActivity.finishIfShowing()
        if (recordId.isNotEmpty()) {
            AlarmScheduling.cancelByRecordId(this, recordId)   // 네이티브 +1/+2분·스누즈 슬롯
            ExpoTwin.clearRecord(this, recordId)               // Expo 쌍둥이(예약·표시 중)
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
        stopSelf()
    }

    // 스누즈는 원장(AlarmStore)에 넣는다 — 재부팅 뒤에도 살아야 하고, 끄기/재동기화 때 recordId로 함께 정리된다.
    private fun scheduleSnooze(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean) {
        if (recordId.isEmpty()) return
        val base = System.currentTimeMillis() + SNOOZE_MS
        // 미리 알림(id#preN)은 "한 번" 울리는 것이 설계라 스누즈도 1슬롯 (정각은 3슬롯)
        val slots = if (AlarmScheduling.isPreRecordId(recordId)) 0..0 else 0..2
        for (slot in slots) {
            val e = AlarmStore.Entry(
                key = AlarmScheduling.snoozeKey(recordId, slot), recordId = recordId,
                triggerAtMs = base + slot * 60_000L, title = title, body = body,
                soundOn = soundOn, vibOn = vibOn,
            )
            AlarmScheduling.arm(this, e)
            AlarmStore.put(this, e)
        }
    }

    private fun startRinging(soundOn: Boolean, vibOn: Boolean) {
        if (soundOn) {
            try {
                mediaPlayer = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    val afd = resources.openRawResourceFd(R.raw.mallo_alarm)
                    setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                    afd.close()
                    isLooping = true
                    prepare()
                    setVolume(FADE_START, FADE_START)
                    start()
                }
                startFade()
            } catch (e: Exception) { e.printStackTrace() }
        }
        if (vibOn) {
            try {
                vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
                } else {
                    @Suppress("DEPRECATION")
                    getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                }
                val pattern = longArrayOf(0, 500, 300, 500, 300, 500, 700)
                // USAGE_ALARM: 무음/진동끔 모드와 무관하게 진동
                val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0), attrs)
                } else {
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(pattern, 0)
                }
            } catch (e: Exception) { e.printStackTrace() }
        }
    }

    // 작게 시작해 몇 초 안에 알람 스트림 볼륨(사용자 설정)까지 올린다
    private fun startFade() {
        val steps = (FADE_MS / FADE_STEP_MS).toInt()
        var step = 0
        val r = object : Runnable {
            override fun run() {
                step++
                val v = (FADE_START + (1f - FADE_START) * step / steps).coerceAtMost(1f)
                try { mediaPlayer?.setVolume(v, v) } catch (_: Exception) {}
                if (step < steps) handler.postDelayed(this, FADE_STEP_MS)
            }
        }
        fade = r
        handler.postDelayed(r, FADE_STEP_MS)
    }

    private fun stopRinging() {
        fade?.let { handler.removeCallbacks(it) }
        fade = null
        try { mediaPlayer?.stop() } catch (_: Exception) {}
        try { mediaPlayer?.release() } catch (_: Exception) {}
        mediaPlayer = null
        try { vibrator?.cancel() } catch (_: Exception) {}
        vibrator = null
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mallo:alarm").apply {
                acquire(RING_MAX_MS + 10_000L)
            }
        } catch (_: Exception) {}
    }

    private fun releaseWakeLock() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
    }

    // 앱(RN)이 살아 있을 때만 알려준다 — 포그라운드 UI 갱신용. 잠금해제 전엔 ReactHost를 건드리지 않는다.
    private fun emit(event: String, recordId: String) {
        if (getSystemService(UserManager::class.java)?.isUserUnlocked == false) return
        try {
            val ctx = (applicationContext as? ReactApplication)?.reactHost?.currentReactContext ?: return
            ctx.emitDeviceEvent(event, Arguments.createMap().apply { putString("recordId", recordId) })
        } catch (_: Throwable) {}
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val ch = NotificationChannel(CHANNEL_ID, "일정 알람 울림", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "일정 시각에 울리는 알람 (소리·진동은 앱이 직접 냅니다)"
            setSound(null, null)     // 소리는 MediaPlayer(알람 스트림)가 담당 — 채널 소리와 겹치지 않게
            enableVibration(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    private fun servicePi(code: Int, action: String, recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean): PendingIntent =
        PendingIntent.getService(
            this, code,
            Intent(this, AlarmService::class.java).apply {
                this.action = action
                putExtra(AlarmScheduling.EXTRA_RECORD_ID, recordId)
                putExtra(AlarmScheduling.EXTRA_TITLE, title)
                putExtra(AlarmScheduling.EXTRA_BODY, body)
                putExtra(AlarmScheduling.EXTRA_SOUND_ON, soundOn)
                putExtra(AlarmScheduling.EXTRA_VIB_ON, vibOn)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    private fun buildNotification(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean): Notification {
        val stopPi = servicePi(10, ACTION_STOP, recordId, title, body, soundOn, vibOn)
        val snoozePi = servicePi(11, ACTION_SNOOZE, recordId, title, body, soundOn, vibOn)
        val fullScreenPi = PendingIntent.getActivity(
            this, 12,
            AlarmRingActivity.intent(this, recordId, title, body, soundOn, vibOn),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val openPi = launch?.let {
            PendingIntent.getActivity(this, 13, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .apply { openPi?.let { setContentIntent(it) } }
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "알람 끄기", stopPi)
            .addAction(android.R.drawable.ic_popup_reminder, "5분 후 다시", snoozePi)
            // 스와이프로 지우기 = 끄기 (Expo 쪽 "닫기도 응답으로 처리"와 같은 의미)
            .setDeleteIntent(stopPi)
            .setFullScreenIntent(fullScreenPi, true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .build()
    }

    override fun onDestroy() {
        autoStop?.let { handler.removeCallbacks(it) }
        stopRinging()
        releaseWakeLock()
        currentRinging = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        data class RingingInfo(val recordId: String, val title: String, val body: String, val soundOn: Boolean, val vibOn: Boolean)
        @Volatile var currentRinging: RingingInfo? = null

        const val CHANNEL_ID = "mallo_alarm_ring"
        const val NOTIFICATION_ID = 7001
        const val ACTION_RING = "com.danielpark.mallo.alarm.RING"
        const val ACTION_STOP = "com.danielpark.mallo.alarm.STOP"
        const val ACTION_SNOOZE = "com.danielpark.mallo.alarm.SNOOZE"

        const val RING_MAX_MS = 50_000L
        const val SNOOZE_MS = 5 * 60 * 1000L
        private const val FADE_START = 0.2f
        private const val FADE_MS = 5_000L
        private const val FADE_STEP_MS = 500L

        fun stop(context: Context, recordId: String?) {
            try {
                context.startService(Intent(context, AlarmService::class.java).apply {
                    action = ACTION_STOP
                    putExtra(AlarmScheduling.EXTRA_RECORD_ID, recordId ?: "")
                })
            } catch (_: Exception) {}
        }
    }
}
