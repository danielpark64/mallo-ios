import { prepareVoiceAlarm, resetVoiceAlarms, voiceUriOf } from './voiceAlarm';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// 알림 제목·버튼·채널 이름 번역. i18n → prefs → expo-file-system 순으로 끌려오므로 모듈 평가 시점이 아니라
// 호출 시점에 읽고, 어떤 이유로든 i18n을 못 읽으면 한국어 원문을 쓴다 (알람 예약 자체는 절대 막지 않는다).
import { getLang } from './i18n/lang';
import { EN } from './i18n/en';
import { DICTS } from './i18n/dicts';
const t = (key: string): string => { const l = getLang(); return l === 'ko' ? key : (DICTS[l]?.[key] ?? EN[key] ?? key); };

import { REMIND_OPTIONS, normalizeRemind, preRecordId, remindBody, remindFireAt } from './reminders';
import {
  EXPO_FALLBACK_GRACE_MS,
  cancelAllNativeAlarms,
  cancelNativeAlarms,
  cancelNativeAlarmsByRecordId,
  isNativeAlarmAvailable,
  scheduleNativeAlarm,
} from './nativeAlarm';
import { usesAlarmKit } from './alarmkitRoute';
import { SOUND_LABEL, androidChannelId, androidSoundFile, iosSoundFile, resolveAlarmSound, type SoundId } from './alarmSounds';
import {
  alarmKitEnv,
  cancelAlarmKitForRecord,
  cancelAlarmKitKeys,
  cancelAllAlarmKit,
  isAlarmKitMode,
  requestAlarmKitIfNeeded,
  scheduleAlarmKit,
} from './alarmkit';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldShowInForeground: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: true },
  });
  return status === 'granted';
}

export type AlarmMode = 'both' | 'sound' | 'vibe';

// Android: 소리/진동은 알림 개별 설정이 아니라 "채널"에 묶이고, 채널은 한 번 만들면 설정이 고정된다.
// 모드별로 채널을 따로 두고 예약 시 channelId로 고른다. (채널 없이 예약하면 기본 채널로 가서
// 커스텀 알람음·최대 중요도가 적용되지 않는다.) iOS에서는 no-op.
// 알람 소리 고르기(1.2.0): 소리도 채널 단위라 "모드 × 소리"마다 채널이 하나씩이다(id 규칙은 alarmSounds.androidChannelId).
// 기본 소리 채널 3개는 시작할 때 만들고, 고른 소리 채널은 처음 쓸 때만 만든다(안 쓰는 채널이 설정 화면에 쌓이지 않게).
const ANDROID_CHANNEL: Record<AlarmMode, string> = {
  both: 'alarm_both',
  sound: 'alarm_sound',
  vibe: 'alarm_vibe',
};
const CHANNEL_NAME: Record<AlarmMode, string> = {
  both: '일정 알람 (소리+진동)',
  sound: '일정 알람 (소리)',
  vibe: '일정 알람 (진동)',
};
const channelCommon = () => ({
  importance: Notifications.AndroidImportance.MAX,
  lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  bypassDnd: true,
  audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
});
// 이번 실행에서 이미 만든(이름까지 맞춘) 고른 소리 채널 — 언어가 바뀌어 registerAndroidChannels가 다시 불리면 비워서 이름을 다시 맞춘다
const madeToneChannels = new Set<string>();

/** 이 모드·소리의 채널 id. 고른 소리 채널은 없으면 만든다(Android만, iOS는 id만 돌려주고 무시됨) */
async function ensureAndroidChannel(mode: AlarmMode, sound: SoundId): Promise<string> {
  const id = androidChannelId(mode, sound);
  if (Platform.OS !== 'android' || mode === 'vibe' || sound === 'default' || madeToneChannels.has(id)) return id;
  try {
    await Notifications.setNotificationChannelAsync(id, {
      ...channelCommon(),
      name: `${t(CHANNEL_NAME[mode])} · ${t(SOUND_LABEL[sound])}`,
      sound: androidSoundFile(sound),
      enableVibrate: mode === 'both',
      vibrationPattern: mode === 'both' ? [0, 500, 300, 500] : null,
    });
    madeToneChannels.add(id);
    return id;
  } catch (e) {
    console.warn('알림 채널 등록 실패:', e);
    return ANDROID_CHANNEL[mode]; // 채널을 못 만들면 기본 소리 채널로라도 울린다
  }
}

