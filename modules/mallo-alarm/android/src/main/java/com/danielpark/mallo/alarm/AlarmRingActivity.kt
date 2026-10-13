package com.danielpark.mallo.alarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 알람이 울릴 때 뜨는 전체화면(교대알람 CoverAlarmActivity 상당).
 * RN 없이 순수 네이티브라 잠금해제 전(Direct Boot)·앱 프로세스 미기동 상태에서도 뜨고,
 * 접은 플립의 작은 커버 화면에도 그대로 뜬다(RN 화면은 커버 화면에서 재측정에 실패해 비어 보인다 — 교대알람에서 확인).
 * 화면 크기에 맞춰 세 단계로 줄인다: 보통 / 낮은 화면(플립5 커버 등) / 아주 작은 화면(플립3 커버).
 */
class AlarmRingActivity : Activity() {
    private var recordId = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        recordId = intent?.getStringExtra(AlarmScheduling.EXTRA_RECORD_ID) ?: ""
        val title = intent?.getStringExtra(AlarmScheduling.EXTRA_TITLE) ?: AlarmLabels.app(this)
        val body = intent?.getStringExtra(AlarmScheduling.EXTRA_BODY) ?: ""

        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }

        // 커버 화면의 잠금(글랜스)은 메인 보안 잠금과 다른 층이라 해제를 요청해야 끄기 버튼을 누를 수 있다.
        // 기본 화면에서는 요청하면 비밀번호 입력창이 알람 화면을 덮으므로 호출부가 커버일 때만 true로 넘긴다.
        if (intent?.getBooleanExtra(EXTRA_DISMISS_KEYGUARD, false) == true && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                (getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)?.requestDismissKeyguard(this, null)
            } catch (e: Exception) { e.printStackTrace() }
        }

        val dm = resources.displayMetrics
        val d = dm.density
        fun dp(v: Int) = (v * d).toInt()
        val hDp = dm.heightPixels / d
        val wDp = dm.widthPixels / d
        val tiny = hDp < 300 || wDp < 200      // 플립3 커버(약 130×256dp)
        val short = !tiny && hDp < 480         // 플립5·6 커버(약 360×370dp) 등

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#141430"))
            val pad = if (tiny) 8 else if (short) 14 else 28
            setPadding(dp(pad), dp(pad), dp(pad), dp(pad))
        }
        val clock = TextView(this).apply {
            text = SimpleDateFormat("HH:mm", Locale.KOREA).format(Date())
            setTextColor(Color.WHITE); textSize = if (short) 30f else 56f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        }
        val titleView = TextView(this).apply {
            text = title
            setTextColor(Color.parseColor("#9aa0ff")); textSize = if (tiny) 11f else if (short) 14f else 18f
            gravity = Gravity.CENTER; maxLines = 1
        }
        val bodyView = TextView(this).apply {
            text = body
            setTextColor(Color.WHITE); textSize = if (tiny) 13f else if (short) 17f else 24f
            gravity = Gravity.CENTER; maxLines = if (tiny) 2 else if (short) 3 else 6
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        val stopBtn = Button(this).apply {
            text = AlarmLabels.stop(this@AlarmRingActivity); textSize = if (tiny) 13f else 18f; isAllCaps = false
            setOnClickListener { act(AlarmService.ACTION_STOP) }
        }
        val snoozeBtn = Button(this).apply {
            text = AlarmLabels.snooze(this@AlarmRingActivity); textSize = if (tiny) 12f else 16f; isAllCaps = false
            setOnClickListener { act(AlarmService.ACTION_SNOOZE) }
        }
        val lp = { top: Int -> LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) } }
        if (!tiny) root.addView(clock, lp(0))            // 아주 작은 화면은 시계를 빼고 끄기 버튼 자리를 확보
        root.addView(titleView, lp(if (tiny) 0 else 8))
        root.addView(bodyView, lp(if (tiny) 2 else if (short) 6 else 16))
        root.addView(stopBtn, lp(if (tiny) 4 else if (short) 12 else 40))
        if (!tiny) root.addView(snoozeBtn, lp(if (short) 4 else 12))   // 아주 작은 화면은 끄기 하나만(5분 후는 알림 버튼에 있음)
        setContentView(root)
        showing = WeakReference(this)
    }

    private fun act(action: String) {
        try {
            startService(Intent(this, AlarmService::class.java).apply {
                this.action = action
                putExtras(intent)
                putExtra(AlarmScheduling.EXTRA_RECORD_ID, recordId)
            })
        } catch (e: Exception) { e.printStackTrace() }
        finish()
    }

    override fun onResume() {
        super.onResume()
        // 다른 경로(알림 버튼 등)로 이미 꺼졌으면 남아 있을 이유가 없다
        if (AlarmService.currentRinging == null) finish()
    }

    override fun onDestroy() {
        if (showing?.get() === this) showing = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_DISMISS_KEYGUARD = "dismissKeyguard"
        @Volatile private var showing: WeakReference<AlarmRingActivity>? = null

        fun finishIfShowing() {
            val a = showing?.get() ?: return
            a.runOnUiThread { if (!a.isFinishing) a.finish() }
        }

        fun intent(context: Context, recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean) =
            Intent(context, AlarmRingActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(AlarmScheduling.EXTRA_RECORD_ID, recordId)
                putExtra(AlarmScheduling.EXTRA_TITLE, title)
                putExtra(AlarmScheduling.EXTRA_BODY, body)
                putExtra(AlarmScheduling.EXTRA_SOUND_ON, soundOn)
                putExtra(AlarmScheduling.EXTRA_VIB_ON, vibOn)
            }
    }
}
