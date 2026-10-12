// 음성 인식 언어 코드 — 앱 언어 설정을 따른다
import { STT_LOCALE, getLang } from './i18n/lang';
export function sttLang(): string {
  return STT_LOCALE[getLang()] ?? 'en-US';
}