export async function registerAndroidChannels() {
  if (Platform.OS !== 'android') return;
  madeToneChannels.clear();
  const common = channelCommon();
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL.both, {
      ...common,
      name: t('일정 알람 (소리+진동)'),
      sound: 'alarm_long.wav',
      enableVibrate: true,
      vibrationPattern: [0, 500, 300, 500],
    });
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL.sound, {
      ...common,
      name: t('일정 알람 (소리)'),
      sound: 'alarm_long.wav',
      enableVibrate: false,
      vibrationPattern: null,
    });
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL.vibe, {
      ...common,
      name: t('일정 알람 (진동)'),
      sound: null,
      enableVibrate: true,
      vibrationPattern: [0, 500, 300, 500],
    });
  } catch (e) {
    console.warn('알림 채널 등록 실패:', e);
  }
}

export async function registerNotificationCategories() {
  // 버튼 구성 = 워치에서 사용자가 보게 될 버튼(폰 알림이 그대로 워치로 브릿지된다).
  // iOS: 앱을 앞으로 열지 않는 백그라운드 액션으로 둔다 — 잠금 화면·애플워치에서 폰 잠금을 풀지 않고도
  //      "알람 끄기"가 바로 처리된다(교대알람과 같은 구성). 앱은 백그라운드로 깨어나 응답 리스너가 남은 재알림을 취소한다.
  // Android: 이 Expo 알림은 네이티브가 못 울렸을 때의 보조 경로다. 앱 프로세스가 죽어 있어도 응답이 확실히
  //      JS에 닿도록 앱을 앞으로 연다(평소 끄기는 네이티브 알림 버튼·워치 → AlarmService가 직접 처리).
  const foreground = Platform.OS === 'android';
  await Notifications.setNotificationCategoryAsync(
    'alarm',
    [
      {
        identifier: 'stop',
        buttonTitle: t('알람 끄기'),
        options: { isDestructive: false, isAuthenticationRequired: false, opensAppToForeground: foreground },
      },
      {
        identifier: 'snooze',
        buttonTitle: t('5분 후 다시'),
        options: { isDestructive: false, isAuthenticationRequired: false, opensAppToForeground: foreground },
      },
    ],
    // iOS: 워치/배너에서 스와이프로 닫기만 해도 응답 이벤트가 오도록 (재알림 취소 누락 방지)
    { customDismissAction: true }
  );
}

/**
 * 지정 시각에 알람 예약 (main + +1분 + +2분 반복 슬롯).
 * 반환값: 등록된 notification identifier 배열 (취소에 사용). 네이티브 예약 키도 같은 문자열이다.
 *
 * Android 이중 알람: 슬롯마다 네이티브 AlarmManager(정확, T)와 Expo(보조, T+유예)를 같은 식별자로
 * 함께 건다. 네이티브가 울리면 리시버가 같은 식별자의 Expo 예약을 지워 중복을 막고, 네이티브가
 * 못 울린 경우에만 Expo가 유예 뒤 대신 울린다. iOS·네이티브 미빌드 환경은 Expo 단일 경로 그대로.
 */
export type AlarmOptions = {
  /** 미리 알림(분). 각각 한 번씩 울린다 */
  remindBefore?: number[];
  /** 정각 + 1·2분 재알림. 기본 true */
  exactAlarm?: boolean;
  /** 한 번만(스누즈 등): 정각 슬롯 1개만 건다 */
  single?: boolean;
  /** "내 목소리" 알람으로 울릴 녹음 경로 (lib/voiceAlarm.ts voiceUriOf). 없으면 기본 알람음 */
  voiceUri?: string | null;
  /** 일정에 고른 알람 소리(record.alarmSound). 없으면 설정의 기본 소리 (lib/alarmSounds.ts) */
  alarmSound?: string | null;
};

