// ─── 교대알람 자동 공유 (v2): 같은 폰에 두 앱만 깔려 있으면 버튼·확인 없이 ─────────────────
// 2026-10-18 사용자 지시: "유저가 뭘 하는 게 아니고 두 앱만 깔고 한쪽 앱에서만이라도 공유를 원하면 그냥 공유".
// - 각 앱은 자기 데이터를 공유 자리에 놓아 두고(세이람: 일정·공유 설정), 상대 앱이 열릴 때 읽는다.
// - 한쪽 설정만 켜도 공유된다(shareEnabled). 인터넷은 쓰지 않는다.
// - Android: 우리 두 앱끼리만 읽는 ContentProvider(modules/sayram-share). iOS: App Group(유료 계정 활성화 후, 아직 없음).
// 형식·교대알람 쪽 작업: docs/shift-share-protocol.md
import { requireOptionalNativeModule } from 'expo-modules-core';
import { parseShiftBody, type ShiftData } from './shiftImport';
import type { ScheduleRecord } from './storage';

type Native = { writeOwn(name: string, json: string): void; readSibling(authority: string, name: string): Promise<string | null> };
const native = requireOptionalNativeModule<Native>('SayramShare');
const ALARMAPP = 'com.danielpark.alarmapp.share';

/** 이 기기에서 자동 공유가 되는가(지금은 Android만) */
export const siblingShareAvailable = !!native;

export type ShareConfig = { share: boolean; t?: number };

/** 한쪽만 켜도 공유 */
export function shareEnabled(mine: boolean, sibling: ShareConfig | null): boolean {
  return mine || !!sibling?.share;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 교대알람 달력에 보여 줄 세이람 일정 — 날짜·끝나는 날·시각·이름만(녹음·원문은 내보내지 않는다) */
export function buildEventsPayload(records: ScheduleRecord[], now: Date = new Date()): string {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31).getTime();
  const to = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).getTime();
  const e = records
    .filter((r) => r.scheduleAt != null && (r.endAt ?? r.scheduleAt) >= from && r.scheduleAt < to)
    .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0))
    .slice(0, 1000)
    .map((r) => {
      const at = new Date(r.scheduleAt!);
      return {
        d: ymd(at),
        ...(r.endAt != null ? { e: ymd(new Date(r.endAt)) } : {}),
        ...(r.hasTime && !r.needsDate && r.endAt == null ? { h: at.getHours() * 60 + at.getMinutes() } : {}),
        // 이름만 — 내용이 비어 있어도 녹음 원문(transcript)은 보내지 않는다
        n: (r.content || '').split('\n')[0].slice(0, 30) || '•',
      };
    });
  return JSON.stringify({ v: 1, t: now.getTime(), e });
}

/** 내 공유 데이터 갱신(일정이 바뀌거나 설정을 바꿀 때). 내용이 같으면 쓰지 않는다 */
let lastShare: boolean | null = null;
let lastEvents = '';
export function publishOwnShare(records: ScheduleRecord[], shareOn: boolean) {
  if (!native) return;
  try {
    if (shareOn !== lastShare) {
      native.writeOwn('config', JSON.stringify({ share: shareOn, t: Date.now() }));
      lastShare = shareOn;
    }
    const events = buildEventsPayload(records);
    // 시각(t)만 다른 같은 내용은 다시 쓰지 않는다
    const body = events.replace(/"t":\d+,/, '');
    if (body === lastEvents) return;
    lastEvents = body;
    native.writeOwn('events', events);
  } catch (e) {
    console.warn('공유 데이터 쓰기 실패:', e);
  }
}

/** 상대 앱 창구에서 근무표 읽기(읽기 함수를 받아 테스트한다) */
export async function readSiblingShiftsFrom(read: (name: string) => Promise<string | null> | string | null, mine: boolean): Promise<ShiftData | null> {
  try {
    const cfgRaw = await read('config');
    const cfg: ShareConfig | null = cfgRaw ? JSON.parse(cfgRaw) : null;
    if (!shareEnabled(mine, cfg)) return null;
    const raw = await read('shifts');
    return raw ? parseShiftBody(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** 교대알람 근무표(공유가 켜져 있고 교대알람이 있으면). 앱이 앞에 올 때만 부른다 — 폴링하지 않는다 */
export async function readSiblingShifts(mine: boolean): Promise<ShiftData | null> {
  if (!native) return null;
  return readSiblingShiftsFrom((name) => native.readSibling(ALARMAPP, name), mine);
}
