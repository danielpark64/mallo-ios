// 언어별 사전 모음. 키 = 한국어 원문. 없는 키는 영어 → 한국어 순으로 폴백한다.
import type { Lang } from './lang';
import { EN } from './en';
import { JA } from './ja';
import { ZH_HANS } from './zh-Hans';
import { ZH_HANT } from './zh-Hant';
import { ES } from './es';
import { FR } from './fr';
import { DE } from './de';
import { PT } from './pt';

export const DICTS: Partial<Record<Lang, Record<string, string>>> = {
  en: EN, ja: JA, 'zh-Hans': ZH_HANS, 'zh-Hant': ZH_HANT, es: ES, fr: FR, de: DE, pt: PT,
};
