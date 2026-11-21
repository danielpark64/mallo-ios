package com.danielpark.sayram.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.util.TypedValue
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.RemoteViews
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.widget.RemoteViewsCompat
import java.util.Calendar

/**
 * 위젯 세 종류를 그린다. 갱신은 ①앱이 요약을 넘길 때 ②자정·다음 일정 시각에 한 번(AlarmManager, 위젯이 있을 때만)
 * ③재부팅·시간 변경 때뿐이다 — 주기적 갱신(폴링)은 없다.
 */
object WidgetRender {
  private const val ACTION_REFRESH = "com.danielpark.sayram.widget.REFRESH"
  private const val DAY_MS = 86_400_000L

  fun updateAll(ctx: Context) {
    val mgr = AppWidgetManager.getInstance(ctx)
    val p = WidgetStore.read(ctx)
    val now = System.currentTimeMillis()
    val small = mgr.getAppWidgetIds(ComponentName(ctx, SmallWidget::class.java))
    val medium = mgr.getAppWidgetIds(ComponentName(ctx, MediumWidget::class.java))
    val large = mgr.getAppWidgetIds(ComponentName(ctx, LargeWidget::class.java))
    for (id in small) mgr.updateAppWidget(id, small(ctx, p, now))
    for (id in medium) mgr.updateAppWidget(id, medium(ctx, p, now))
    for (id in large) mgr.updateAppWidget(id, large(ctx, p, now, id))
    scheduleNext(ctx, p, now, small.size + medium.size + large.size > 0)
  }

  /**
   * 크게 위젯 하나만 다시 그린다 — 크기를 바꿨을 때(LargeWidget.onAppWidgetOptionsChanged 전용).
   * widgetId는 반드시 크게 위젯 id여야 한다(다른 종류 id를 넘기면 그 위젯이 크게 모양으로 바뀐다). 다음 갱신 예약은 그대로 둔다
   */
  internal fun updateLarge(ctx: Context, widgetId: Int) {
    val mgr = AppWidgetManager.getInstance(ctx)
    mgr.updateAppWidget(widgetId, large(ctx, WidgetStore.read(ctx), System.currentTimeMillis(), widgetId))
  }