export async function scheduleAlarm(
  recordId: string,
  content: string,
  at: Date,
  mode: AlarmMode = 'both',
  opts: AlarmOptions = {}
): Promise<string[]> {
  return (await scheduleSlots(recordId, content, at, mode, opts)).ids;
}

// ── 재동기화 세대 번호(교대알람 rescheduleGen 방식) ─────────────────────────────
// resyncAlarms는 "전체 취소 → 일정마다 여러 번 await로 재예약"이라 시간이 걸린다. 그 사이 새 재동기화가 시작되면
// 앞 호출이 남은 루프를 계속 돌며 옛 목록(지운 일정 등)을 다시 건다. 호출마다 세대 번호를 받고, 슬롯 하나를
// 걸기 전·await 뒤마다 자기 세대가 아니면 즉시 멈춘다(Expo·Android 네이티브·AlarmKit 모두) — 마지막 호출만 끝까지 간다.
let resyncGen = 0;
// 재동기화가 도는 사이 따로 정리(cancelAlarmGroup: 저장·되돌리기·삭제)한 일정 — 재동기화는 시작 때 받은 옛 목록이라
// 이 일정을 옛 값으로 다시 걸면 새 알람 위에 옛 알람이 겹친다. 재동기화는 이 일정을 건너뛰고, 걸던 중이면 멈춘다.
const handledDuringResync = new Set<string>();
/** gen이 없으면(단일 scheduleAlarm) 세대 관리 밖이라 항상 유효 */
const isStale = (gen?: number, recordId?: string) =>
  gen != null && (gen !== resyncGen || (recordId != null && handledDuringResync.has(recordId)));

/** scheduleAlarm 본체. expoSlots: Expo 알림으로 건 슬롯 수(iOS 64개 예산용 — AlarmKit 슬롯은 세지 않는다).
 *  expoBudget: 재동기화가 넘기는 남은 Expo 예산 — AlarmKit이 실패해 Expo로 넘어갈 때도 이보다 많이 걸지 않는다 */
