// ─── 글 읽어 주기(TTS) ─────────────────────────────────────────────────────────
// 녹음 파일이 없는 일정(글자로 입력, Android 12 이하, 글만 덧붙인 추가 항목)도 ▶로 들을 수 있게
// 폰의 음성 합성 엔진으로 읽어 준다. 앱은 인터넷을 쓰지 않는다(읽는 일은 폰의 음성 엔진이 한다).
import { Platform } from 'react-native';
import { getLang, STT_LOCALE } from './i18n/lang';
import { formatDayHeader, formatTime } from './dateUtils';
import { t } from './i18n';

/**
 * 앱 언어에 맞는 음성 언어. iOS는 'ko-KR' 같은 태그를 그대로 쓰지만, Android(expo-speech)는
 * 받은 문자열을 Locale(언어)로만 만들어 'ko-KR'을 못 알아듣고 기기 기본 언어로 읽는다 → 언어 코드만 넘긴다.
 */
export function speechLanguage(os: string = Platform.OS): string {
  const tag = STT_LOCALE[getLang()] ?? 'ko-KR';
  return os === 'android' ? tag.split('-')[0] : tag;
}

/** 음성 엔진 한도(Android 4000자)를 넘으면 요청이 조용히 거부돼 ⏸에서 멈춘다 → 넉넉히 잘라서 넘긴다 */
export const SPEECH_MAX_CHARS = 3500;
export function clampSpeech(text: string): string {
  const t2 = text.trim();
  return t2.length > SPEECH_MAX_CHARS ? t2.slice(0, SPEECH_MAX_CHARS) : t2;
}

type Speakable = {
  content?: string;
  transcript?: string;
  scheduleAt?: number | null;
  hasTime?: boolean;
  needsDate?: boolean;
};

/** 카드의 ▶: "10월 14일 (수) 오후 3:00. 치과 예약" — 언제인지가 먼저 들려야 알람 앱답다 */
export function recordSpeechText(r: Speakable): string {
  const body = (r.content || r.transcript || '').split('\n• ')[0].trim();
  if (!body) return '';
  if (r.needsDate || !r.scheduleAt) return body;
  const d = new Date(r.scheduleAt);
  const when = r.hasTime ? `${formatDayHeader(d)} ${formatTime(d)}` : formatDayHeader(d);
  // 표시용 괄호 요일 "(수)"는 읽을 때 어색하지 않게 쉼표로
  const spoken = when.replace(/\s*\(([^)]+)\)\s*/, ', $1, ').trim().replace(/,$/, '');
  return `${spoken}. ${body}`;
}

export const SPEAK_LABEL = () => t('▶ 읽어 주기');
