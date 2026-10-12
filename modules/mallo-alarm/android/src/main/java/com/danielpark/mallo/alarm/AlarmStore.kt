package com.danielpark.mallo.alarm

import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.HandlerThread
import org.json.JSONArray
import org.json.JSONObject

/**
 * 네이티브 AlarmManager 예약 원장(ledger).
 *
 * Android는 재부팅·앱 교체 시 AlarmManager 예약을 전부 지운다. Expo 쪽은 expo-notifications가
 * 자체 BOOT_COMPLETED 리시버로 되살리지만 우리가 직접 건 예약은 복구 주체가 없으므로,
 * JS가 예약할 때마다 여기에 남기고 BootReceiver가 부팅 직후 그대로 다시 건다.
 *
 * 키는 Expo 알림 식별자와 같은 문자열(`mallo_<recordId>_<slot>`)을 그대로 쓴다 — 네이티브가
 * 울릴 때 같은 슬롯의 Expo 예약(쌍둥이)을 이 키로 취소하기 위해서다. PendingIntent requestCode는
 * 키의 hashCode()로 만든다(Java 문자열 해시는 결정적).
 *
 * 저장 위치는 device-protected 저장소 — 잠금해제 전(Direct Boot)에도 BootReceiver가 읽을 수 있어야
 * 새벽 OTA 재부팅 뒤 아침 일정이 비는 일이 없다. 여기 들어가는 내용(일정 내용·시각)은 이미
 * VISIBILITY_PUBLIC 알림으로 잠금화면에 그대로 보이는 정보라 기밀성 기준선이 낮아지지 않는다.
 */
object AlarmStore {
    private const val PREFS = "MalloNativeAlarmStore"
    private const val KEY = "entries"
    private const val KEEP_PAST_MS = 24 * 60 * 60 * 1000L
    private const val FLUSH_DELAY_MS = 200L

    data class Entry(
        val key: String,          // Expo 식별자와 동일 (mallo_<recordId>_<slot>, 스누즈는 mallo_<recordId>_z<slot>)
        val recordId: String,
        val triggerAtMs: Long,
        val title: String,
        val body: String,
        val soundOn: Boolean,
        val vibOn: Boolean,
    ) {
        val requestCode: Int get() = key.hashCode()
    }

    private var cache: LinkedHashMap<String, Entry>? = null

    private val flushHandler = Handler(HandlerThread("MalloAlarmStoreFlush").apply { start() }.looper)
    private var pendingFlush: Runnable? = null

    @Synchronized
    fun put(context: Context, entry: Entry) {
        load(context)[entry.key] = entry
        scheduleFlush(context)
    }

    @Synchronized
    fun remove(context: Context, keys: Collection<String>) {
        val map = load(context)
        var changed = false
        for (k in keys) if (map.remove(k) != null) changed = true
        if (changed) scheduleFlush(context)
    }

    @Synchronized
    fun get(context: Context, key: String): Entry? = load(context)[key]

    @Synchronized
    fun all(context: Context): List<Entry> {
        val map = load(context)
        flushNow(context)
        return map.values.toList()
    }

    @Synchronized
    fun byRecordId(context: Context, recordId: String): List<Entry> =
        load(context).values.filter { it.recordId == recordId }

    @Synchronized
    fun clear(context: Context) {
        load(context).clear()
        flushNow(context)
    }

    private fun scheduleFlush(context: Context) {
        pendingFlush?.let { flushHandler.removeCallbacks(it) }
        val appCtx = context.applicationContext
        val r = Runnable { flushNow(appCtx) }
        pendingFlush = r
        flushHandler.postDelayed(r, FLUSH_DELAY_MS)
    }

    @Synchronized
    private fun flushNow(context: Context) {
        pendingFlush?.let { flushHandler.removeCallbacks(it) }
        pendingFlush = null
        cache?.let { flush(context, it) }
    }

    private fun load(context: Context): LinkedHashMap<String, Entry> {
        cache?.let { return it }
        val map = LinkedHashMap<String, Entry>()
        val raw = prefs(context).getString(KEY, null)
        if (!raw.isNullOrEmpty()) {
            try {
                val arr = JSONArray(raw)
                for (i in 0 until arr.length()) {
                    val e = fromJson(arr.getJSONObject(i))
                    map[e.key] = e
                }
            } catch (_: Exception) {
                // 원장이 깨졌으면 버린다 — 앱을 한 번 열면 resyncAlarms가 전부 다시 등록한다.
            }
        }
        cache = map
        return map
    }

    private fun flush(context: Context, map: LinkedHashMap<String, Entry>) {
        val cutoff = System.currentTimeMillis() - KEEP_PAST_MS
        val it = map.entries.iterator()
        while (it.hasNext()) if (it.next().value.triggerAtMs < cutoff) it.remove()
        val arr = JSONArray()
        for (e in map.values) arr.put(toJson(e))
        prefs(context).edit().putString(KEY, arr.toString()).apply()
    }

    fun prefs(context: Context): SharedPreferences =
        context.applicationContext.createDeviceProtectedStorageContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun toJson(e: Entry) = JSONObject().apply {
        put("key", e.key); put("rid", e.recordId); put("at", e.triggerAtMs)
        put("title", e.title); put("body", e.body)
        put("snd", e.soundOn); put("vib", e.vibOn)
    }

    private fun fromJson(o: JSONObject) = Entry(
        key = o.getString("key"),
        recordId = o.optString("rid", ""),
        triggerAtMs = o.getLong("at"),
        title = o.optString("title", "말로"),
        body = o.optString("body", ""),
        soundOn = o.optBoolean("snd", true),
        vibOn = o.optBoolean("vib", true),
    )
}
