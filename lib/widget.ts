// ─── 홈 화면 위젯 연결 ─────────────────────────────────────────────────────────
// 일정·근무표·언어가 바뀌면 요약(lib/widgetData.ts)을 네이티브 모듈(modules/sayram-widget)에 넘긴다.
// 모듈은 iOS App Group / Android 앱 저장소에 두고 위젯을 바로 다시 그린다. 위젯을 누르면 mallo://widget?… 링크로 앱이 열린다.
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ScheduleRecord } from './storage';
import type { ShiftData } from './shiftImport';
import type { Lang } from './i18n/lang';
import { buildWidgetPayload } from './widgetData';

type Native = { setData(json: string): Promise<void>; launchedFromHistory?(): boolean };
const native = requireOptionalNativeModule<Native>('SayramWidget');

/** 위젯 요약을 새로 쓰고 위젯을 다시 그리게 한다(모듈이 없는 환경에서는 아무것도 안 함) */
export function publishWidget(records: ScheduleRecord[], shifts: ShiftData | null, lang: Lang, now: Date = new Date()) {
  if (!native) return;
  try {
    native.setData(JSON.stringify(buildWidgetPayload(records, shifts, lang, now))).catch((e) => console.warn('위젯 갱신 실패', e));
  } catch (e) {
    console.warn('위젯 갱신 실패', e);
  }
}

/** Android: 최근 앱 목록에서 다시 연 것인지 — 그때는 예전에 누른 위젯 링크가 다시 들어오므로 무시해야 한다(녹음이 저절로 시작되지 않게) */
export function launchedFromHistory(): boolean {
  try {
    return !!native?.launchedFromHistory?.();
  } catch {
    return false;
  }
}

export type WidgetLink = { kind: 'day'; date: Date } | { kind: 'record'; id: string } | { kind: 'mic' };

/** mallo://widget?d=2026-11-10 (그날) · ?id=… (그 일정) · ?a=mic (바로 말하기). 위젯 링크가 아니면 null */
export function parseWidgetUrl(url: string): WidgetLink | null {
  const m = /^mallo:\/\/widget\/?\?(.*)$/.exec(url);
  if (!m) return null;
  const q: Record<string, string> = {};
  for (const part of m[1].split('&')) {
    const [k, v = ''] = part.split('=');
    if (!k) continue;
    try {
      q[k] = decodeURIComponent(v);
    } catch {
      return null; // 깨진 링크(%E0 같은)는 무시
    }
  }
  if (q.a === 'mic') return { kind: 'mic' };
  if (q.id) return { kind: 'record', id: q.id };
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.d ?? '');
  if (d) return { kind: 'day', date: new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])) };
  return null;
}
