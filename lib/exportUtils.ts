// ─── 일정 내보내기 (복사 / 텍스트 / PDF) ────────────────────────────────────────
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { formatDayHeader, formatTime, isPastItem } from './dateUtils';
import { t } from './i18n';
import { isMovedAway, outcomeTag } from './outcome';
import type { ScheduleRecord } from './storage';

/** 기간 일정(휴가 등)이면 " ~ 10월 24일 (토)" */
const rangeEnd = (r: ScheduleRecord) => (r.endAt != null ? ` ~ ${formatDayHeader(new Date(r.endAt))}` : '');

/** 레코드 1건 → 사람이 읽는 텍스트 */
export function recordToText(r: ScheduleRecord): string {
  const lines: string[] = [];
  if (r.scheduleAt != null) {
    const d = new Date(r.scheduleAt);
    lines.push(`${formatDayHeader(d)}${r.hasTime ? ' ' + formatTime(d) : ' ' + t('(시간 미정)')}${rangeEnd(r)}`);
  } else {
    lines.push(t('날짜 미정'));
  }
  // 구버전 데이터 호환: 과거엔 추가 내용이 content 문자열에 '\n• '로 이어붙여 저장됨
  const [main, ...legacyNotes] = (r.content || r.transcript || t('(내용 없음)')).split('\n• ');
  const tag = isPastItem(r) || isMovedAway(r) ? outcomeTag(r) : ''; // 지난 일정의 결과(못 함·덜 함·바뀜)
  lines.push(tag ? `${main} [${tag}]` : main);
  for (const n of legacyNotes) lines.push(`  • ${n}`);
  for (const a of r.appends ?? []) lines.push(`  + ${a.content || a.transcript}`);
  return lines.join('\n');
}

/** 여러 건 → 텍스트 문서 */
export function recordsToText(records: ScheduleRecord[]): string {
  const now = new Date();
  const header = t('세이람 일정 ({date} 기준, {n}건)', { date: ymd(now), n: records.length });
  return [header, '', ...records.map((r) => recordToText(r)), ''].join('\n\n');
}

/** 문서(PDF/미리보기) 한 행 — 일시 · 본문 · 추가 메모 */
export type DocRow = { when: string; main: string; notes: string[] };

export function recordRows(records: ScheduleRecord[]): DocRow[] {
  return records.map((r) => {
    const when =
      r.scheduleAt != null
        ? `${formatDayHeader(new Date(r.scheduleAt))}${r.hasTime ? ' ' + formatTime(new Date(r.scheduleAt)) : ''}${rangeEnd(r)}`
        : t('날짜 미정');
    const [main, ...legacyNotes] = (r.content || r.transcript || t('(내용 없음)')).split('\n• ');
    const notes = [...legacyNotes, ...(r.appends ?? []).map((a) => a.content || a.transcript)];
    const tag = isPastItem(r) || isMovedAway(r) ? outcomeTag(r) : '';
    return { when, main: tag ? `${main} [${tag}]` : main, notes };
  });
}

/** 문서 제목 줄 — "2026년 10월 12일 기준 · 3건" */
export function docSubtitle(count: number, now: Date = new Date()): string {
  return t('{date} 기준 · {n}건', { date: ymd(now), n: count });
}

/** 문서용 날짜 — "2026년 10월 12일" (영어는 "10/12/2026") */
function ymd(d: Date): string {
  return t('{y}년 {m}월 {d}일', { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
}

/** 여러 건 → PDF용 HTML */
export function recordsToHtml(records: ScheduleRecord[]): string {
  const now = new Date();
  const rows = recordRows(records)
    .map(({ when, main, notes }) => {
      const notesHtml = notes.length
        ? `<ul>${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
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
    <h1>${escapeHtml(t('세이람 일정'))}</h1>
    <div class="sub">${docSubtitle(records.length, now)}</div>
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
    Alert.alert(t('복사 완료'), t('일정 {n}건을 복사했습니다.', { n: records.length }));
  } catch {
    Alert.alert(t('복사 실패'), t('다시 시도해주세요.'));
  }
}

/** 텍스트 파일로 내보내기 (공유 시트) */
export async function exportRecordsTxt(records: ScheduleRecord[]): Promise<void> {
  try {
    const dir = new Directory(Paths.cache, 'exports');
    if (!dir.exists) dir.create({ intermediates: true });
    const f = new File(dir, `${t('세이람일정')}_${stamp()}.txt`);
    if (f.exists) f.delete();
    f.create();
    f.write(recordsToText(records));
    await Sharing.shareAsync(f.uri, { mimeType: 'text/plain', dialogTitle: t('일정 내보내기') });
  } catch (e) {
    Alert.alert(t('내보내기 실패'), String(e));
  }
}

/** PDF로 내보내기 (공유 시트) */
export async function exportRecordsPdf(records: ScheduleRecord[]): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({ html: recordsToHtml(records) });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: t('일정 PDF 내보내기'),
    });
  } catch (e) {
    Alert.alert(t('PDF 내보내기 실패'), String(e));
  }
}
