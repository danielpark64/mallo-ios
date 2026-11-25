// ─── Android 울림 카드 글자(1.2.3) ────────────────────────────────────────────
// 네이티브 울림 화면(modules/mallo-alarm AlarmRingActivity)은 앱 언어 설정을 모르므로(잠금해제 전·앱 미기동에도 뜬다)
// 언어가 정해지거나 바뀔 때마다 여기서 만든 글자 묶음을 setNativeAlarmLabels로 넘겨 저장해 둔다.
// 키 목록은 네이티브 AlarmLabels.RING_KEYS와 같아야 한다.
// i18n/index → prefs → reminders 순환을 피하려고 notifications.ts처럼 사전을 직접 읽는다
import { getLang } from './i18n/lang';
import { EN } from './i18n/en';
import { DICTS } from './i18n/dicts';
import { REMIND_OPTIONS, remindLabel } from './reminders';

function t(key: string, params?: Record<string, string>): string {
  const l = getLang();
  let s = l === 'ko' ? key : (DICTS[l]?.[key] ?? EN[key] ?? key);
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v);
  return s;
}

/**
 * 카드 위 띠 글자. 0 = 정각("지금 · 일정 시간"), 그 밖엔 미리 알림 이름을 재사용("30분 전 알림", en "30 min before",
 * ja "30分前のお知らせ", zh "提前30分钟提醒" …). 음수(모름)면 null = 띠 없음.
 */
export function ringBandLabel(leadMin: number): string | null {
  if (!Number.isFinite(leadMin) || leadMin < 0) return null;
  if (leadMin === 0) return t('지금 · 일정 시간');
  return t('{label} 알림', { label: remindLabel(leadMin) });
}

/** 네이티브로 넘길 울림 카드 글자 묶음(현재 앱 언어) */
export function ringCardLabels(): Record<string, string> {
  const out: Record<string, string> = {
    now: ringBandLabel(0) as string,
    again: t('다시 알림'),
    pre: t('미리 알림'),
    today: t('오늘'),
    tomorrow: t('내일'),
    stopShort: t('끄기'),
    lang: getLang(),
  };
  for (const m of REMIND_OPTIONS) out[`pre${m}`] = ringBandLabel(m) as string;
  return out;
}
