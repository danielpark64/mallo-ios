package com.danielpark.sayram.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 작게(2×2): 바로 다음 일정 */
class SmallWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) = WidgetRender.updateAll(ctx)
  override fun onDisabled(ctx: Context) = WidgetRender.updateAll(ctx)
}

/** 중간(4×2): 다가오는 일정 4개 + 마이크 */
class MediumWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) = WidgetRender.updateAll(ctx)
  override fun onDisabled(ctx: Context) = WidgetRender.updateAll(ctx)
}

/** 크게(4×4): 이번 달 달력 + 스크롤 목록 */
class LargeWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) = WidgetRender.updateAll(ctx)
  override fun onDisabled(ctx: Context) = WidgetRender.updateAll(ctx)
}

/** 자정·일정 시각 예약, 재부팅·시간 변경 → 다시 그리기(위젯이 없으면 예약도 지운다) */
class WidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) = WidgetRender.updateAll(ctx)
}
