// ─── 영어 사전 ─────────────────────────────────────────────────────────────────
// 키 = 한국어 원문. 화면별로 나눈 파일(en.*.ts)을 여기서 합친다. 새 문구를 추가하면 해당 그룹 파일에 넣는다.
import { EN_COMMON } from './en.common';
import { EN_MAIN } from './en.main';
import { EN_DETAIL } from './en.detail';
import { EN_SETTINGS } from './en.settings';
import { EN_HELP } from './en.help';
import { SEND_DICTS } from './send';
import { CLIP_DICTS } from './clip';
import { MERGE_DICTS } from './merge';
import { SOUND_DICTS } from './sound';

export const EN: Record<string, string> = { ...EN_COMMON, ...EN_MAIN, ...EN_DETAIL, ...EN_SETTINGS, ...EN_HELP, ...SEND_DICTS.en, ...CLIP_DICTS.en, ...MERGE_DICTS.en, ...SOUND_DICTS.en };
