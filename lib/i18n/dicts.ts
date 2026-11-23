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
import { SEND_DICTS as S } from './send';
import { CLIP_DICTS as C } from './clip';
import { MERGE_DICTS as M } from './merge';
import { SOUND_DICTS as N } from './sound';

export const DICTS: Partial<Record<Lang, Record<string, string>>> = {
  // 일정 보내기(send.ts)·붙여넣기(clip.ts)·일정 화면 합치기(merge.ts) 문구는 따로 두고 여기서 합친다
  // 알람 소리 고르기(sound.ts)도 같은 방식
  en: EN, ja: { ...JA, ...S.ja, ...C.ja, ...M.ja, ...N.ja }, 'zh-Hans': { ...ZH_HANS, ...S['zh-Hans'], ...C['zh-Hans'], ...M['zh-Hans'], ...N['zh-Hans'] }, 'zh-Hant': { ...ZH_HANT, ...S['zh-Hant'], ...C['zh-Hant'], ...M['zh-Hant'], ...N['zh-Hant'] },
  es: { ...ES, ...S.es, ...C.es, ...M.es, ...N.es }, fr: { ...FR, ...S.fr, ...C.fr, ...M.fr, ...N.fr }, de: { ...DE, ...S.de, ...C.de, ...M.de, ...N.de }, pt: { ...PT, ...S.pt, ...C.pt, ...M.pt, ...N.pt },
};
