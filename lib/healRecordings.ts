// ─── 이미 소리 없이 저장된 녹음 정리 (앱 시작 때 한 번) ───────────────────────────────
// 빈 녹음 검사(lib/audioCheck.ts)가 생기기 전에 저장된 무음 녹음(2026-10-18 폰 11월 일정 2건)은
// ▶를 눌러도 아무 소리가 안 난다. uri를 비우면 ▶가 "글 읽어 주기"로 바뀐다. 글·알람·추가 엔트리는 그대로.
// 새 녹음은 저장 직전에 검사하므로 정리는 기기마다 한 번만 돈다(표시 파일) — 시작할 때마다 파일을 다 열지 않게.
import { Directory, File, Paths } from 'expo-file-system';
import { recordedFileIsEmpty } from './audioCheck';
import type { ScheduleRecord } from './storage';

export function healEmptyRecordings(
  records: ScheduleRecord[],
  isEmpty: (uri: string, durationSec: number) => boolean = recordedFileIsEmpty,
): { records: ScheduleRecord[]; healed: number; removed: string[] } {
  const removed: string[] = [];
  const bad = (uri: string, durationSec: number) => {
    if (!uri || !isEmpty(uri, durationSec)) return false;
    removed.push(uri);
    return true;
  };
  let changed = false;
  const next = records.map((r) => {
    const mainBad = bad(r.uri, r.durationSec);
    let appends = r.appends;
    if (r.appends?.length) {
      const fixed = r.appends.map((a) => (bad(a.uri, a.durationSec) ? { ...a, uri: '' } : a));
      if (fixed.some((a, i) => a !== r.appends![i])) appends = fixed;
    }
    if (!mainBad && appends === r.appends) return r;
    changed = true;
    return { ...r, uri: mainBad ? '' : r.uri, ...(appends ? { appends } : {}) };
  });
  return changed ? { records: next, healed: removed.length, removed } : { records, healed: 0, removed };
}

const HEAL_MARK = new File(new Directory(Paths.document, 'mallo'), '.heal-empty-v1');

/** 기기에서 아직 안 했으면 한 번 정리하고 표시를 남긴다. 표시를 못 남겨도(쓰기 실패) 결과는 그대로 쓴다 */
export function healEmptyRecordingsOnce(records: ScheduleRecord[]): ReturnType<typeof healEmptyRecordings> {
  try {
    if (HEAL_MARK.exists) return { records, healed: 0, removed: [] };
  } catch {
    return { records, healed: 0, removed: [] };
  }
  const out = healEmptyRecordings(records);
  try { HEAL_MARK.create(); } catch {}
  return out;
}
