package com.danielpark.sayram.widget

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.Calendar

/** 위젯 요약(lib/widgetData.ts의 WidgetPayload) — 앱 저장소의 작은 JSON 파일 하나 */
object WidgetStore {
  private const val FILE = "sayram-widget.json"

  /** 내용이 바뀌었으면 쓰고 true, 같으면 아무것도 안 하고 false */
  fun write(ctx: Context, json: String): Boolean {
    val f = File(ctx.filesDir, FILE)
    if (f.exists() && try { f.readText() == json } catch (e: Exception) { false }) return false
    // 쓰는 도중 위젯이 읽어도 깨진 파일을 보지 않게 임시 파일에 쓰고 바꿔 넣는다
    val tmp = File(ctx.filesDir, "$FILE.tmp")
    tmp.writeText(json)
    tmp.renameTo(f)
    return true
  }

  fun read(ctx: Context): Payload? = try {
    val f = File(ctx.filesDir, FILE)
    if (f.exists()) Payload(JSONObject(f.readText())) else null
  } catch (e: Exception) {
    null
  }
}

class Item(o: JSONObject) {
  val id: String = o.getString("id")
  val at: Long = o.getLong("at")
  val end: Long? = if (o.isNull("end")) null else o.getLong("end")
  val timed: Boolean = o.getBoolean("timed")
  val title: String = o.getString("title")
  val whenText: String = o.getString("when")
  val date: String = o.getString("date")
  val time: String = o.getString("time")
}

class Payload(o: JSONObject) {
  /** days 배열의 첫날 0시 */
  val from: Calendar
  val shift: IntArray
  val ev: IntArray
  val shiftLabels: List<String>
  val shiftColors: List<String>
  /** (연, 월 1~12, 이름) */
  val months: List<Triple<Int, Int, String>>
  val wd: List<String>
  val items: List<Item>
  val strNext: String
  val strUpcoming: String
  val strEmpty: String
  val strMore: String

  init {
    val p = o.getString("from").split("-").map { it.toInt() }
    from = Calendar.getInstance().apply { clear(); set(p[0], p[1] - 1, p[2]) }
    val sa = o.getJSONArray("shift"); shift = IntArray(sa.length()) { sa.getInt(it) }
    val ea = o.getJSONArray("ev"); ev = IntArray(ea.length()) { ea.getInt(it) }
    val sh = o.getJSONArray("shifts")
    shiftLabels = (0 until sh.length()).map { sh.getJSONObject(it).getString("s") }
    shiftColors = (0 until sh.length()).map { sh.getJSONObject(it).getString("c") }
    val ma = o.getJSONArray("months")
    months = (0 until ma.length()).map { val m = ma.getJSONObject(it); Triple(m.getInt("y"), m.getInt("m"), m.getString("title")) }
    val wa = o.getJSONArray("wd"); wd = (0 until wa.length()).map { wa.getString(it) }
    val ia = o.getJSONArray("items"); items = (0 until ia.length()).map { Item(ia.getJSONObject(it)) }
    val s = o.getJSONObject("str")
    strNext = s.getString("next"); strUpcoming = s.getString("upcoming"); strEmpty = s.getString("empty"); strMore = s.getString("more")
  }

  /** 지금 기준 다가오는 일정 — 시각 있는 일정은 그 시각이 지나면, 나머지는 그날(기간은 끝나는 날)이 지나면 빠진다. 30일 안 */
  fun upcoming(now: Long): List<Item> {
    val today = startOfDay(now)
    val until = today + 30L * 86_400_000L
    return items.filter { (if (it.timed) it.at > now else (it.end ?: it.at) >= today) && it.at < until }
  }

  /** 그날의 days 번호(범위 밖이면 -1) */
  fun index(day: Calendar): Int {
    val i = Math.round((startOfDay(day.timeInMillis) - from.timeInMillis) / 86_400_000.0).toInt()
    return if (i in ev.indices) i else -1
  }

  companion object {
    fun startOfDay(ms: Long): Long = Calendar.getInstance().apply {
      timeInMillis = ms; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
  }
}