async function scheduleSlots(
  recordId: string,
  content: string,
  at: Date,
  mode: AlarmMode,
  opts: AlarmOptions,
  gen?: number,
  expoBudget: number = Infinity
): Promise<{ ids: string[]; expoSlots: number }> {
  const ids: string[] = [];
  let expoSlots = 0;
  const done = () => ({ ids, expoSlots });
  const expoFull = () => expoSlots >= expoBudget;
  const useNative = isNativeAlarmAvailable();
  // [VOICE_ALARM] 보류된 기능 (lib/voiceAlarm.ts 스위치로 꺼짐)
  // 내 목소리 알람: Android는 네이티브에 파일을 알려 두고, iOS는 변환한 소리 파일 이름을 받는다
  const voiceSound = await prepareVoiceAlarm(recordId, mode === 'vibe' ? null : opts.voiceUri);
  // 알람 소리: 일정에 고른 것 → 설정 기본. 정각·미리 알림·재알림·스누즈·AlarmKit·Android 네이티브 모두 같은 소리
  const toneId = resolveAlarmSound(opts.alarmSound);
  const toneFile = Platform.OS === 'android' ? androidSoundFile(toneId) : iosSoundFile(toneId);
  const sound = mode === 'vibe' ? undefined : (voiceSound ?? toneFile);
  // Android: 소리가 채널 단위라 모드 × 소리 채널을 고른다(진동만은 예전 alarm_vibe 그대로). iOS는 무시됨
  const channelId = await ensureAndroidChannel(mode, toneId);
  const akSound = iosSoundFile(toneId);
  // iOS 26+ AlarmKit 분기 — 이 한 곳에서만 정한다(alarmkitRoute.usesAlarmKit). 켜져 있으면 소리 알람 슬롯은
  // AlarmKit에만 걸고 Expo 알림은 걸지 않는다(두 번 울림 방지). AlarmKit 예약이 실패한 슬롯만 아래 Expo 방식으로 건다.
  // Android는 alarmKitEnv().os가 'android'라 항상 false — 아래 Expo+네이티브 경로가 그대로 돈다.
  const viaAlarmKit = usesAlarmKit(mode, voiceSound, isAlarmKitMode());

  // ── 미리 알림: 각각 한 번, 정각 알람과 독립(식별자 recordId#preN) ──
  for (const m of normalizeRemind(opts.remindBefore ?? [])) {
    if (isStale(gen, recordId)) return done();
    const fireAt = remindFireAt(at, m);
    if (fireAt.getTime() <= Date.now()) continue;
    const identifier = `mallo_${recordId}_pre${m}`;
    const subId = preRecordId(recordId, m);
    const body = remindBody(m, content, at);
    // AlarmKit 울림 화면엔 제목 한 줄만 보이므로 본문(무슨 일정·몇 분 전)을 제목으로 쓴다
    if (viaAlarmKit && (await scheduleAlarmKit({ key: identifier, recordId: subId, baseRecordId: recordId, at: fireAt, title: body, stopText: t('알람 끄기'), sound: akSound }))) {
      ids.push(identifier);
      continue;
    }
    if (isStale(gen, recordId)) return done(); // AlarmKit 실패를 기다리는 사이 새 재동기화가 시작됐으면 Expo로 대신 걸지 않는다
    if (expoFull()) continue;
    expoSlots++;
    const nativeArmed =
      useNative &&
      scheduleNativeAlarm({ key: identifier, recordId: subId, at: fireAt, title: t('세이람 · 미리 알림'), body, mode, tone: toneId });
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: t('세이람 · 미리 알림'),
          body,
          sound,
          categoryIdentifier: 'alarm',
          data: { recordId: subId, baseRecordId: recordId, pre: m },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: nativeArmed ? new Date(fireAt.getTime() + EXPO_FALLBACK_GRACE_MS) : fireAt,
          channelId,
        },
      });
      ids.push(id);
    } catch (e) {
      console.warn(`미리 알림 등록 실패 (${m}분 전):`, e);
      if (nativeArmed) ids.push(identifier);
    }
  }

  if (opts.exactAlarm === false || isStale(gen, recordId)) return done();
  if (at.getTime() <= Date.now()) return done();

  const base: Notifications.NotificationContentInput = {
    title: t('세이람'),
    body: content,
    // iOS: sound 있으면 자동 진동, sound 없으면 무진동
    // both/sound → 고른 알람 소리 또는 내 목소리 (iOS는 소리+진동 자동), vibe → 무음(배너만)
    sound,
    categoryIdentifier: 'alarm',
    data: { recordId },
  };
  // AlarmKit은 끌 때까지 시스템이 울리므로 정각 슬롯 하나만 건다(+1·+2분 재알림 없음 — 걸면 끈 뒤에 또 울린다)
  if (viaAlarmKit) {
    const identifier = `mallo_${recordId}_0`;
    if (await scheduleAlarmKit({ key: identifier, recordId, baseRecordId: recordId, at, title: content || t('세이람'), stopText: t('알람 끄기'), sound: akSound })) {
      ids.push(identifier);
      return done();
    }
  }
  // 메인 + +1분 + +2분 슬롯
  for (const offset of opts.single ? [0] : [0, 1, 2]) {
    if (isStale(gen, recordId) || expoFull()) return done();
    expoSlots++;
    const fireAt = new Date(at.getTime() + offset * 60 * 1000);
    const identifier = `mallo_${recordId}_${offset}`;
    const nativeArmed =
      useNative &&
      scheduleNativeAlarm({ key: identifier, recordId, at: fireAt, title: t('세이람'), body: content, mode, tone: toneId });
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier,
        content: { ...base, data: { recordId, slotOffset: offset } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: nativeArmed ? new Date(fireAt.getTime() + EXPO_FALLBACK_GRACE_MS) : fireAt,
          // Android: 모드 × 소리 채널로 소리/진동 결정 (iOS는 무시됨)
          channelId,
        },
      });
      ids.push(id);
    } catch (e) {
      console.warn(`알림 등록 실패 (offset ${offset}):`, e);
      // Expo 등록이 실패해도 네이티브는 걸렸으니 취소용 식별자는 남긴다
      if (nativeArmed) ids.push(identifier);
    }
  }
  return done();
}

