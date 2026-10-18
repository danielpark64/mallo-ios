package com.danielpark.sayram.share

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Bundle

// 교대알람(com.danielpark.alarmapp)만 쓸 수 있는 창구.
//  query  content://com.danielpark.sayram.share/events|config  → 세이람 데이터를 처음 한 번 가져갈 때(상대가 아직 받은 게 없을 때)
//  call   method "push", arg "shifts"|"config", extras{json}    → 교대알람이 바뀐 근무표·설정을 넣어 준다(바뀔 때만)
// 평소에는 서로 call(push)로 "바뀐 것만" 넣어 주고, 앱이 열릴 때는 각자 받은 파일(inbox)만 읽는다 —
// 앱을 열 때마다 상대 앱 프로세스를 깨우지 않기 위해서(2026-10-18 사용자 지시: 시스템 부하 금지).
class ShareProvider : ContentProvider() {
  companion object {
    val ALLOWED = setOf("com.danielpark.alarmapp")
  }

  override fun onCreate(): Boolean = true

  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? {
    val caller = callingPackage ?: return null
    if (caller !in ALLOWED) return null
    val ctx = context ?: return null
    val name = uri.lastPathSegment ?: return null
    val json = ShareFiles.read(ctx, name) ?: return null
    return MatrixCursor(arrayOf("json")).apply { addRow(arrayOf(json)) }
  }

  override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
    val caller = callingPackage ?: return null
    if (caller !in ALLOWED) return null
    val ctx = context ?: return null
    if (method != "push" || arg == null) return null
    val json = extras?.getString("json") ?: return null
    val ok = ShareFiles.writeInbox(ctx, arg, json)
    return Bundle().apply { putBoolean("ok", ok) }
  }

  override fun getType(uri: Uri): String = "application/json"
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
