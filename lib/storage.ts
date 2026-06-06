// ─── 일정 영구 저장 (expo-file-system JSON) ──────────────────────────────────
import { Directory, File, Paths } from 'expo-file-system';

export type ScheduleRecord = {
  id: string;
  uri: string;            // 녹음 파일 경로
  durationSec: number;
  transcript: string;     // STT 원문
  content: string;        // 날짜·시간 제거한 할 일 내용
  scheduleAt: number | null; // 일정 시각(epoch ms). 시간 미정이면 날짜 0시
  scheduleDisplay: string;   // "6월 7일 (토) 오후 3:00"
  hasDate: boolean;
  hasTime: boolean;
  notifIds?: string[];    // expo-notifications 식별자 배열 (main + +1분 + +2분 슬롯)
  createdAt: number;      // 생성 시각(epoch ms)
};

const DB_DIR = new Directory(Paths.document, 'mallo');
const DB_FILE = new File(DB_DIR, 'records.json');

function ensureDir() {
  try {
    if (!DB_DIR.exists) DB_DIR.create({ intermediates: true });
  } catch {}
}

export function loadRecords(): ScheduleRecord[] {
  try {
    if (!DB_FILE.exists) return [];
    const raw = DB_FILE.textSync();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as ScheduleRecord[];
  } catch (e) {
    console.warn('records 로드 실패:', e);
    return [];
  }
}

export function saveRecords(records: ScheduleRecord[]) {
  try {
    ensureDir();
    if (!DB_FILE.exists) DB_FILE.create();
    DB_FILE.write(JSON.stringify(records));
  } catch (e) {
    console.warn('records 저장 실패:', e);
  }
}

/** 녹음 임시 파일을 mallo 폴더로 복사하고 영구 경로 반환 */
export function persistAudio(srcUri: string, id: string): string {
  ensureDir();
  const dest = new File(DB_DIR, `rec_${id}.m4a`);
  if (dest.exists) dest.delete();
  new File(srcUri).copySync(dest);
  return dest.uri;
}

/** 녹음 파일 삭제 */
export function deleteAudio(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}
