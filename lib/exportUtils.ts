// ─── 일정 내보내기 (복사 / 텍스트 / PDF) ────────────────────────────────────────
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { formatDayHeader, formatTime } from './dateUtils';
import type { ScheduleRecord } from './storage';

/** 레코드 1건 → 사람이 읽는 텍스트 */
export function recordToText(r: ScheduleRecord): string {
  const lines: string[] = [];
  if (r.scheduleAt != null) {
    const d = new Date(r.scheduleAt);
    lines.push(`${formatDayHeader(d)}${r.hasTime ? ' ' + formatTime(d) : ' (시간 미정)'}`);
  } else {
    lines.push('날짜 미정');
  }
  // 구버전 데이터 호환: 과거엔 추가 내용이 content 문자열에 '\n• '로 이어붙여 저장됨
  const [main, ...legacyNotes] = (r.content || r.transcript || '(내용 없음)').split('\n• ');
  lines.push(main);
  for (const n of legacyNotes) lines.push(`  • ${n}`);
  for (const a of r.appends ?? []) lines.push(`  + ${a.content || a.transcript}`);
  return lines.join('\n');
}

/** 여러 건 → 텍스트 문서 */
export function recordsToText(records: ScheduleRecord[]): string {
  const now = new Date();
  const header = `말로 일정 (${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 기준, ${records.length}건)`;
  return [header, '', ...records.map((r) => recordToText(r)), ''].join('\n\n');
}

/** 여러 건 → PDF용 HTML */
function recordsToHtml(records: ScheduleRecord[]): string {
  const now = new Date();
  const rows = records
    .map((r) => {
      const when =
        r.scheduleAt != null
          ? `${formatDayHeader(new Date(r.scheduleAt))}${r.hasTime ? ' ' + formatTime(new Date(r.scheduleAt)) : ''}`
          : '날짜 미정';
      const [main, ...legacyNotes] = (r.content || r.transcript || '(내용 없음)').split('\n• ');
      const extra = [
        ...legacyNotes,
        ...(r.appends ?? []).map((a) => a.content || a.transcript),
      ];
      const notesHtml = extra.length
        ? `<ul>${extra.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
        : '';
      return `<tr><td class="when">${escapeHtml(when)}</td><td>${escapeHtml(main)}${notesHtml}</td></tr>`;
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, 'Apple SD Gothic Neo', sans-serif; padding: 24px; }
    h1 { font-size: 20px; }
    .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    td { border-bottom: 1px solid #ddd; padding: 10px 8px; font-size: 14px; vertical-align: top; }
    td.when { white-space: nowrap; color: #1a56c4; font-weight: 600; width: 1%; padding-right: 16px; }
    ul { margin: 6px 0 0 0; padding-left: 18px; color: #555; }
  </style></head><body>
    <h1>말로 일정</h1>
    <div class="sub">${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 기준 · ${records.length}건</div>
    <table>${rows}</table>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stamp(): string {
  const n = new Date();
  const p = (v: number) => v.toString().padStart(2, '0');
  return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}`;
}

/** 클립보드 복사 */
export async function copyRecords(records: ScheduleRecord[]): Promise<void> {
  try {
    await Clipboard.setStringAsync(recordsToText(records));
    Alert.alert('복사 완료', `일정 ${records.length}건을 복사했습니다.`);
  } catch {
    Alert.alert('복사 실패', '다시 시도해주세요.');
  }
}

/** 텍스트 파일로 내보내기 (공유 시트) */
export async function exportRecordsTxt(records: ScheduleRecord[]): Promise<void> {
  try {
    const dir = new Directory(Paths.cache, 'exports');
    if (!dir.exists) dir.create({ intermediates: true });
    const f = new File(dir, `말로일정_${stamp()}.txt`);
    if (f.exists) f.delete();
    f.create();
    f.write(recordsToText(records));
    await Sharing.shareAsync(f.uri, { mimeType: 'text/plain', dialogTitle: '일정 내보내기' });
  } catch (e) {
    Alert.alert('내보내기 실패', String(e));
  }
}

/** PDF로 내보내기 (공유 시트) */
export async function exportRecordsPdf(records: ScheduleRecord[]): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({ html: recordsToHtml(records) });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: '일정 PDF 내보내기',
    });
  } catch (e) {
    Alert.alert('PDF 내보내기 실패', String(e));
  }
}