/** 레코드에 연결된 알람 알림 전부 취소 */
export async function cancelAlarm(notifIds: string[]): Promise<void> {
  cancelNativeAlarms(notifIds); // Android: 네이티브 슬롯(같은 키) + 그 일정의 스누즈 슬롯
  await cancelAlarmKitKeys(notifIds); // iOS 26+: AlarmKit 원장에서 같은 식별자(방식과 무관하게 항상)
  await Promise.all(
    notifIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );
}

/** recordId로 예약된 알림 전부 취소 (response handler용) */
export async function cancelAlarmByRecordId(recordId: string): Promise<void> {
  cancelNativeAlarmsByRecordId(recordId); // Android: 울리는 중이면 멈추고 남은 네이티브 슬롯 정리
  await cancelAlarmKitForRecord(recordId); // iOS 26+: AlarmKit 원장에서 같은 recordId(방식과 무관하게 항상)
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => (n.content.data as any)?.recordId === recordId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}))
  );
}

/**
 * 일정 하나의 알람을 통째로 정리: 저장된 식별자(notifIds) + 정각/미리 알림/스누즈를 recordId 단위로.
 * 삭제·편집 저장 때 쓴다. (미리 알림을 "5분 뒤 다시"로 미룬 슬롯은 notifIds에 없어서 recordId로 잡아야 한다)
 */
export async function cancelAlarmGroup(recordId: string, notifIds?: string[]): Promise<void> {
  handledDuringResync.add(recordId);
  if (notifIds?.length) await cancelAlarm(notifIds);
  await cancelAlarmByRecordId(recordId);
  for (const m of REMIND_OPTIONS) await cancelAlarmByRecordId(preRecordId(recordId, m));
}

/**
 * 앱 시작 시 전체 알람 재동기화.
 * - 삭제된 일정의 잔여 알림 정리 (전부 취소 후 재등록)
 * - iOS 로컬 알림 64개 제한 대응: 가까운 일정부터 예산(60개) 안에서만 등록.
 *   예산은 Expo 알림만 센다 — AlarmKit 슬롯은 64개 한도와 무관(실패해서 Expo로 넘어간 슬롯은 센다).
 * - 겹쳐 돌면 마지막에 시작한 호출만 끝까지 간다(resyncGen)
 */
