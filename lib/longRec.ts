// ─── [LONGREC] 긴 녹음(회의·강의) 저장과 내보내기 ──────────────────────────────────
// 보류된 기능 — 켜고 끄는 스위치와 남은 과제는 lib/longRecFlag.ts 에 적어 두었다.
// 일정(records.json)과 섞지 않고 따로 둔다: Documents/mallo/longrecs.json + long_<id>.m4a
// 저장 공간: 녹음은 말소리용 낮은 음질(1시간 약 14MB), 임시 파일은 복사하지 않고 옮긴다.
// 텍스트·PDF는 공유할 때만 캐시에 잠깐 만들고 공유가 끝나면 지운다.
import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import { clock, type LongPara } from './longTranscript';
import { resolveAudioUri } from './storage';

export type LongRec = {
  id: string;
  title: string;
  createdAt: number;
  durationSec: number;
  /** 녹음 파일 경로. 녹음 파일이 없으면 빈 문자열 */
  uri: string;
  paras: LongPara[];
  /** 받아쓰기 방식 — 시험 결과를 견줄 때 쓴다 */
  onDevice?: boolean;
};

/** 말소리용 녹음 설정 — 16kHz 모노 32kbps AAC(1시간 약 14MB). 일정 녹음(128kbps 스테레오)의 4분의 1 */
export const LONG_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

const DIR = new Directory(Paths.document, 'mallo');
const DB = new File(DIR, 'longrecs.json');

function ensureDir() {
  try { if (!DIR.exists) DIR.create({ intermediates: true }); } catch {}
}

export function loadLongRecs(): LongRec[] {
  try {
    if (!DB.exists) return [];
    const arr = JSON.parse(DB.textSync());
    if (!Array.isArray(arr)) return [];
    // iOS는 앱 업데이트 때 폴더 경로가 바뀌므로 파일 이름으로 다시 찾는다(lib/storage.ts와 같은 규칙)
    return (arr as LongRec[]).map((r) => ({ ...r, uri: r.uri ? resolveAudioUri(r.uri) : '' }));
  } catch {
    return [];
  }
}

export function saveLongRecs(list: LongRec[]) {
  try {
    ensureDir();
    if (!DB.exists) DB.create();
    DB.write(JSON.stringify(list));
  } catch (e) {
    console.warn('긴 녹음 목록 저장 실패:', e);
  }
}

/** 녹음 임시 파일을 mallo 폴더로 옮긴다(복사본을 남기지 않는다). 실패하면 빈 문자열 */
export function keepLongAudio(srcUri: string, id: string): string {
  try {
    ensureDir();
    const dest = new File(DIR, `long_${id}.m4a`);
    if (dest.exists) dest.delete();
    new File(srcUri).move(dest);
    return dest.uri;
  } catch (e) {
    console.warn('긴 녹음 파일 옮기기 실패:', e);
    return '';
  }
}

export function deleteLongAudio(uri: string) {
  try {
    if (!uri) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}

/** 녹음 파일 크기(MB, 소수 한 자리). 없으면 null */
export function audioSizeMb(uri: string): number | null {
  try {
    if (!uri) return null;
    const f = new File(uri);
    if (!f.exists) return null;
    return Math.round(((f.size ?? 0) / 1048576) * 10) / 10;
  } catch {
    return null;
  }
}

const pad = (v: number) => v.toString().padStart(2, '0');

/** "2026-11-12 14:05" */
export function whenLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 새 녹음의 기본 제목 — "11월 12일 오후 2시 녹음" */
export function defaultTitle(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시 녹음`;
}

/** 텍스트 문서 */
export function longRecToText(r: LongRec, withTimes = true): string {
  const head = [r.title, `${whenLabel(r.createdAt)} · ${clock(r.durationSec * 1000)}`, ''];
  const body = r.paras.map((p) => (withTimes ? `[${clock(p.atMs)}] ${p.text}` : p.text));
  return [...head, ...body, ''].join('\n\n').replace(/\n{3,}/g, '\n\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** PDF용 HTML */
export function longRecToHtml(r: LongRec): string {
  const rows = r.paras
    .map((p) => `<div class="p"><span class="t">${clock(p.atMs)}</span><span class="x">${escapeHtml(p.text)}</span></div>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, 'Apple SD Gothic Neo', sans-serif; padding: 28px; color: #15172A; }
    h1 { font-size: 20px; margin: 0 0 4px 0; }
    .sub { color: #666; font-size: 12px; margin-bottom: 20px; }
    .p { display: flex; font-size: 14px; line-height: 1.7; margin-bottom: 12px; }
    .t { flex: none; width: 56px; color: #2B6BD9; font-weight: 600; font-size: 12px; padding-top: 2px; }
    .x { flex: 1; }
  </style></head><body>
    <h1>${escapeHtml(r.title)}</h1>
    <div class="sub">${whenLabel(r.createdAt)} · ${clock(r.durationSec * 1000)}</div>
    ${rows}
  </body></html>`;
}

/** 파일 이름에 못 쓰는 글자를 뺀다 */
function fileBase(r: LongRec): string {
  return (r.title || '녹음').replace(/[\\/:*?"<>|\n]/g, ' ').trim().slice(0, 40) || '녹음';
}

/** 텍스트 파일로 공유 — 캐시에 잠깐 만들고 공유가 끝나면 지운다 */
export async function shareLongText(r: LongRec): Promise<void> {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const f = new File(dir, `${fileBase(r)}.txt`);
  try {
    if (f.exists) f.delete();
    f.create();
    f.write(longRecToText(r));
    await Sharing.shareAsync(f.uri, { mimeType: 'text/plain', dialogTitle: r.title });
  } finally {
    try { if (f.exists) f.delete(); } catch {}
  }
}

/** PDF로 공유 — 만든 파일은 공유가 끝나면 지운다 */
export async function shareLongPdf(r: LongRec): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: longRecToHtml(r) });
  // 받는 쪽에 "제목.pdf"로 보이게 이름을 바꾼다
  let out = new File(uri);
  try {
    const named = new File(out.parentDirectory, `${fileBase(r)}.pdf`);
    if (named.exists) named.delete();
    out.move(named);
    out = named;
  } catch {}
  try {
    await Sharing.shareAsync(out.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: r.title });
  } finally {
    try { if (out.exists) out.delete(); } catch {}
  }
}

/** 녹음 파일 그대로 공유(원본을 복사하지 않는다) */
export async function shareLongAudio(r: LongRec): Promise<void> {
  if (!r.uri) return;
  await Sharing.shareAsync(r.uri, { mimeType: 'audio/mp4', dialogTitle: r.title });
}
