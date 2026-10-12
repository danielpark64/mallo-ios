package com.danielpark.mallo.alarm

import android.app.Activity
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
 * 잠금 상태에서 알람이 울릴 때 뜨는 전체화면(교대알람 CoverAlarmActivity 상당).
 * RN 없이 순수 네이티브라 잠금해제 전(Direct Boot)·앱 프로세스 미기동 상태에서도 뜬다.
 * 화면이 켜져 있고 잠금이 풀린 상태에서는 시스템이 이걸 띄우지 않고 heads-up 알림만 보인다(Android 기본 동작).
 */
class AlarmRingActivity : Activity() {
    private var recordId = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        recordId = intent?.getStringExtra(AlarmScheduling.EXTRA_RECORD_ID) ?: ""
        val title = intent?.getStringExtra(AlarmScheduling.EXTRA_TITLE) ?: "말로"
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

        val d = resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0b0b1c"))
            setPadding(dp(28), dp(24), dp(28), dp(24))
        }
        val clock = TextView(this).apply {
            text = SimpleDateFormat("HH:mm", Locale.KOREA).format(Date())
            setTextColor(Color.WHITE); textSize = 56f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        }
        val titleView = TextView(this).apply {
            text = title
            setTextColor(Color.parseColor("#9aa0ff")); textSize = 18f; gravity = Gravity.CENTER
        }
        val bodyView = TextView(this).apply {
            text = body
            setTextColor(Color.WHITE); textSize = 24f; gravity = Gravity.CENTER; maxLines = 6
        }
        val stopBtn = Button(this).apply {
            text = "알람 끄기"; textSize = 18f
            setOnClickListener { act(AlarmService.ACTION_STOP) }
        }
        val snoozeBtn = Button(this).apply {
            text = "5분 후 다시"; textSize = 16f
            setOnClickListener { act(AlarmService.ACTION_SNOOZE) }
        }
        val lp = { top: Int -> LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) } }
        root.addView(clock, lp(0))
        root.addView(titleView, lp(8))
        root.addView(bodyView, lp(16))
        root.addView(stopBtn, lp(40))
        root.addView(snoozeBtn, lp(12))
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
