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
import android.view.View
import android.widget.RemoteViews
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
    for (w in 0 until weeks) {
      val row = RemoteViews(ctx.packageName, if (weeks == 6) R.layout.sw_cal_row6 else R.layout.sw_cal_row)
      for (c in 0 until 7) {
        val cell = RemoteViews(ctx.packageName, R.layout.sw_cal_cell)
        val d = w * 7 + c - lead + 1
        if (d in 1..days) {
          cell.setTextViewText(R.id.sw_day, d.toString())
          if (d == today) {
            cell.setInt(R.id.sw_day, "setBackgroundResource", R.drawable.sw_today)
            cell.setTextColor(R.id.sw_day, Color.WHITE)
          } else {
            setColorRes(ctx, cell, R.id.sw_day, when (c) { 0 -> R.color.sw_accent; 6 -> R.color.sw_blue; else -> R.color.sw_text })
          }
          val day = Calendar.getInstance().apply { clear(); set(y, m, d) }
          val idx = p?.index(day) ?: -1
          val sub = SpannableStringBuilder()
          if (p != null && idx >= 0) {
            val s = p.shift[idx]
            if (s >= 0 && s < p.shiftLabels.size) {
              sub.append(p.shiftLabels[s], ForegroundColorSpan(parse(p.shiftColors[s], subColor)), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
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
    return v
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
