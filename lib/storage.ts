// ─── 일정 영구 저장 (expo-file-system JSON) ──────────────────────────────────
import { Directory, File, Paths } from 'expo-file-system';

export type TranscriptSegment = {
  segment: string;          // 세그먼트(단어/구절) 텍스트
  startTimeMillis: number;  // 녹음 시작 기준 시작 시각(ms)
  endTimeMillis: number;    // 녹음 시작 기준 끝 시각(ms)
};

/**
 * "추가" 항목 — 카드의 "＋ 추가"로 붙는 독립된 엔트리.
 * 메인 메모의 부속 메모가 아니라 자기 녹음·전사·구간재생을 가진 별개 엔트리이며,
 * 메인과 한 일정 아래 함께 표시·내보내기 된다.
 */
export type AppendEntry = {
  id: string;
  uri: string;            // 녹음 파일 경로 (텍스트로만 추가한 경우 빈 문자열)
  durationSec: number;
  transcript: string;     // STT 원문
  content: string;        // 추가 내용
  segments?: TranscriptSegment[]; // 단어별 타임스탬프 (구간재생용, 미지원 기기는 undefined)
  createdAt: number;
};

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
  alarmMode?: 'both' | 'sound' | 'vibe'; // 알람 방식
  segments?: TranscriptSegment[]; // 단어별 타임스탬프 (구간재생용, 미지원 기기는 undefined)
  appends?: AppendEntry[]; // "＋ 추가"로 붙은 독립 엔트리들
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
