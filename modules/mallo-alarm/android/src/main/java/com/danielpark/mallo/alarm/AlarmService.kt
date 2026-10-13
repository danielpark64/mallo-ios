package com.danielpark.mallo.alarm

import android.app.ActivityOptions
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.audiofx.LoudnessEnhancer
import java.io.File
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.UserManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.Display
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
 * 안 해도 총 3번, 각 ~50초. 울림이 끝나도 "알람 알림"은 남아 끄기/스누즈를 누를 수 있다.
 *
 * 알림은 두 개다 (교대알람에서 확인한 제약 때문):
 *  - 서비스 알림(NOTIFICATION_ID): 포그라운드 서비스가 반드시 띄워야 하는 상시 알림. 상시(ongoing) 알림은
 *    Wear OS 워치로 브릿지되지 않는다 → 조용한 채널에 두고 눈에 덜 띄게 한다.
 *  - 알람 알림(ALERT_ID): 사용자가 실제로 보는 알림(헤드업·잠금화면·끄기/5분 후 버튼). 상시가 아니라서
 *    **워치로 브릿지**되고, 워치에서 버튼을 누르거나 닫으면 폰의 이 서비스로 그대로 들어온다.
 *
 * 폴더블(갤럭시 Z 플립)을 접은 상태에서는 메인 화면이 꺼져 있고 커버 화면만 켜진다. 기본 화면으로만
 * 울림 화면을 띄우면 보이지 않으므로 커버 디스플레이를 지정해 띄우고, 몇 초 뒤 AOD로 덮이지 않게
 * 울리는 동안 주기적으로 다시 앞으로 올린다(교대알람 AlarmService.bringRingingActivityToFront 이식).
 */
class AlarmService : Service() {