export async function resyncAlarms(
  records: Array<{
    id: string;
    content: string;
    transcript: string;
    scheduleAt: number | null;
    hasTime: boolean;
    alarmMode?: AlarmMode;
    remindBefore?: number[];
    exactAlarm?: boolean;
    needsDate?: boolean;
    uri?: string;
    voiceAlarm?: boolean;
    alarmSound?: string;
    outcome?: { kind: string };
  }>
): Promise<void> {
  const gen = ++resyncGen;
  handledDuringResync.clear();
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (isStale(gen)) return;
    cancelAllNativeAlarms(); // Android: 네이티브 원장도 전부 비운 뒤 아래에서 둘 다 다시 건다
    // iOS 26+: AlarmKit 원장 전체 정리 — 방식과 무관하게 항상. 권한을 꺼서 Expo로 바뀌었으면 AlarmKit 쪽 잔여가,
    // 지운 일정이면 그 예약이 여기서 지워진다. 남아 있는 일정의 "지금 울리는 중"인 것만 남긴다(울림이 끊기지 않게).
    lastAlarmKitAuth = alarmKitEnv().auth;
    await cancelAllAlarmKit(records.map((r) => r.id));
    if (isStale(gen)) return;
    const now = Date.now();
    // 정각이 지났어도 미리 알림이 남아 있을 수는 없으므로(미리 알림은 정각보다 앞) 정각 기준으로 거른다
    const future = records
      .filter((r) => !r.needsDate && r.hasTime && r.scheduleAt != null && r.scheduleAt > now)
      .filter((r) => r.outcome?.kind !== 'moved') // 다른 날로 미룬 일정은 새 일정 쪽에서만 울린다(lib/outcome isMovedAway)
      .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));
    // [VOICE_ALARM] 보류된 기능 (lib/voiceAlarm.ts 스위치로 꺼짐)
    // 내 목소리 알람: 네이티브 예약을 비운 직후에 정리한다(그 전에 지우면 그 사이 울리는 알람이 기본음이 된다).
    // 앞으로 울릴 일정 것만 남긴다 — 지난 일정의 iOS 소리 파일(건당 1~2MB)이 쌓이지 않게.
    resetVoiceAlarms(future.filter((r) => voiceUriOf(r)).map((r) => r.id));
    let budget = 60; // 64개 한도에서 여유분 확보(Expo 알림만 센다)
    const akMode = isAlarmKitMode();
    let expoClosed = false;
    for (const r of future) {
      if (isStale(gen)) return;
      if (handledDuringResync.has(r.id)) continue; // 그사이 따로 다시 건 일정 — 옛 값으로 덮지 않는다
      const mode = r.alarmMode ?? 'both';
      // AlarmKit 경로는 끌 때까지 울리므로 정각 1슬롯, Expo 경로는 정각 3슬롯(+1·+2분)
      const viaAK = usesAlarmKit(mode, voiceUriOf(r), akMode);
      const need = (r.exactAlarm === false ? 0 : viaAK ? 1 : 3) + normalizeRemind(r.remindBefore ?? []).length;
      if (need === 0) continue;
      // Expo 예산은 Expo로 걸 일정만 막는다 — 가까운 순서를 지키려고 한 번 모자라면 그 뒤 Expo 일정은 모두 건너뛴다.
      // AlarmKit 일정은 계속 건다(실패해서 Expo로 넘어가는 슬롯만 남은 예산 안에서 걸고 예산에서 뺀다)
      if (!viaAK && (expoClosed || budget < need)) { expoClosed = true; continue; }
      const { expoSlots } = await scheduleSlots( // 방식(AlarmKit/Expo)은 슬롯마다 다시 판정한다
        r.id,
        r.content || r.transcript,
        new Date(r.scheduleAt!),
        mode,
        { remindBefore: r.remindBefore, exactAlarm: r.exactAlarm, voiceUri: voiceUriOf(r), alarmSound: r.alarmSound },
        gen,
        expoClosed ? 0 : budget
      );
      budget -= expoSlots;
    }
  } catch (e) {
    console.warn('알람 재동기화 실패:', e);
  }
}

// ── iOS 26+ AlarmKit 권한 ──────────────────────────────────────────────
// 마지막 재동기화 때의 권한 상태. 앱이 앞으로 올 때 이것과 다르면(설정 앱에서 켜고/끄고 돌아옴) 다시 건다.
let lastAlarmKitAuth: string | null = null;

/** 앱 시작 때 iOS 26+면 AlarmKit 권한을 한 번 묻는다(알림 권한 창이 닫힌 뒤에 부를 것). Android·iOS 26 미만은 아무것도 안 한다. */
export async function requestAlarmKitPermission(): Promise<void> {
  await requestAlarmKitIfNeeded().catch(() => false);
}

/** 앱이 앞으로 왔을 때 부른다 — AlarmKit 권한 상태가 마지막 재동기화 때와 다르면 전체 재동기화. 바뀐 게 없으면 아무것도 안 한다. */
export async function resyncAlarmsIfAlarmKitChanged(records: Parameters<typeof resyncAlarms>[0]): Promise<boolean> {
  if (lastAlarmKitAuth == null) return false; // 아직 첫 재동기화 전(시작 흐름이 곧 한다)
  if (alarmKitEnv().auth === lastAlarmKitAuth) return false;
  await resyncAlarms(records);
  return true;
}
