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
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.media.AudioAttributes
import android.media.AudioManager
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
import android.view.View
import android.view.WindowManager
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
    private var keepFront: Runnable? = null
    /** 지금 울리는 슬롯의 일정 정보(울림 화면·알림 버튼 인텐트에 함께 싣는다). ACTION_RING에서만 바꾼다 */
    private var ringMeta: RingMeta = RingMeta.NONE
    private var balOverlay: View? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val recordId = intent?.getStringExtra(AlarmScheduling.EXTRA_RECORD_ID) ?: ""
        val title = intent?.getStringExtra(AlarmScheduling.EXTRA_TITLE) ?: AlarmLabels.app(this)
        val body = intent?.getStringExtra(AlarmScheduling.EXTRA_BODY) ?: ""
        val soundOn = intent?.getBooleanExtra(AlarmScheduling.EXTRA_SOUND_ON, true) ?: true
        val vibOn = intent?.getBooleanExtra(AlarmScheduling.EXTRA_VIB_ON, true) ?: true
        // 알람 소리 id — 없으면 끄기·5분 후는 지금 울리는 것, 새 울림(1.2.0 이전 예약)은 기본 소리
        val tone = intent?.getStringExtra(AlarmScheduling.EXTRA_TONE)
            ?: (if (intent?.action == ACTION_SNOOZE || intent?.action == ACTION_STOP) currentRinging?.tone else null)
            ?: AlarmTones.DEFAULT
        // 울림 카드용 일정 시각·몇 분 전(1.2.3). 없으면 끄기·5분 후는 지금 울리는 것, 새 울림(옛 예약)은 모름
        val meta = RingMeta.from(intent)
            ?: (if (intent?.action == ACTION_SNOOZE || intent?.action == ACTION_STOP) currentRinging?.meta else null)
            ?: RingMeta.NONE

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
                scheduleSnooze(rid, title.ifEmpty { info?.title ?: AlarmLabels.app(this) }, body.ifEmpty { info?.body ?: "" }, soundOn, vibOn, tone, meta)
                emit("malloAlarmSnoozed", rid)
                return START_NOT_STICKY
            }
        }

        // ACTION_RING (기본)
        stopRinging()
        ringMeta = meta
        currentRinging = RingingInfo(recordId, title, body, soundOn, vibOn, tone, meta)
        val notif = buildServiceNotification(recordId, title, body, soundOn, vibOn, tone)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notif)
        }
        // 사용자가 보는 알람 알림(워치로 브릿지되는 쪽). 알림 권한이 없으면 조용히 실패한다.
        try {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(ALERT_ID, buildAlertNotification(recordId, title, body, soundOn, vibOn, tone))
        } catch (e: Exception) { e.printStackTrace() }
        acquireWakeLock()
        startRinging(soundOn, vibOn, recordId, tone)
        emit("malloAlarmRinging", recordId)
        showRingScreen(recordId, title, body, soundOn, vibOn, tone)

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
     *  - "다른 앱 위에 표시"(SYSTEM_ALERT_WINDOW)가 허용돼 있으면 여기서 직접 띄운다. 잠금이 풀린 채 다른 앱을 쓰는
     *    중에는 fullScreenIntent가 배너로만 뜨므로 이 경로가 있어야 울림 화면이 맨 앞에 뜬다. 이때만 디스플레이를
     *    지정할 수 있어 **접은 플립의 커버 화면**에도 뜬다. (권한이 없으면 Android 10+ 백그라운드 실행 제한으로
     *    조용히 막힌다 — 예외 없음. 앱이 이를 안내한다: 설정 › 알람 화면 항상 띄우기, 시작 때 안내.)
     *
     * 폴더를 접으면 메인 디스플레이(0)는 꺼지고 커버 디스플레이가 켜지는데 그 전환이 100~400ms 걸려
     * 고정 지연으로는 못 맞춘다. DisplayListener로 커버가 켜지는 순간을 잡고, 1.2초 안에 안 켜지면
     * (= 접혀 있지 않음) 기본 화면에 띄운다. 디스플레이가 하나뿐인 일반 폰은 기다리지 않는다.
     */
    private fun showRingScreen(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean, tone: String) {
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
                val i = AlarmRingActivity.intent(this, recordId, title, body, soundOn, vibOn, tone, ringMeta)
                    // 기본 화면에서 키가드 해제를 요청하면 보안 잠금 입력창이 알람 화면을 가린다 — 커버 화면일 때만
                    .putExtra(AlarmRingActivity.EXTRA_DISMISS_KEYGUARD, isCover)
                launchRing(i, displayId)
                // 커버 화면은 몇 초 뒤 삼성 AOD로 덮여 끄기 버튼이 사라진다 → 울리는 동안 주기적으로 다시 올린다
                if (isCover) scheduleCoverRelaunch(recordId, title, body, soundOn, vibOn, tone, displayId!!)
            } catch (e: Exception) { e.printStackTrace() }
            // 기본 화면: 울리는 동안 홈 버튼·다른 앱에 가려지면 다시 맨 앞으로 올린다(커버 화면은 위의 재표시가 맡는다)
            if (displayId == null || displayId == Display.DEFAULT_DISPLAY) scheduleKeepFront()
        }

        val justAttached = canDrawOverlays() && showBalOverlay()
        val displays = try { dm?.displays ?: emptyArray() } catch (_: Exception) { emptyArray<Display>() }
        if (dm == null || displays.size <= 1) {   // 일반 폰
            // 오버레이 창을 방금 붙였으면 시스템이 "보이는 창"으로 인정할 틈을 준다(Android 15+)
            if (justAttached) handler.postDelayed({ if (currentRinging != null) launch(null) }, BAL_OVERLAY_WAIT_MS) else launch(null)
            return
        }
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

    private fun scheduleCoverRelaunch(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean, tone: String, displayId: Int) {
        coverRelaunch?.let { handler.removeCallbacks(it) }
        val r = object : Runnable {
            override fun run() {
                if (currentRinging == null) return
                try {
                    val i = AlarmRingActivity.intent(this@AlarmService, recordId, title, body, soundOn, vibOn, tone, ringMeta)
                        .putExtra(AlarmRingActivity.EXTRA_DISMISS_KEYGUARD, true)
                    launchRing(i, displayId)
                } catch (e: Exception) { e.printStackTrace() }
                handler.postDelayed(this, COVER_RELAUNCH_INTERVAL_MS)
            }
        }
        coverRelaunch = r
        handler.postDelayed(r, COVER_RELAUNCH_INTERVAL_MS)
    }

    /**
     * 울림 화면을 띄운다. "다른 앱 위에 표시"가 있으면 백그라운드에서도 띄울 수 있는데, Android 15부터는 그 권한만으로는
     * 부족하고 **보이는 오버레이 창**이 있어야 한다 → 울리기 시작할 때 1px 투명 오버레이를 붙여 두고(showRingScreen),
     * 울림이 끝나면 뗀다(cancelCoverWork). 터치·포커스를 받지 않아 사용자에게는 보이지 않는다.
     * 권한이 없으면 Android 10+ 백그라운드 실행 제한으로 조용히 막힌다(예외 없음) — 그때는 fullScreenIntent가 맡는다.
     */
    private fun launchRing(i: Intent, displayId: Int?) {
        if (canDrawOverlays()) showBalOverlay()
        val options = ActivityOptions.makeBasic()
        displayId?.let { options.setLaunchDisplayId(it) }
        startActivity(i, options.toBundle())
    }

    /** 1px 투명 오버레이를 붙인다(울리는 동안 붙여 두고 cancelCoverWork에서 뗀다). 반환: 이번에 새로 붙였는지 */
    private fun showBalOverlay(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || balOverlay != null) return false
        return try {
            val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            run {
                val v = View(this)
                val lp = WindowManager.LayoutParams(
                    1, 1,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                    PixelFormat.TRANSLUCENT
                )
                wm.addView(v, lp)
                balOverlay = v
            }
            true
        } catch (e: Exception) { e.printStackTrace(); false }
    }

    private fun removeBalOverlay() {
        val v = balOverlay ?: return
        balOverlay = null
        try { (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v) } catch (_: Exception) {}
    }

    /**
     * 울리는 동안에만 KEEP_FRONT_INTERVAL_MS마다 "울림 화면이 맨 앞인가"를 보고, 가려졌으면 다시 올린다.
     * 울림이 끝나면(끄기·5분 후·자동 종료) cancelCoverWork가 멈춘다 — 한 슬롯 최대 RING_MAX_MS 동안만 돈다.
     * 화면이 꺼져 있으면(전원 버튼) 다시 켜지 않고, 통화 중이면 통화 화면을 덮지 않는다.
     * "다른 앱 위에 표시"가 없으면 백그라운드에서 띄울 수 없으므로 돌리지 않는다.
     */
    private fun scheduleKeepFront() {
        keepFront?.let { handler.removeCallbacks(it) }
        keepFront = null
        if (!canDrawOverlays()) return
        val r = object : Runnable {
            override fun run() {
                if (currentRinging == null) return
                // 커버 화면이 켜져 있으면(펼쳐서 울리다 접은 플립) 메인 화면에 다시 띄우지 않는다 — 예전 동작 그대로
                val dm = try { getSystemService(Context.DISPLAY_SERVICE) as DisplayManager } catch (_: Exception) { null }
                val coverOn = dm != null && findCoverDisplayId(dm) != null
                if (!AlarmRingActivity.inFront && coverRelaunch == null && !coverOn && isScreenOn() && !inCall()) {
                    try { AlarmRingActivity.ringingIntent(this@AlarmService)?.let { launchRing(it, null) } } catch (e: Exception) { e.printStackTrace() }
                }
                handler.postDelayed(this, KEEP_FRONT_INTERVAL_MS)
            }
        }
        keepFront = r
        handler.postDelayed(r, KEEP_FRONT_INTERVAL_MS)
    }

    /**
     * 울리는 도중 "다른 앱 위에 표시"가 켜졌으면 이 슬롯에서 바로 keepFront를 붙인다(1.2.3).
     * 예전에는 슬롯을 시작할 때(showRingScreen)만 권한을 봐서, 울리는 중 권한을 켜면 그 1분 슬롯은 가려져도 다시 안 올라오고
     * 다음 슬롯부터 붙었다. 새 타이머·폴링 없이 "알게 된 순간"에만 부른다: 울림 화면이 다시 앞에 올 때(AlarmRingActivity.onResume),
     * 앱이 앞으로 올 때(JS AppState active → MalloAlarmModule.refreshRingFront). 이미 붙어 있거나 커버 화면 재표시 중이면 아무것도 안 한다.
     */
    private fun ensureKeepFront() {
        if (currentRinging == null || keepFront != null || coverRelaunch != null || displayListener != null) return
        if (!canDrawOverlays()) return
        showBalOverlay() // Android 15+: 보이는 오버레이 창이 있어야 뒤에서 울림 화면을 다시 올릴 수 있다
        scheduleKeepFront()
    }

    private fun isScreenOn(): Boolean =
        try { (getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive } catch (_: Exception) { true }

    private fun inCall(): Boolean = try {
        val mode = (getSystemService(Context.AUDIO_SERVICE) as AudioManager).mode
        mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_RINGTONE
    } catch (_: Exception) { false }

    private fun cancelCoverWork() {
        keepFront?.let { handler.removeCallbacks(it) }
        keepFront = null
        removeBalOverlay()
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
    private fun scheduleSnooze(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean, tone: String, meta: RingMeta) {
        if (recordId.isEmpty()) return
        val base = System.currentTimeMillis() + SNOOZE_MS
        // 미리 알림(id#preN)은 "한 번" 울리는 것이 설계라 스누즈도 1슬롯 (정각은 3슬롯)
        val slots = if (AlarmScheduling.isPreRecordId(recordId)) 0..0 else 0..2
        for (slot in slots) {
            val e = AlarmStore.Entry(
                key = AlarmScheduling.snoozeKey(recordId, slot), recordId = recordId,
                triggerAtMs = base + slot * 60_000L, title = title, body = body,
                soundOn = soundOn, vibOn = vibOn, tone = tone,
                // 일정 시각·몇 분 전은 원래 알림 그대로, 띠만 "다시 알림"(1.2.3)
                meta = meta.copy(snoozed = true),
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
    private fun newChimePlayer(): MediaPlayer = newRawPlayer(R.raw.mallo_alarm)

    /** 고른 알람 소리 플레이어. 파일을 못 열면 기본 알람음으로(무음 방지) */
    private fun newTonePlayer(tone: String): MediaPlayer {
        val res = AlarmTones.rawRes(tone)
        if (res == R.raw.mallo_alarm) return newChimePlayer()
        return try { newRawPlayer(res) } catch (e: Exception) { e.printStackTrace(); newChimePlayer() }
    }

    private fun newRawPlayer(res: Int): MediaPlayer = MediaPlayer().apply {
        setAudioAttributes(alarmAttrs())
        val afd = resources.openRawResourceFd(res)
        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        afd.close()
        isLooping = true
        prepare()
    }

    // [VOICE_ALARM] 보류된 기능 — AlarmVoice가 비어 있는 동안에는 호출되지 않는다(항상 기본 알람음).
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

    /** 재생 중 오류가 난 고른 소리 플레이어를 기본 알람음으로 바꾼다. 이미 멈췄거나 다른 플레이어면 아무것도 안 한다 */
    private fun swapToChime(failed: MediaPlayer) {
        if (mediaPlayer !== failed) return
        try { failed.release() } catch (_: Exception) {}
        mediaPlayer = null
        try { mediaPlayer = newChimePlayer().apply { setVolume(1f, 1f); start() } } catch (e: Exception) { e.printStackTrace() }
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

    private fun startRinging(soundOn: Boolean, vibOn: Boolean, recordId: String, tone: String) {
        if (soundOn) {
            // [VOICE_ALARM] 상용에서는 항상 null → 아래 기본 알람음 분기
            val voicePath = AlarmVoice.get(this, recordId)
            val voiceStarted = voicePath != null && startVoiceCycle(voicePath)
            if (!voiceStarted) {
                try {
                    // 고른 알람 소리(없거나 못 읽으면 기본 소리) — 반복 재생, 작게 시작해 5초 안에 커진다(예전 그대로)
                    mediaPlayer = newTonePlayer(tone).apply {
                        setVolume(FADE_START, FADE_START)
                        // 고른 소리가 재생 도중 깨지면(디코딩 오류) 기본 알람음으로 바꿔 끝까지 울린다(무음 방지)
                        setOnErrorListener { mp, _, _ -> handler.post { swapToChime(mp) }; true }
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

    private fun servicePi(code: Int, action: String, recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean, tone: String): PendingIntent =
        PendingIntent.getService(
            this, code,
            Intent(this, AlarmService::class.java).apply {
                this.action = action
                putExtra(AlarmScheduling.EXTRA_RECORD_ID, recordId)
                putExtra(AlarmScheduling.EXTRA_TITLE, title)
                putExtra(AlarmScheduling.EXTRA_BODY, body)
                putExtra(AlarmScheduling.EXTRA_SOUND_ON, soundOn)
                putExtra(AlarmScheduling.EXTRA_VIB_ON, vibOn)
                putExtra(AlarmScheduling.EXTRA_TONE, tone) // 워치·알림의 "5분 후"도 같은 소리로
                ringMeta.putTo(this) // 울림이 끝난 뒤 알림의 "5분 후"를 눌러도 일정 시각·몇 분 전이 이어지게(1.2.3)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    /** 포그라운드 서비스가 요구하는 상시 알림 — 조용한 채널, 워치로는 보내지 않는다 */
    private fun buildServiceNotification(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean, tone: String): Notification {
        val stopPi = servicePi(10, ACTION_STOP, recordId, title, body, soundOn, vibOn, tone)
        // 누르면 울림 화면(끄기·5분 후)으로 바로 간다 — 이 알림은 울리는 동안에만 있으므로 언제 눌러도 울림 화면이 맞다
        val ringPi = PendingIntent.getActivity(
            this, 14,
            AlarmRingActivity.intent(this, recordId, title, body, soundOn, vibOn, tone, ringMeta),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setContentTitle("${AlarmLabels.app(this)} · ${AlarmLabels.ringing(this)}")  // 어느 앱 알람인지(11-25)
            .setContentText(body)
            .setContentIntent(ringPi)
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
    private fun buildAlertNotification(recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean, tone: String): Notification {
        val stopPi = servicePi(10, ACTION_STOP, recordId, title, body, soundOn, vibOn, tone)
        val snoozePi = servicePi(11, ACTION_SNOOZE, recordId, title, body, soundOn, vibOn, tone)
        // 알림을 누르면 앱을 열고 이 일정 ID를 넘긴다(앱이 그 일정 상세 화면을 연다 — MalloAlarmModule.consumeOpenRecordId).
        // 아직 울리는 중이면 앱이 앞으로 오는 순간 울림 화면이 그 위에 다시 뜬다(MalloAlarmModule.OnActivityEntersForeground).
        // 울림이 끝난 뒤(다음 슬롯 대기 중)에 누르면 상세 화면만 열린다.
        val launch = packageManager.getLaunchIntentForPackage(packageName)
            ?.putExtra(AlarmScheduling.EXTRA_OPEN_RECORD_ID, recordId)
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
            // 어느 일정의 알림인지 적어 둔다 — 울림이 끝난 뒤 그 일정을 끄면 이 알림만 골라 지운다(clearStaleAlert)
            .addExtras(android.os.Bundle().apply { putString(AlarmScheduling.EXTRA_RECORD_ID, recordId) })
        // "다른 앱 위에 표시"가 허용돼 있으면 showRingScreen이 디스플레이를 지정해 직접 띄운다. 그때 fullScreenIntent까지
        // 달면 시스템이 먼저 기본 화면에 띄워 버려 접은 플립의 커버 화면 지정과 경쟁한다(교대알람에서 확인) → 생략.
        // 단, 화면이 하나뿐인 일반 폰은 커버와 경쟁할 일이 없으므로 권한이 있어도 단다 — 직접 띄우기가 어떤 이유로 막혀도
        // (Android 15+ 백그라운드 실행 제한 등) 잠금·화면 꺼짐 상태에서는 시스템이 울림 화면을 띄운다. 둘 다 떠도 singleInstance라 한 화면.
        if (!canDrawOverlays() || !hasMultipleDisplays()) {
            val fullScreenPi = PendingIntent.getActivity(
                this, 12,
                AlarmRingActivity.intent(this, recordId, title, body, soundOn, vibOn, tone, ringMeta),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            b.setFullScreenIntent(fullScreenPi, true)
        }
        return b.build()
    }

    private fun hasMultipleDisplays(): Boolean =
        try { (getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).displays.size > 1 } catch (_: Exception) { false }

    private fun canDrawOverlays(): Boolean =
        try { Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this) } catch (_: Exception) { false }

    override fun onDestroy() {
        if (instance === this) instance = null
        autoStop?.let { handler.removeCallbacks(it) }
        cancelCoverWork()
        stopRinging()
        releaseWakeLock()
        currentRinging = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        data class RingingInfo(val recordId: String, val title: String, val body: String, val soundOn: Boolean, val vibOn: Boolean, val tone: String = AlarmTones.DEFAULT, val meta: RingMeta = RingMeta.NONE)
        @Volatile var currentRinging: RingingInfo? = null
        /** 살아 있는 서비스(ensureKeepFront 전달용). 메인 스레드에서만 읽고 쓴다 */
        @Volatile private var instance: AlarmService? = null

        /** 울리는 중이고 "다른 앱 위에 표시"가 이제 켜져 있으면 이 슬롯에 keepFront를 붙인다(아니면 아무것도 안 함) */
        fun refreshKeepFront() {
            Handler(Looper.getMainLooper()).post { instance?.ensureKeepFront() }
        }

        private const val LEGACY_CHANNEL_ID = "mallo_alarm_ring"
        const val CHANNEL_SERVICE = "mallo_alarm_service"
        const val CHANNEL_ALERT = "mallo_alarm_alert"
        const val CHANNEL_ALERT_VIB = "mallo_alarm_alert_vib"
        const val NOTIFICATION_ID = 7001   // 서비스(상시) 알림
        const val ALERT_ID = 7002          // 사용자가 보는 알람 알림(워치로 브릿지)
        private const val COVER_WAIT_MS = 1_200L
        private const val COVER_RELAUNCH_INTERVAL_MS = 2_500L
        private const val KEEP_FRONT_INTERVAL_MS = 2_500L
        private const val BAL_OVERLAY_WAIT_MS = 300L
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

        /**
         * 울림이 끝난 뒤(다음 슬롯 대기 중·마지막 슬롯 뒤)에 남아 있는 이 일정의 알람 알림(7002)과 Expo 표시 알림을 지운다.
         * JS가 "본 것"으로 끄거나(알림 탭·앱에서 끄기) 일정을 지우·고칠 때 불린다 — 끈 알람의 지난 알림이 알림 줄에 쌓이지 않게.
         * 7002는 하나뿐이라 지금 다른 일정을 보여 주고 있으면 건드리지 않는다(알림에 적어 둔 일정 ID로 확인).
         * 예약은 건드리지 않는다(Expo 예약 취소는 비동기라 바로 뒤의 새 예약을 지울 수 있다 — JS가 직접 취소한다).
         */
        fun clearStaleAlert(context: Context, recordId: String) {
            if (recordId.isEmpty()) return
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val mine = nm.activeNotifications.any {
                        it.id == ALERT_ID && it.notification.extras?.getString(AlarmScheduling.EXTRA_RECORD_ID) == recordId
                    }
                    if (mine) nm.cancel(ALERT_ID)
                }
            } catch (_: Exception) {}
            val ids = (0..2).map { AlarmScheduling.expoKey(recordId, it) }.toMutableList()
            val hash = recordId.indexOf('#')
            if (hash > 0) ids.add("mallo_" + recordId.substring(0, hash) + "_" + recordId.substring(hash + 1))
            ExpoTwin.dismissPresented(context, ids)
        }

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