    private var mediaPlayer: MediaPlayer? = null
    // "내 목소리" 알람: 기본 알람음(짧게) → 녹음 앞부분 두 번 → 반복
    private var voicePlayer: MediaPlayer? = null
    private var voiceEnhancer: LoudnessEnhancer? = null
    private var voiceStep: Runnable? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var autoStop: Runnable? = null
    private var fade: Runnable? = null
    private var displayListener: DisplayManager.DisplayListener? = null
    private var coverRelaunch: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val recordId = intent?.getStringExtra(AlarmScheduling.EXTRA_RECORD_ID) ?: ""
        val title = intent?.getStringExtra(AlarmScheduling.EXTRA_TITLE) ?: AlarmLabels.app(this)
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
                scheduleSnooze(rid, title.ifEmpty { info?.title ?: AlarmLabels.app(this) }, body.ifEmpty { info?.body ?: "" }, soundOn, vibOn)
                emit("malloAlarmSnoozed", rid)
                return START_NOT_STICKY
            }
        }

        // ACTION_RING (기본)
        stopRinging()
        currentRinging = RingingInfo(recordId, title, body, soundOn, vibOn)
        val notif = buildServiceNotification(recordId, title, body, soundOn, vibOn)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notif)
        }
        // 사용자가 보는 알람 알림(워치로 브릿지되는 쪽). 알림 권한이 없으면 조용히 실패한다.
        try {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(ALERT_ID, buildAlertNotification(recordId, title, body, soundOn, vibOn))
        } catch (e: Exception) { e.printStackTrace() }
        acquireWakeLock()
        startRinging(soundOn, vibOn, recordId)
        emit("malloAlarmRinging", recordId)
        showRingScreen(recordId, title, body, soundOn, vibOn)

        autoStop?.let { handler.removeCallbacks(it) }
        autoStop = Runnable {
            // 이 슬롯은 그만 울리되 알람 알림(ALERT_ID)은 남긴다 — 다음 슬롯이 1분 뒤 이어 울리고,
            // 그 사이에도 사용자가 끄기/5분 후를 누를 수 있다.
            stopRinging()
            releaseWakeLock()
            currentRinging = null
            cancelCoverWork()
            AlarmRingActivity.finishIfShowing()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }.also { handler.postDelayed(it, RING_MAX_MS) }
        return START_NOT_STICKY
    }

    /**
     * 교대알람처럼 배너가 아니라 "별도의 팝업"(전체화면 AlarmRingActivity)을 띄운다.
     *  - 화면 꺼짐/잠금: 알람 알림의 fullScreenIntent로 시스템이 띄워 준다("다른 앱 위에 표시"가 없을 때의 경로).
     *  - "다른 앱 위에 표시"(SYSTEM_ALERT_WINDOW)가 허용돼 있으면 여기서 직접 띄운다. 이때만 디스플레이를
     *    지정할 수 있어 **접은 플립의 커버 화면**에도 뜬다. (권한이 없으면 Android 10+ 백그라운드 실행 제한으로
     *    조용히 막힌다 — 예외 없음.)
     *
     * 폴더를 접으면 메인 디스플레이(0)는 꺼지고 커버 디스플레이가 켜지는데 그 전환이 100~400ms 걸려
     * 고정 지연으로는 못 맞춘다. DisplayListener로 커버가 켜지는 순간을 잡고, 1.2초 안에 안 켜지면
     * (= 접혀 있지 않음) 기본 화면에 띄운다. 디스플레이가 하나뿐인 일반 폰은 기다리지 않는다.
     */
    private fun showRingScreen(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean) {
        cancelCoverWork()
        val dm = try { getSystemService(Context.DISPLAY_SERVICE) as DisplayManager } catch (_: Exception) { null }
        var launched = false

        fun launch(displayId: Int?) {
            if (launched) return
            launched = true
            displayListener?.let { l -> try { dm?.unregisterDisplayListener(l) } catch (_: Exception) {} }
            displayListener = null
            try {
                val isCover = displayId != null && displayId != Display.DEFAULT_DISPLAY
                val i = AlarmRingActivity.intent(this, recordId, title, body, soundOn, vibOn)
                    // 기본 화면에서 키가드 해제를 요청하면 보안 잠금 입력창이 알람 화면을 가린다 — 커버 화면일 때만
                    .putExtra(AlarmRingActivity.EXTRA_DISMISS_KEYGUARD, isCover)
                val options = ActivityOptions.makeBasic()
                displayId?.let { options.setLaunchDisplayId(it) }
                startActivity(i, options.toBundle())
                // 커버 화면은 몇 초 뒤 삼성 AOD로 덮여 끄기 버튼이 사라진다 → 울리는 동안 주기적으로 다시 올린다
                if (isCover) scheduleCoverRelaunch(recordId, title, body, soundOn, vibOn, displayId!!)
            } catch (e: Exception) { e.printStackTrace() }
        }

        val displays = try { dm?.displays ?: emptyArray() } catch (_: Exception) { emptyArray<Display>() }
        if (dm == null || displays.size <= 1) { launch(null); return }   // 일반 폰
        findCoverDisplayId(dm)?.let { launch(it); return }               // 이미 접혀 커버가 켜져 있음

        // 커버는 OFF → DOZE → ON 순으로 켜진다. DOZE면 이미 켜지는 중이므로 그때 띄운다.
        val listener = object : DisplayManager.DisplayListener {
            override fun onDisplayAdded(displayId: Int) {}
            override fun onDisplayRemoved(displayId: Int) {}
            override fun onDisplayChanged(displayId: Int) {
                if (displayId == Display.DEFAULT_DISPLAY) return
                val d = dm.getDisplay(displayId) ?: return
                if (d.state != Display.STATE_OFF) launch(displayId)
            }
        }
        displayListener = listener
        try { dm.registerDisplayListener(listener, handler) } catch (_: Exception) {}
        handler.postDelayed({ launch(null) }, COVER_WAIT_MS)
    }

    /** 켜져 있는 디스플레이 중 기본(메인)이 아닌 것 = 커버 화면 */
    private fun findCoverDisplayId(dm: DisplayManager): Int? = try {
        dm.displays.firstOrNull { it.state != Display.STATE_OFF && it.displayId != Display.DEFAULT_DISPLAY }?.displayId
    } catch (_: Exception) { null }

    private fun scheduleCoverRelaunch(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean, displayId: Int) {
        coverRelaunch?.let { handler.removeCallbacks(it) }
        val r = object : Runnable {
            override fun run() {
                if (currentRinging == null) return
                try {
                    val i = AlarmRingActivity.intent(this@AlarmService, recordId, title, body, soundOn, vibOn)
                        .putExtra(AlarmRingActivity.EXTRA_DISMISS_KEYGUARD, true)
                    startActivity(i, ActivityOptions.makeBasic().apply { setLaunchDisplayId(displayId) }.toBundle())
                } catch (e: Exception) { e.printStackTrace() }
                handler.postDelayed(this, COVER_RELAUNCH_INTERVAL_MS)
            }
        }
        coverRelaunch = r
        handler.postDelayed(r, COVER_RELAUNCH_INTERVAL_MS)
    }

    private fun cancelCoverWork() {
        coverRelaunch?.let { handler.removeCallbacks(it) }
        coverRelaunch = null
        displayListener?.let { l ->
            try { (getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).unregisterDisplayListener(l) } catch (_: Exception) {}
        }
        displayListener = null
    }

    private fun stopEverything(recordId: String) {
        autoStop?.let { handler.removeCallbacks(it) }
        autoStop = null
        stopRinging()
        releaseWakeLock()
        currentRinging = null
        cancelCoverWork()
        AlarmRingActivity.finishIfShowing()
        if (recordId.isNotEmpty()) {
            AlarmScheduling.cancelByRecordId(this, recordId)   // 네이티브 +1/+2분·스누즈 슬롯
            ExpoTwin.clearRecord(this, recordId)               // Expo 쌍둥이(예약·표시 중)
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).apply {
            cancel(NOTIFICATION_ID)
            cancel(ALERT_ID)
        }
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

    private fun alarmAttrs(): AudioAttributes =
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

    /** 기본 알람음 플레이어(준비만 하고 시작은 호출자가) */
    private fun newChimePlayer(): MediaPlayer = MediaPlayer().apply {
        setAudioAttributes(alarmAttrs())
        val afd = resources.openRawResourceFd(R.raw.mallo_alarm)
        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        afd.close()
        isLooping = true
        prepare()
    }

    /**
     * "내 목소리" 알람. 기본 알람음을 잠깐 울려 주의를 끈 뒤 녹음 앞부분을 두 번 들려주고, 이를 되풀이한다.
     * 파일이 없거나 못 읽으면(삭제됨·잠금해제 전 등) false → 호출자가 기본 알람음으로 울린다.
     */
    private fun startVoiceCycle(path: String): Boolean {
        try {
            val f = File(path)
            if (!f.canRead() || f.length() == 0L) return false
            val vp = MediaPlayer().apply {
                setAudioAttributes(alarmAttrs())
                setDataSource(path)
                prepare()
            }
            voicePlayer = vp
            // 녹음은 알람음보다 작게 들린다 → 조금 키운다(기기가 지원하지 않으면 그냥 넘어감)
            try {
                voiceEnhancer = LoudnessEnhancer(vp.audioSessionId).apply {
                    setTargetGain(VOICE_GAIN_MB)
                    enabled = true
                }
            } catch (_: Exception) {}
            val chime = newChimePlayer().apply { setVolume(CHIME_VOLUME, CHIME_VOLUME) }
            mediaPlayer = chime
            val dur = vp.duration.toLong()
            val voiceMs = if (dur <= 0) VOICE_MAX_MS else dur.coerceIn(500L, VOICE_MAX_MS)
            // 재생 중 파일이 깨지면 무음으로 남지 않게 기본 알람음으로 되돌린다
            vp.setOnErrorListener { _, _, _ -> handler.post { fallbackToChime() }; true }
            var phase = 0 // 0: 알람음, 1·2: 목소리
            val r = object : Runnable {
                override fun run() {
                    try {
                        if (phase == 0) {
                            if (vp.isPlaying) vp.pause()
                            chime.seekTo(0)
                            chime.start()
                            handler.postDelayed(this, CHIME_MS)
                        } else {
                            if (chime.isPlaying) chime.pause()
                            if (vp.isPlaying) vp.pause()
                            vp.seekTo(0)
                            vp.start()
                            handler.postDelayed(this, voiceMs + VOICE_GAP_MS)
                        }
                        phase = (phase + 1) % 3
                    } catch (e: Exception) {
                        e.printStackTrace()
                        fallbackToChime()
                    }
                }
            }
            voiceStep = r
            r.run()
            return true // 첫 단계가 실패했어도 fallbackToChime이 이미 기본 알람음을 울리고 있다
        } catch (e: Exception) {
            e.printStackTrace()
            stopVoice()
            try { mediaPlayer?.release() } catch (_: Exception) {}
            mediaPlayer = null
            return false
        }
    }

    /** 목소리 재생이 도중에 실패했을 때: 목소리 쪽을 정리하고 기본 알람음을 끝까지 울린다(무음 방지). */
    private fun fallbackToChime() {
        stopVoice()
        try {
            val chime = mediaPlayer ?: newChimePlayer().also { mediaPlayer = it }
            chime.setVolume(1f, 1f)
            if (!chime.isPlaying) chime.start()
        } catch (e: Exception) {
            e.printStackTrace()
            try { mediaPlayer?.release() } catch (_: Exception) {}
            mediaPlayer = null
            try { mediaPlayer = newChimePlayer().apply { setVolume(1f, 1f); start() } } catch (_: Exception) {}
        }
    }

    private fun stopVoice() {
        voiceStep?.let { handler.removeCallbacks(it) }
        voiceStep = null
        try { voiceEnhancer?.release() } catch (_: Exception) {}
        voiceEnhancer = null
        try { voicePlayer?.stop() } catch (_: Exception) {}
        try { voicePlayer?.release() } catch (_: Exception) {}
        voicePlayer = null
    }

    private fun startRinging(soundOn: Boolean, vibOn: Boolean, recordId: String) {
        if (soundOn) {
            val voicePath = AlarmVoice.get(this, recordId)
            val voiceStarted = voicePath != null && startVoiceCycle(voicePath)
            if (!voiceStarted) {
                try {
                    mediaPlayer = newChimePlayer().apply {
                        setVolume(FADE_START, FADE_START)
                        start()
                    }
                    startFade()
                } catch (e: Exception) { e.printStackTrace() }
            }
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
        stopVoice()
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
        val nm = getSystemService(NotificationManager::class.java)
        // 예전 단일 채널(서비스 알림이 곧 알람 알림이던 구조)은 정리
        try { nm.deleteNotificationChannel(LEGACY_CHANNEL_ID) } catch (_: Exception) {}
        // 서비스 알림: 조용하고 눈에 덜 띄게 (시스템이 요구하는 상시 알림일 뿐)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SERVICE, "알람 울리는 중 · Alarm ringing", NotificationManager.IMPORTANCE_LOW).apply {
                setSound(null, null); enableVibration(false); setShowBadge(false)
            }
        )
        // 알람 알림: 헤드업·잠금화면·워치. 소리는 MediaPlayer(알람 스트림)가 내므로 채널 소리는 없다.
        // 진동을 쓰는 모드는 워치가 확실히 알리도록 채널 진동을 켠 쪽을, "소리만" 모드는 진동 없는 쪽을 쓴다.
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ALERT, "일정 알람 · Schedule alarm", NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(null, null); enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ALERT_VIB, "일정 알람(진동) · Schedule alarm (vibrate)", NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(null, null); enableVibration(true); vibrationPattern = longArrayOf(0, 300, 200, 300)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
        )
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

    /** 포그라운드 서비스가 요구하는 상시 알림 — 조용한 채널, 워치로는 보내지 않는다 */
    private fun buildServiceNotification(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean): Notification {
        val stopPi = servicePi(10, ACTION_STOP, recordId, title, body, soundOn, vibOn)
        return NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setContentTitle(AlarmLabels.ringing(this))
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, AlarmLabels.stop(this), stopPi)
            .setOngoing(true)
            .setLocalOnly(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .build()
    }

    /**
     * 사용자가 보는 알람 알림. 상시(ongoing)가 아니므로 Wear OS 워치로 브릿지된다.
     * 워치/폰에서 "끄기"·"5분 후"를 누르거나 알림을 닫으면(스와이프) 이 서비스의 STOP/SNOOZE로 들어온다.
     */
    private fun buildAlertNotification(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean): Notification {
        val stopPi = servicePi(10, ACTION_STOP, recordId, title, body, soundOn, vibOn)
        val snoozePi = servicePi(11, ACTION_SNOOZE, recordId, title, body, soundOn, vibOn)
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val openPi = launch?.let {
            PendingIntent.getActivity(this, 13, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val b = NotificationCompat.Builder(this, if (vibOn) CHANNEL_ALERT_VIB else CHANNEL_ALERT)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .apply { openPi?.let { setContentIntent(it) } }
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, AlarmLabels.stop(this), stopPi)
            .addAction(android.R.drawable.ic_popup_reminder, AlarmLabels.snooze(this), snoozePi)
            // 닫기(스와이프·워치에서 닫기) = 끄기. iOS의 customDismissAction과 같은 의미.
            .setDeleteIntent(stopPi)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
        // "다른 앱 위에 표시"가 허용돼 있으면 showRingScreen이 디스플레이를 지정해 직접 띄운다. 그때 fullScreenIntent까지
        // 달면 시스템이 먼저 기본 화면에 띄워 버려 접은 플립의 커버 화면 지정과 경쟁한다(교대알람에서 확인) → 생략.
        if (!canDrawOverlays()) {
            val fullScreenPi = PendingIntent.getActivity(
                this, 12,
                AlarmRingActivity.intent(this, recordId, title, body, soundOn, vibOn),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            b.setFullScreenIntent(fullScreenPi, true)
        }
        return b.build()
    }

    private fun canDrawOverlays(): Boolean =
        try { Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this) } catch (_: Exception) { false }

    override fun onDestroy() {
        autoStop?.let { handler.removeCallbacks(it) }
        cancelCoverWork()
        stopRinging()
        releaseWakeLock()
        currentRinging = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        data class RingingInfo(val recordId: String, val title: String, val body: String, val soundOn: Boolean, val vibOn: Boolean)
        @Volatile var currentRinging: RingingInfo? = null

        private const val LEGACY_CHANNEL_ID = "mallo_alarm_ring"
        const val CHANNEL_SERVICE = "mallo_alarm_service"
        const val CHANNEL_ALERT = "mallo_alarm_alert"
        const val CHANNEL_ALERT_VIB = "mallo_alarm_alert_vib"
        const val NOTIFICATION_ID = 7001   // 서비스(상시) 알림
        const val ALERT_ID = 7002          // 사용자가 보는 알람 알림(워치로 브릿지)
        private const val COVER_WAIT_MS = 1_200L
        private const val COVER_RELAUNCH_INTERVAL_MS = 2_500L
        const val ACTION_RING = "com.danielpark.mallo.alarm.RING"
        const val ACTION_STOP = "com.danielpark.mallo.alarm.STOP"
        const val ACTION_SNOOZE = "com.danielpark.mallo.alarm.SNOOZE"

        const val RING_MAX_MS = 50_000L
        const val SNOOZE_MS = 5 * 60 * 1000L
        private const val FADE_START = 0.2f
        private const val FADE_MS = 5_000L
        private const val FADE_STEP_MS = 500L
        // 내 목소리 알람: 알람음 2.5초 → 녹음 앞 10초까지 ×2 → 반복
        private const val CHIME_MS = 2_500L
        private const val CHIME_VOLUME = 0.7f
        private const val VOICE_MAX_MS = 10_000L
        private const val VOICE_GAP_MS = 600L
        private const val VOICE_GAIN_MB = 900

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
