// ─── 교대알람 자동 공유 (v2): 같은 폰에 두 앱만 깔려 있으면 버튼·확인 없이 ─────────────────
// 2026-10-18 사용자 지시: "유저가 뭘 하는 게 아니고 두 앱만 깔고 한쪽 앱에서만이라도 공유를 원하면 그냥 공유".
// - 각 앱은 자기 데이터를 공유 자리에 놓아 두고(세이람: 일정·공유 설정), 상대 앱이 열릴 때 읽는다.
// - 한쪽 설정만 켜도 공유된다(shareEnabled). 인터넷은 쓰지 않는다.
// - Android: 우리 두 앱끼리만 읽는 ContentProvider(modules/sayram-share). iOS: App Group(유료 계정 활성화 후, 아직 없음).
// - v3(2026-10-18, 사용자 지시 "시스템 부하 절대 금지"): 앱을 열 때 상대 앱을 깨우지 않는다.
//   내 데이터가 바뀌었을 때만, 앱을 떠날 때(background) 상대 창구에 한 번 넣어 준다(push).
//   열 때는 상대가 넣어 준 파일(inbox)만 읽는다. 직접 가져오기(pull)는 처음 한 번·상대가 옛 버전일 때만(실행당 1번).
// 형식·교대알람 쪽 작업: docs/shift-share-protocol.md
import { requireOptionalNativeModule } from 'expo-modules-core';
import { parseShiftBody, type ShiftData } from './shiftImport';
import type { ScheduleRecord } from './storage';

type Native = {
  writeOwn(name: string, json: string): void;
  readInbox(name: string): string | null;
  pushToSibling(authority: string, name: string): Promise<'same' | 'pushed' | 'fail'>;
  pullToInbox(authority: string, name: string): Promise<string | null>;
  isInstalled?(pkg: string): boolean;
};
const native = requireOptionalNativeModule<Native>('SayramShare');
const ALARMAPP = 'com.danielpark.alarmapp.share';

/** 교대알람이 이 폰에 깔려 있는가 — 세이람 실행 때 한 번만 확인하고 기억한다(배너가 돌 때마다 묻지 않는다).
 *  Android만 알 수 있다 — iOS·모르면 false */
let installedCache: boolean | null = null;
export function alarmAppInstalled(): boolean {
  if (installedCache !== null) return installedCache;
  try {
    installedCache = !!native?.isInstalled?.('com.danielpark.alarmapp');
  } catch {
    installedCache = false;
  }
  return installedCache;
}

/** 이 기기에서 자동 공유가 되는가(지금은 Android만) */
export const siblingShareAvailable = !!native;

/** push: 1 = 바뀔 때 넣어 주는(v3) 상대 — 직접 가져올 필요 없음 */
export type ShareConfig = { share: boolean; push?: number; t?: number };

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
      native.writeOwn('config', JSON.stringify({ share: shareOn, push: 1, t: Date.now() }));
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

/** 상대에게서 직접 가져와야 하나 — 받은 설정이 없거나(처음) 상대가 옛 버전(push 표시 없음)일 때, 실행당 한 번만 */
export function needsPull(inboxConfigRaw: string | null, pulledThisRun: boolean): boolean {
  if (pulledThisRun) return false;
  if (!inboxConfigRaw) return true;
  try {
    return (JSON.parse(inboxConfigRaw) as ShareConfig).push !== 1;
  } catch {
    return true;
  }
}

let pulledThisRun = false;
/** 교대알람 근무표(공유가 켜져 있고 교대알람이 있으면). 앱이 앞에 올 때만 부른다 — 폴링하지 않는다.
 *  평소에는 받은 파일만 읽어 교대알람을 깨우지 않는다 */
export async function readSiblingShifts(mine: boolean): Promise<ShiftData | null> {
  if (!native || !alarmAppInstalled()) return null;
  if (needsPull(native.readInbox('config'), pulledThisRun)) {
    pulledThisRun = true;
    await native.pullToInbox(ALARMAPP, 'config');
    await native.pullToInbox(ALARMAPP, 'shifts');
  }
  return readSiblingShiftsFrom((name) => native.readInbox(name), mine);
}

/** 앱을 떠날 때(background) 부른다: 바뀐 것만 교대알람에 넣어 준다(바뀐 게 없으면 교대알람을 건드리지 않는다).
 *  설정(config)은 늘, 일정(events)은 공유가 켜져 있을 때만 */
let pushFailedThisRun = false;
export async function pushOwnShare(mine: boolean): Promise<void> {
  // 넣기에 실패하면(옛 버전 교대알람은 받는 창구가 없다) 이번 실행에는 다시 시도하지 않는다 — 매번 깨우지 않게
  if (!native || !alarmAppInstalled() || pushFailedThisRun) return;
  try {
    if ((await native.pushToSibling(ALARMAPP, 'config')) === 'fail') { pushFailedThisRun = true; return; }
    const cfgRaw = native.readInbox('config');
    const cfg: ShareConfig | null = cfgRaw ? JSON.parse(cfgRaw) : null;
    if (shareEnabled(mine, cfg) && (await native.pushToSibling(ALARMAPP, 'events')) === 'fail') pushFailedThisRun = true;
  } catch (e) {
    console.warn('공유 데이터 넣기 실패:', e);
  }
}