  // ── 링크 ──────────────────────────────────────────────────────────────────
  /** 앱의 시작 화면(MainActivity)을 직접 지정한 링크 열기 — 위젯 링크는 mallo://widget?… (lib/widget.ts) */
  private fun viewIntent(ctx: Context, uri: Uri?): Intent {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    return Intent(Intent.ACTION_VIEW).apply {
      component = launch?.component
      setPackage(ctx.packageName) // 시작 화면을 못 찾아도 암시적 인텐트가 되지 않게
      if (uri != null) data = uri
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
  }

  private fun open(ctx: Context, req: Int, query: String?): PendingIntent {
    val intent = if (query == null) ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: viewIntent(ctx, null)
    else viewIntent(ctx, Uri.parse("mallo://widget?$query"))
    return PendingIntent.getActivity(ctx, req, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun q(v: String) = Uri.encode(v)

  // ── 색(밝은·어두운 화면은 리소스가 따라간다) ─────────────────────────────────
  private fun setColorRes(ctx: Context, v: RemoteViews, id: Int, res: Int) {
    if (Build.VERSION.SDK_INT >= 31) v.setColor(id, "setTextColor", res)
    else v.setTextColor(id, ContextCompat.getColor(ctx, res))
  }

  private fun parse(hex: String, fallback: Int): Int = try { Color.parseColor(hex) } catch (e: Exception) { fallback }

  // ── 작게: 바로 다음 일정 ────────────────────────────────────────────────────
  private fun small(ctx: Context, p: Payload?, now: Long): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.sw_small)
    val list = p?.upcoming(now) ?: emptyList()
    val first = list.firstOrNull()
    if (p != null) v.setTextViewText(R.id.sw_label, p.strNext)
    if (first == null) {
      v.setViewVisibility(R.id.sw_date, View.GONE)
      v.setViewVisibility(R.id.sw_time, View.GONE)
      v.setViewVisibility(R.id.sw_more, View.GONE)
      v.setTextViewText(R.id.sw_title, p?.strEmpty ?: ctx.getString(R.string.sw_open_app))
      v.setOnClickPendingIntent(R.id.sw_root, open(ctx, 10, null))
      return v
    }
    v.setViewVisibility(R.id.sw_date, View.VISIBLE)
    v.setViewVisibility(R.id.sw_time, View.VISIBLE)
    v.setTextViewText(R.id.sw_date, first.date)
    v.setTextViewText(R.id.sw_time, first.time)
    v.setTextViewText(R.id.sw_title, first.title)
    // 같은 날 남은 일정 수
    val day = Payload.startOfDay(first.at)
    val more = list.drop(1).count { Payload.startOfDay(it.at) == day }
    if (more > 0) {
      v.setViewVisibility(R.id.sw_more, View.VISIBLE)
      v.setTextViewText(R.id.sw_more, p!!.strMore.replace("{n}", more.toString()))
    } else v.setViewVisibility(R.id.sw_more, View.GONE)
    v.setOnClickPendingIntent(R.id.sw_root, open(ctx, 11, "id=" + q(first.id)))
    return v
  }

  // ── 중간: 일정 4개 + 마이크 ─────────────────────────────────────────────────
  private val ROWS = intArrayOf(R.id.sw_row1, R.id.sw_row2, R.id.sw_row3, R.id.sw_row4)
  private val WHENS = intArrayOf(R.id.sw_when1, R.id.sw_when2, R.id.sw_when3, R.id.sw_when4)
  private val TITLES = intArrayOf(R.id.sw_title1, R.id.sw_title2, R.id.sw_title3, R.id.sw_title4)

  private fun medium(ctx: Context, p: Payload?, now: Long): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.sw_medium)
    val list = p?.upcoming(now) ?: emptyList()
    if (p != null) v.setTextViewText(R.id.sw_label, p.strUpcoming)
    for (i in ROWS.indices) {
      val it = list.getOrNull(i)
      if (it == null) { v.setViewVisibility(ROWS[i], View.GONE); continue }
      v.setViewVisibility(ROWS[i], View.VISIBLE)
      v.setTextViewText(WHENS[i], it.whenText)
      v.setTextViewText(TITLES[i], it.title)
      setColorRes(ctx, v, TITLES[i], if (it.end != null) R.color.sw_blue else R.color.sw_text)
      v.setOnClickPendingIntent(ROWS[i], open(ctx, 20 + i, "id=" + q(it.id)))
    }
    v.setViewVisibility(R.id.sw_empty, if (list.isEmpty()) View.VISIBLE else View.GONE)
    v.setTextViewText(R.id.sw_empty, p?.strEmpty ?: ctx.getString(R.string.sw_open_app))
    v.setOnClickPendingIntent(R.id.sw_root, open(ctx, 25, null))
    v.setOnClickPendingIntent(R.id.sw_mic, open(ctx, 26, "a=mic"))
    return v
  }

  // ── 크게: 이번 달 달력(근무 첫 글자 + 일정 점) + 스크롤 목록 ──────────────────
  private val WD_IDS = intArrayOf(R.id.sw_wd0, R.id.sw_wd1, R.id.sw_wd2, R.id.sw_wd3, R.id.sw_wd4, R.id.sw_wd5, R.id.sw_wd6)

  private fun large(ctx: Context, p: Payload?, now: Long, widgetId: Int): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.sw_large)
    val cal = Calendar.getInstance().apply { timeInMillis = now }
    val y = cal.get(Calendar.YEAR)
    val m = cal.get(Calendar.MONTH)
    val today = cal.get(Calendar.DAY_OF_MONTH)
    v.setTextViewText(R.id.sw_month, p?.months?.firstOrNull { it.first == y && it.second == m + 1 }?.third ?: "$y.${m + 1}")
    p?.wd?.forEachIndexed { i, s -> if (i < 7) v.setTextViewText(WD_IDS[i], s) }
    v.setOnClickPendingIntent(R.id.sw_mic, open(ctx, 30, "a=mic"))
    v.setOnClickPendingIntent(R.id.sw_month, open(ctx, 31, null))

    // 달력: 일요일 시작, 5~6주
    v.removeAllViews(R.id.sw_cal)
    val first = Calendar.getInstance().apply { clear(); set(y, m, 1) }
    val lead = first.get(Calendar.DAY_OF_WEEK) - 1
    val days = first.getActualMaximum(Calendar.DAY_OF_MONTH)
    val weeks = (lead + days + 6) / 7
    val dotColor = ContextCompat.getColor(ctx, R.color.sw_blue)
    val subColor = ContextCompat.getColor(ctx, R.color.sw_sub)
    val accentColor = ContextCompat.getColor(ctx, R.color.sw_accent)
    for (w in 0 until weeks) {
      val row = RemoteViews(ctx.packageName, if (weeks == 6) R.layout.sw_cal_row6 else R.layout.sw_cal_row)
      for (c in 0 until 7) {
        val cell = RemoteViews(ctx.packageName, R.layout.sw_cal_cell)
        val d = w * 7 + c - lead + 1
        if (d in 1..days) {
          cell.setTextViewText(R.id.sw_day, d.toString())
          val day = Calendar.getInstance().apply { clear(); set(y, m, d) }
          val idx = p?.index(day) ?: -1
          val hol = if (p != null && idx >= 0) p.holiday(idx) else null
          if (d == today) {
            cell.setInt(R.id.sw_day, "setBackgroundResource", R.drawable.sw_today)
            cell.setTextColor(R.id.sw_day, Color.WHITE)
          } else {
            // 공휴일은 일요일과 같은 빨간 숫자
            setColorRes(ctx, cell, R.id.sw_day, when {
              c == 0 || hol != null -> R.color.sw_accent
              c == 6 -> R.color.sw_blue
              else -> R.color.sw_text
            })
          }
          // 날짜 아래 한 줄: 근무 첫 글자 → 공휴일 이름(빨강) 또는 음력·절기(회색) → 일정 점.
          // 근무가 있으면 공휴일·음력은 조금 작게(0.85배, 칸 폭에 맞게). 그래도 넘치면 TextView가 줄 전체를 줄인다(sw_cal_cell autoSize)
          val sub = SpannableStringBuilder()
          if (p != null && idx >= 0) {
            val s = p.shift[idx]
            val hasShift = s >= 0 && s < p.shiftLabels.size
            if (hasShift) {
              sub.append(p.shiftLabels[s], ForegroundColorSpan(parse(p.shiftColors[s], subColor)), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
            val second = hol ?: p.lunar(idx)
            if (second != null) {
              val start = sub.length
              sub.append(second)
              sub.setSpan(ForegroundColorSpan(if (hol != null) accentColor else subColor), start, sub.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
              if (hasShift) sub.setSpan(RelativeSizeSpan(0.85f), start, sub.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
            if (p.ev[idx] == 1) sub.append("•", ForegroundColorSpan(dotColor), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          }
          cell.setTextViewText(R.id.sw_sub, sub)
          cell.setOnClickPendingIntent(R.id.sw_cell, open(ctx, 100 + d, "d=%04d-%02d-%02d".format(y, m + 1, d)))
        }
        row.addView(R.id.sw_row, cell)
      }
      v.addView(R.id.sw_cal, row)
    }

    // 목록: 손가락으로 스크롤(RemoteCollectionItems). 누르면 그 일정
    val list = p?.upcoming(now) ?: emptyList()
    val items = RemoteViewsCompat.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(1)
    list.forEachIndexed { i, it ->
      val r = RemoteViews(ctx.packageName, R.layout.sw_list_item)
      r.setTextViewText(R.id.sw_item_when, it.whenText)
      r.setTextViewText(R.id.sw_item_title, it.title)
      setColorRes(ctx, r, R.id.sw_item_title, if (it.end != null) R.color.sw_blue else R.color.sw_text)
      r.setOnClickFillInIntent(R.id.sw_item, Intent().setData(Uri.parse("mallo://widget?id=" + q(it.id))))
      items.addItem(i.toLong() + 1, r)
    }
    RemoteViewsCompat.setRemoteAdapter(ctx, v, widgetId, R.id.sw_list, items.build())
    // 목록 항목의 링크 틀(항목마다 data만 채운다) — 채워 넣으려면 MUTABLE이어야 한다. 대상은 앱 시작 화면으로 명시
    val template = PendingIntent.getActivity(ctx, 32, viewIntent(ctx, null),
      PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0))
    v.setPendingIntentTemplate(R.id.sw_list, template)
    v.setViewVisibility(R.id.sw_empty, if (list.isEmpty()) View.VISIBLE else View.GONE)
    v.setTextViewText(R.id.sw_empty, p?.strEmpty ?: ctx.getString(R.string.sw_open_app))
    fitList(ctx, v, widgetId, weeks)
    return v
  }

  // ── 크게: 목록이 보여 주는 높이를 줄 높이의 배수로 ─────────────────────────────────
  // 목록(ListView)이 남은 높이를 다 쓰면 맨 아랫줄이 반쯤 잘려 보인다. 위젯 높이에서 목록 위(고정 dp)를 빼고
  // 들어가는 줄 수를 센 뒤, 남는 자투리만큼 목록 아래 여백(MARGIN_BOTTOM)을 준다.
  // 목록 높이 자체는 match_parent 그대로 둔다 — 고정 높이를 주면 실제 위젯이 계산보다 작을 때(가로 홈, 태블릿·폴더블,
  // MAX_HEIGHT를 크게 알리는 런처) 목록이 부모 밖으로 넘쳐 잘리고, ListView는 다 보인다고 여겨 아래 일정까지
  // 스크롤할 수 없다. 여백 방식이면 계산이 틀려도 "아랫줄이 조금 잘려 보임"으로 끝나고 스크롤은 항상 된다.
  // setViewLayoutMargin·setViewLayoutHeight는 Android 12+에만 있다(그 아래는 레이아웃 그대로).
  // 아래 값은 sw_large.xml·sw_cal_row(6).xml·sw_list_item.xml과 같아야 한다.
  private const val LARGE_PAD_TOP_DP = 12f
  private const val LARGE_PAD_BOTTOM_DP = 6f
  private const val LARGE_HEADER_DP = 28f      // 달 이름·마이크 줄
  private const val LARGE_WEEKDAY_DP = 16f + 4f // 요일 줄 + 위아래 여백
  private const val LARGE_DIVIDER_DP = 4f       // 구분선 위 여백(선 1px은 따로)
  private const val ROW_DP = 34f
  private const val ROW6_DP = 33f

  private fun fitList(ctx: Context, v: RemoteViews, widgetId: Int, weeks: Int) {
    if (Build.VERSION.SDK_INT < 31) return
    // 런처는 같은 레이아웃이면 이미 그린 뷰에 새 동작만 덧입힌다(reapply) — 직전에 준 높이·여백이 남지 않게
    // 높이(match_parent)와 여백을 매번 명시한다. 예전 빌드가 고정 px 높이를 준 위젯도 이걸로 match_parent로 돌아온다.
    v.setViewLayoutHeight(R.id.sw_list, ViewGroup.LayoutParams.MATCH_PARENT.toFloat(), TypedValue.COMPLEX_UNIT_PX)
    // 계산이 실패해도 위젯 그리기·다음 갱신 예약(updateAll → scheduleNext)이 끊기면 안 된다.
    // 실패하거나 건너뛰면 아래 여백 0(목록이 남은 높이를 다 씀 — 아랫줄이 반쯤 잘려 보일 수 있지만 스크롤은 된다).
    var bottomPx = 0f
    try {
      val opts = AppWidgetManager.getInstance(ctx).getAppWidgetOptions(widgetId)
      // 높이는 항상 세로 화면 기준(MAX_HEIGHT)으로 계산한다.
      // 예전에는 그리는 순간의 앱 설정 방향으로 MIN/MAX를 골랐는데, 자정·일정 시각 갱신은 사용자가 가로 화면
      // 앱을 보는 중에도 일어난다. 그때 가로 높이(MIN_HEIGHT)로 줄 수를 정하면 세로 홈으로 돌아왔을 때 목록이 1~2줄뿐이다.
      // 크기별 뷰를 함께 넘기는 RemoteViews(Map<SizeF, RemoteViews>)도 검토했지만, 달력 칸(최대 42개)·목록을
      // 크기마다 한 벌씩 더 만들어 넘겨야 해 전송 크기와 코드가 두 배가 된다. 폰 홈 화면은 거의 세로로 쓰므로
      // 세로 기준 하나로 둔다 — 가로 홈 화면처럼 실제 높이가 더 작으면 여백이 줄 수와 안 맞아 아랫줄이 조금 잘려
      // 보일 수 있다(목록은 match_parent라 스크롤로 끝까지 볼 수 있다).
      val heightDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
      val itemPx = if (heightDp > 0) listItemHeightPx(ctx) else 0
      if (heightDp > 0 && itemPx > 0) {
        val dp = ctx.resources.displayMetrics.density
        val topDp = LARGE_PAD_TOP_DP + LARGE_HEADER_DP + LARGE_WEEKDAY_DP + weeks * (if (weeks == 6) ROW6_DP else ROW_DP) + LARGE_DIVIDER_DP + LARGE_PAD_BOTTOM_DP
        val availPx = heightDp * dp - topDp * dp - 1f // 구분선 1px
        if (availPx > itemPx) {
          val rows = (availPx / itemPx).toInt()
          // 자투리는 한 줄 높이보다 작다. 내림해서 목록이 계산보다 1px 커지지 않게 한다
          bottomPx = kotlin.math.floor(availPx - rows * itemPx).coerceIn(0f, (itemPx - 1).toFloat())
        }
      }
    } catch (e: Exception) {
      android.util.Log.w("SayramWidget", "fitList 실패 — 목록 아래 여백 없이 그린다", e)
      bottomPx = 0f
    }
    v.setViewLayoutMargin(R.id.sw_list, RemoteViews.MARGIN_BOTTOM, bottomPx, TypedValue.COMPLEX_UNIT_PX)
  }

  /**
   * 목록 한 줄의 실제 높이(px) — sw_list_item을 이 앱 안에서 직접 부풀려 잰다.
   * 13sp 글자는 시스템 글자 크기를 따르고, 한글 대체 글꼴 줄 높이·Android 15의 elegantTextHeight 기본값까지
   * 런처가 그릴 때와 같아야 하므로 글자 크기로 계산하지 않고 같은 레이아웃을 잰다.
   * sw_list_item의 글자는 fallbackLineSpacing="false"라 한글이 있든 없든(영어만 있는 줄도) 줄 높이가 같다 —
   * 그래서 견본 한 줄로 잰 값이 모든 줄에 맞는다.
   */
  private fun listItemHeightPx(ctx: Context): Int {
    val item = LayoutInflater.from(ctx).inflate(R.layout.sw_list_item, null)
    item.findViewById<TextView>(R.id.sw_item_when).text = "12/24 오후 6:00"
    item.findViewById<TextView>(R.id.sw_item_title).text = "일정 Ag"
    item.measure(View.MeasureSpec.makeMeasureSpec(ctx.resources.displayMetrics.widthPixels, View.MeasureSpec.AT_MOST),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
    return item.measuredHeight
  }

  // ── 다음 갱신 예약: 자정과 다음 일정 시각 중 빠른 쪽, 한 번만 ─────────────────
  private fun scheduleNext(ctx: Context, p: Payload?, now: Long, any: Boolean) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = PendingIntent.getBroadcast(ctx, 0,
      Intent(ctx, WidgetRefreshReceiver::class.java).setAction(ACTION_REFRESH),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    if (!any) { am.cancel(pi); return }
    val midnight = Payload.startOfDay(now) + DAY_MS
    val nextItem = p?.items?.filter { it.timed && it.at > now }?.minOfOrNull { it.at }
    val at = minOf(midnight, nextItem ?: Long.MAX_VALUE) + 1000
    // 정확한 알람 권한 없이 쓰는 일반 예약 — 절전 중에는 조금 늦을 수 있다(위젯 표시라 괜찮다)
    am.set(AlarmManager.RTC, at, pi)
  }
}
