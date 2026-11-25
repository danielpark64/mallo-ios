package com.danielpark.mallo.alarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.text.SpannableString
import android.text.Spanned
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.view.View
import android.widget.FrameLayout
import android.widget.ScrollView
import android.os.Build
import android.os.Bundle
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import android.view.Gravity
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * 알람이 울릴 때 뜨는 화면(교대알람 CoverAlarmActivity 상당). 1.2.3부터 전체 화면 위 가운데 카드로 그린다(buildCard).
 * RN 없이 순수 네이티브라 잠금해제 전(Direct Boot)·앱 프로세스 미기동 상태에서도 뜨고,
 * 접은 플립의 작은 커버 화면에도 그대로 뜬다(RN 화면은 커버 화면에서 재측정에 실패해 비어 보인다 — 교대알람에서 확인).
 * 화면 크기에 맞춰 세 단계로 줄인다: 보통 / 낮은 화면(플립5 커버 등) / 아주 작은 화면(플립3 커버).
 */
class AlarmRingActivity : Activity() {
    private var recordId = ""
    private var backBlocker: Any? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        recordId = intent?.getStringExtra(AlarmScheduling.EXTRA_RECORD_ID) ?: ""
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

        setContentView(buildCard(body))
        showing = WeakReference(this)
        blockBack()
    }

    /**
     * 울림 카드(1.2.3, 사용자 승인 시안 "카드 — 일정 시간 + 몇 분 전 알림인지").
     *
     * 창 방식: 투명(translucent)·다이얼로그 테마로 바꾸지 않는다. 투명 액티비티는 잠금 화면을 "가리는(occlude)" 화면으로
     * 인정되지 않아 기기마다 잠금 화면 위 표시·전체 화면 알림(FSI) 실행·화면 켜기가 어긋나는 사례가 있고, 뒤 액티비티가
     * resumed로 남아 맨 앞 판정(inFront·keepFront)도 흐려진다. 그래서 지금처럼 **불투명 전체 화면 액티비티**를 그대로 두고,
     * 창 배경만 비워 바탕화면(FLAG_SHOW_WALLPAPER)을 비친 뒤 그 위에 어두운 막(약 0.55)과 가운데 카드를 그린다.
     * 액티비티의 불투명 여부는 테마의 windowIsTranslucent로만 정해지므로 잠금 화면 위 표시·맨 앞 복귀 동작은 이전과 같다.
     * 카드 밖은 아무 동작도 없다(눌러도 닫히지 않음). 뒤로 가기는 blockBack()이 그대로 막는다.
     *
     * 화면 크기 세 단계는 이전과 같다: 보통 / 낮은 화면(플립5 커버·가로) / 아주 작은 화면(플립3 커버).
     */
    private fun buildCard(body: String): View {
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WALLPAPER)
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))

        val meta = RingMeta.from(intent) ?: RingMeta.NONE
        val dm = resources.displayMetrics
        val d = dm.density
        fun dp(v: Int) = (v * d).toInt()
        val hDp = dm.heightPixels / d
        val wDp = dm.widthPixels / d
        val tiny = hDp < 300 || wDp < 200      // 플립3 커버(약 130×256dp)
        val short = !tiny && hDp < 480         // 플립5·6 커버(약 360×370dp)·가로 화면 등

        val soft = Color.parseColor("#b8c4ff")
        val semiBold = if (Build.VERSION.SDK_INT >= 28) Typeface.create(Typeface.DEFAULT, 600, false) else Typeface.DEFAULT_BOLD

        val now = System.currentTimeMillis()
        // 큰 글자는 지금 시각이 아니라 일정 시각. 일정 정보가 없는 옛 예약이면 울린 시각
        val eventAt = if (meta.known) meta.eventAtMs else now
        val locale = ringLocale()

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            val padH = if (tiny) 8 else 18
            setPadding(dp(padH), dp(if (tiny) 10 else if (short) 14 else 22), dp(padH), dp(if (tiny) 10 else if (short) 12 else 20))
            background = cardBackground(dp(26).toFloat())
            elevation = dp(20).toFloat()
        }
        // 카드 배경: 위 25% 지점에서 퍼지는 원형 그라데이션(#27325f → #0b1026, 가장 먼 모서리까지 거리의 80%에서 끝 색)
        card.addOnLayoutChangeListener { v, l, t, r, b, _, _, _, _ ->
            val w = (r - l).toFloat(); val h = (b - t).toFloat()
            if (w > 0 && h > 0) (v.background as? GradientDrawable)?.gradientRadius =
                0.8f * Math.hypot((w / 2).toDouble(), (h * 0.75).toDouble()).toFloat()
        }
        fun lp(top: Int) = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(top); gravity = Gravity.CENTER_HORIZONTAL }

        // ① 앱 아이콘 + 앱 이름 — 어느 앱 알람인지(아주 작은 화면은 생략)
        if (!tiny) {
            val appRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                try {
                    addView(ImageView(this@AlarmRingActivity).apply { setImageDrawable(packageManager.getApplicationIcon(packageName)) },
                        LinearLayout.LayoutParams(dp(20), dp(20)).apply { rightMargin = dp(7) })
                } catch (_: Exception) {}
                addView(TextView(this@AlarmRingActivity).apply {
                    text = AlarmLabels.app(this@AlarmRingActivity)
                    setTextColor(soft); textSize = 13f; typeface = semiBold; maxLines = 1
                })
            }
            card.addView(appRow, lp(0))
        }

        // ② 알림 띠 — 정각이면 주황 "지금 · 일정 시간", 미리 알림이면 파랑 "1시간 전 알림" 등, 스누즈면 "다시 알림"
        val band = AlarmLabels.band(this, meta)
        if (band != null) {
            val (label, isNow) = band
            card.addView(TextView(this).apply {
                text = label
                textSize = if (tiny) 11f else 12f; typeface = Typeface.DEFAULT_BOLD; maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                setTextColor(if (isNow) Color.parseColor("#1a1300") else Color.WHITE)
                setPadding(dp(12), dp(5), dp(12), dp(5))
                background = GradientDrawable().apply {
                    cornerRadius = dp(12).toFloat()
                    setColor(Color.parseColor(if (isNow) "#f59e0b" else "#3b82f6"))
                }
            }, lp(if (tiny) 0 else 12))
        }

        // ③ 일정 시간(크게) — 기기의 12/24시간 설정을 따르고, 오전/오후는 작게
        card.addView(TextView(this).apply {
            // 로캘 패턴을 못 읽는 기기가 있어도 울림 화면이 죽으면 안 된다(끌 곳이 사라짐) → 기기 기본 형식으로
            text = try { timeText(eventAt, locale) } catch (e: Exception) {
                e.printStackTrace(); android.text.format.DateFormat.getTimeFormat(this@AlarmRingActivity).format(Date(eventAt))
            }
            setTextColor(Color.WHITE); typeface = Typeface.DEFAULT_BOLD
            textSize = if (tiny) 24f else if (short) 30f else 38f
            letterSpacing = -0.013f   // 시안 letter-spacing -0.5px / 38px
            gravity = Gravity.CENTER; maxLines = 1
        }, lp(if (band != null) (if (tiny) 2 else 8) else (if (tiny) 0 else 10)))

        // ④ 날짜 — 일정이 오늘·내일이면 "오늘 · 11월 25일 수요일", 그 밖엔 날짜만(앱 언어 형식)
        if (!tiny) {
            card.addView(TextView(this).apply {
                text = try { dateText(eventAt, now, meta.known, locale) } catch (e: Exception) {
                    e.printStackTrace(); android.text.format.DateFormat.getLongDateFormat(this@AlarmRingActivity).format(Date(eventAt))
                }
                setTextColor(Color.parseColor("#aaaabb")); textSize = 12f
                gravity = Gravity.CENTER; maxLines = 1; ellipsize = TextUtils.TruncateAt.END
            }, lp(2))
        }

        // ⑤ 일정 내용(최대 4줄, 말줄임) — 미리 알림 본문의 "30분 뒤 · " 앞말 없이 원문
        val content = meta.content.ifBlank { body }
        if (content.isNotBlank()) {
            card.addView(TextView(this).apply {
                text = content
                setTextColor(Color.WHITE); textSize = if (tiny) 13f else 16f
                gravity = Gravity.CENTER; maxLines = if (tiny) 2 else if (short) 2 else 4
                ellipsize = TextUtils.TruncateAt.END
                setLineSpacing(0f, 1.15f)
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(if (tiny) 2 else 10) })
        }

        // ⑥ 빛나는 원 끄기 버튼 — 지름 68dp(#3b82f6) + 바깥 반투명 링 8dp·16dp. 링까지 눌리게 해 누르기 쉽게
        val circle = if (tiny) 48 else if (short) 56 else 68
        val ring1 = if (tiny) 4 else if (short) 6 else 8
        val ring2 = if (tiny) 8 else if (short) 12 else 16
        val outer = circle + ring2 * 2
        val stop = TextView(this).apply {
            text = AlarmLabels.stopShort(this@AlarmRingActivity)
            contentDescription = AlarmLabels.stop(this@AlarmRingActivity)
            setTextColor(Color.WHITE); textSize = if (tiny) 12f else 14f; typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER; maxLines = 2
            setPadding(dp(ring2 + 4), 0, dp(ring2 + 4), 0)
            background = LayerDrawable(arrayOf(
                oval(Color.argb(23, 59, 130, 246)),   // 바깥 링 rgba(59,130,246,.09)
                oval(Color.argb(56, 59, 130, 246)),   // 안쪽 링 rgba(59,130,246,.22)
                oval(Color.parseColor("#3b82f6")),     // 버튼
            )).apply {
                setLayerInset(1, dp(ring2 - ring1), dp(ring2 - ring1), dp(ring2 - ring1), dp(ring2 - ring1))
                setLayerInset(2, dp(ring2), dp(ring2), dp(ring2), dp(ring2))
            }
            isClickable = true
            setOnClickListener { act(AlarmService.ACTION_STOP) }
        }
        // 시안의 위 간격 18dp는 링(그림자)을 빼고 잰 값 → 링 두께만큼 줄인다
        card.addView(stop, LinearLayout.LayoutParams(dp(outer), dp(outer)).apply {
            topMargin = dp(maxOf(0, (if (tiny) 6 else if (short) 10 else 18) - ring2)); gravity = Gravity.CENTER_HORIZONTAL
        })

        // ⑦ "5분 후 다시" 작은 알약 버튼 — 아주 작은 화면은 이전처럼 끄기 하나만(5분 후는 알림 버튼에 있음)
        if (!tiny) {
            card.addView(TextView(this).apply {
                text = AlarmLabels.snooze(this@AlarmRingActivity)
                setTextColor(soft); textSize = 12f; maxLines = 1
                setPadding(dp(16), dp(7), dp(16), dp(7))
                background = GradientDrawable().apply { cornerRadius = dp(16).toFloat(); setColor(Color.argb(20, 255, 255, 255)) }
                isClickable = true
                setOnClickListener { act(AlarmService.ACTION_SNOOZE) }
            }, lp(maxOf(4, (if (short) 14 else 22) - ring2)))
        }

        // 뒤(바탕화면)를 어둡게 비치는 막 + 가운데 카드. 화면이 낮아도 잘리지 않게 스크롤 안에 둔다.
        val cardW = minOf((dm.widthPixels * (if (tiny) 0.96f else if (short) 0.9f else 0.84f)).toInt(), dp(400))
        val holder = FrameLayout(this).apply {
            addView(card, FrameLayout.LayoutParams(cardW, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER).apply {
                val m = dp(if (tiny) 4 else 16); topMargin = m; bottomMargin = m
            })
        }
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addView(holder, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        }
        return FrameLayout(this).apply {
            setBackgroundColor(Color.argb(140, 5, 8, 20))   // rgba(5,8,20,.55)
            addView(scroll, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
    }

    private fun cardBackground(radius: Float) = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#27325f"), Color.parseColor("#0b1026"))
    ).apply {
        gradientType = GradientDrawable.RADIAL_GRADIENT
        setGradientCenter(0.5f, 0.25f)
        gradientRadius = 1000f   // 크기가 정해지면 addOnLayoutChangeListener가 맞춘다
        cornerRadius = radius
    }

    private fun oval(color: Int) = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color) }

    /** 앱 언어(JS가 넘긴 ko·en·ja·zh-Hans …)의 로캘. 넘겨받지 못했으면 기기 언어 */
    private fun ringLocale(): Locale =
        AlarmLabels.lang(this)?.let { tag -> try { Locale.forLanguageTag(tag).takeIf { it.language.isNotEmpty() } } catch (_: Exception) { null } }
            ?: Locale.getDefault()

    /** "오후 2:00"(오전/오후 작게) 또는 24시간 "14:00" — 기기의 12/24시간 설정을 따른다 */
    private fun timeText(at: Long, locale: Locale): CharSequence {
        val date = Date(at)
        val is24 = android.text.format.DateFormat.is24HourFormat(this)
        val pattern = android.text.format.DateFormat.getBestDateTimePattern(locale, if (is24) "Hm" else "hm")
        val text = SimpleDateFormat(pattern, locale).format(date)
        if (is24) return text
        val marker = SimpleDateFormat("a", locale).format(date)
        val i = text.indexOf(marker)
        if (marker.isEmpty() || i < 0) return text
        return SpannableString(text).apply {
            val end = i + marker.length
            setSpan(RelativeSizeSpan(16f / 38f), i, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(ForegroundColorSpan(Color.argb(217, 255, 255, 255)), i, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) // opacity .85
        }
    }

    /** "오늘 · 11월 25일 수요일" / "내일 · …" / 그 밖엔 날짜만. 일정 정보가 없으면(옛 예약) 날짜만 */
    private fun dateText(at: Long, now: Long, known: Boolean, locale: Locale): String {
        val pattern = android.text.format.DateFormat.getBestDateTimePattern(locale, "MMMMdEEEE")
        val date = SimpleDateFormat(pattern, locale).format(Date(at))
        if (!known) return date
        val prefix = when (dayDiff(now, at)) {
            0 -> AlarmLabels.today(this)
            1 -> AlarmLabels.tomorrow(this)
            else -> null
        }
        return if (prefix != null) "$prefix · $date" else date
    }

    /** 기기 시간대 기준 달력 날짜 차이(at의 날짜 - now의 날짜). 자정·서머타임과 무관하게 날짜만 비교한다 */
    private fun dayDiff(now: Long, at: Long): Int {
        val a = Calendar.getInstance().apply { timeInMillis = now }
        val b = Calendar.getInstance().apply { timeInMillis = at }
        if (a.get(Calendar.YEAR) == b.get(Calendar.YEAR)) return b.get(Calendar.DAY_OF_YEAR) - a.get(Calendar.DAY_OF_YEAR)
        a.add(Calendar.DAY_OF_YEAR, 1)
        return if (a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)) 1
        else if (b.before(a)) -1 else 2
    }

    /**
     * 울리는 동안 뒤로 가기로 울림 화면이 닫히면 소리·진동은 계속되는데 끌 곳이 안 보인다(사용자 보고 "알람이 숨어 버림").
     * → 뒤로 가기는 무시한다. 울림 화면은 끄기·5분 후, 또는 다른 경로로 꺼졌을 때(onResume·finishIfShowing)만 닫힌다.
     * Android 13+에서 예측형 뒤로 가기를 쓰는 경우(onBackPressed가 안 불림)를 위해 콜백도 함께 건다.
     */
    private fun blockBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                val cb = OnBackInvokedCallback { /* 울리는 중에는 닫지 않는다 */ }
                onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb)
                backBlocker = cb
            } catch (e: Exception) { e.printStackTrace() }
        }
    }

    @Deprecated("Android 13 미만·예측형 뒤로 가기를 안 쓰는 경우의 뒤로 가기")
    @Suppress("DEPRECATION", "MissingSuperCall")
    override fun onBackPressed() {
        // 울리는 중에는 닫지 않는다(super를 부르지 않음). 이미 꺼졌다면 남아 있을 이유가 없으니 닫는다.
        if (AlarmService.currentRinging == null) finish()
    }

    /** 이미 떠 있는 울림 화면을 다시 부르면(앱 열기·알림 누르기·커버 재표시) 여기로 온다. 다른 일정이 울리면 내용을 새로 그린다. */
    override fun onNewIntent(newIntent: Intent) {
        super.onNewIntent(newIntent)
        val newId = newIntent.getStringExtra(AlarmScheduling.EXTRA_RECORD_ID) ?: ""
        setIntent(newIntent)
        if (newId.isNotEmpty() && newId != recordId) recreate()
    }

    private fun act(action: String) {
        // 서비스가 처리하기 전에 이 화면이 닫히면서 앱 화면이 앞으로 오면, 앱은 "아직 울리는 중"으로 보고 울림 화면을
        // 다시 띄운다(MalloAlarmModule.OnActivityEntersForeground). 누른 즉시 울림 상태를 비워 그 되돌아옴을 막는다.
        // 서비스는 인텐트의 recordId·title·body·tone으로 처리하므로 이 값이 없어도 된다.
        AlarmService.currentRinging = null
        try {
            startService(Intent(this, AlarmService::class.java).apply {
                this.action = action
                putExtras(intent)
                putExtra(AlarmScheduling.EXTRA_RECORD_ID, recordId)
            })
        } catch (e: Exception) { e.printStackTrace() }
        finish()
    }

    override fun onPause() {
        inFront = false
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        inFront = true
        // 다른 경로(알림 버튼 등)로 이미 꺼졌으면 남아 있을 이유가 없다
        if (AlarmService.currentRinging == null) finish()
        // 설정에서 "다른 앱 위에 표시"를 켜고 돌아온 경우 — 이 슬롯부터 가려지면 다시 올라오게(1.2.3)
        else AlarmService.refreshKeepFront()
    }

    override fun onDestroy() {
        // 늦게 끝나는 예전 화면이 새 화면의 "맨 앞" 표시를 지우지 않게 지금 화면일 때만
        if (showing?.get() === this) inFront = false
        if (Build.VERSION.SDK_INT >= 33) {
            (backBlocker as? OnBackInvokedCallback)?.let {
                try { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) } catch (_: Exception) {}
            }
        }
        backBlocker = null
        if (showing?.get() === this) showing = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_DISMISS_KEYGUARD = "dismissKeyguard"
        @Volatile private var showing: WeakReference<AlarmRingActivity>? = null
        /** 울림 화면이 지금 맨 앞(resumed)인지 — AlarmService가 가려졌는지 볼 때 쓴다 */
        @Volatile var inFront = false
            private set

        fun finishIfShowing() {
            val a = showing?.get() ?: return
            a.runOnUiThread { if (!a.isFinishing) a.finish() }
        }

        /** 지금 울리는 알람의 울림 화면 인텐트. 울리는 중이 아니면 null */
        fun ringingIntent(context: Context): Intent? {
            val r = AlarmService.currentRinging ?: return null
            return intent(context, r.recordId, r.title, r.body, r.soundOn, r.vibOn, r.tone, r.meta)
        }

        fun intent(context: Context, recordId: String, title: String, body: String, soundOn: Boolean, vibOn: Boolean, tone: String, meta: RingMeta = RingMeta.NONE) =
            Intent(context, AlarmRingActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(AlarmScheduling.EXTRA_RECORD_ID, recordId)
                putExtra(AlarmScheduling.EXTRA_TITLE, title)
                putExtra(AlarmScheduling.EXTRA_BODY, body)
                putExtra(AlarmScheduling.EXTRA_SOUND_ON, soundOn)
                putExtra(AlarmScheduling.EXTRA_VIB_ON, vibOn)
                putExtra(AlarmScheduling.EXTRA_TONE, tone) // 울림 화면의 "5분 후"도 같은 소리로 다시 건다
                meta.putTo(this) // 카드의 일정 시각·몇 분 전 + 울림 화면 "5분 후" 재예약에도 이어진다(1.2.3)
            }
    }
}
