// ─── 전체 백업 / 복원 (폰 옮기기용) ───────────────────────────────────────────────
// 일정 목록(records.json)과 모든 녹음 파일(m4a)을 한 폴더로 모아 둔다.
// iOS: Documents/mallo-backups/<백업명>/ — 파일 앱(나의 iPhone › 말로)에 그대로 보이므로
//      iCloud Drive로 복사해 두고, 새 폰에서 같은 자리에 넣은 뒤 "복원"하면 된다.
// Android: 같은 폴더 구조를 사용자가 고른 폴더(드라이브·다운로드)로 내보내고/가져온다(SAF).
import { Directory, File, Paths } from 'expo-file-system';
import * as Legacy from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { ScheduleRecord } from './storage';
import { t } from './i18n';

const DB_DIR = new Directory(Paths.document, 'mallo');
export const BACKUP_ROOT = new Directory(Paths.document, 'mallo-backups');
const MANIFEST = 'records.json';

export type BackupInfo = { name: string; uri: string; count: number; audioFiles: number; createdAt: number };
export type RestoreResult = { added: number; skipped: number; missingAudio: number; records: ScheduleRecord[] };

function pad(n: number) { return n.toString().padStart(2, '0'); }
export function backupName(d: Date = new Date()): string {
  return `세이람백업_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
export function parseBackupDate(name: string): number {
  const m = /(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/.exec(name);
  if (!m) return 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

function baseName(uri: string): string {
  const n = uri.split('/').pop() ?? '';
  try { return decodeURIComponent(n); } catch { return n; }
}

/** 레코드(메인 + 추가)가 참조하는 녹음 파일 이름들 (중복 제거) */
export function audioNamesOf(records: ScheduleRecord[]): string[] {
  const names = new Set<string>();
  for (const r of records) {
    if (r.uri) names.add(baseName(r.uri));
    for (const a of r.appends ?? []) if (a.uri) names.add(baseName(a.uri));
  }
  return Array.from(names);
}

/** 백업에서 읽은 레코드의 녹음 경로를 현재 앱 폴더 기준으로 바꾼다 (폰이 달라도 파일명은 같다) */
function relocate(records: ScheduleRecord[]): ScheduleRecord[] {
  const here = (uri: string) => (uri ? new File(DB_DIR, baseName(uri)).uri : uri);
  return records.map((r) => ({
    ...r,
    uri: here(r.uri),
    appends: r.appends?.map((a) => ({ ...a, uri: here(a.uri) })),
  }));
}

/** 기존 목록에 없는 id만 더한다 (같은 일정을 두 번 넣지 않음) */
export function mergeRecords(existing: ScheduleRecord[], incoming: ScheduleRecord[]): { records: ScheduleRecord[]; added: number; skipped: number } {
  const have = new Set(existing.map((r) => r.id));
  const fresh = incoming.filter((r) => !have.has(r.id));
  return { records: [...fresh, ...existing], added: fresh.length, skipped: incoming.length - fresh.length };
}

// ── 앱 안 백업 폴더 (iOS·Android 공통) ─────────────────────────────────────────
export function createBackup(records: ScheduleRecord[]): BackupInfo {
  if (!BACKUP_ROOT.exists) BACKUP_ROOT.create({ intermediates: true });
  const name = backupName();
  const dir = new Directory(BACKUP_ROOT, name);
  if (!dir.exists) dir.create({ intermediates: true });
  const manifest = new File(dir, MANIFEST);
  if (!manifest.exists) manifest.create();
  manifest.write(JSON.stringify(records));
  let audioFiles = 0;
  for (const n of audioNamesOf(records)) {
    const src = new File(DB_DIR, n);
    if (!src.exists) continue;
    const dest = new File(dir, n);
    if (dest.exists) dest.delete();
    src.copySync(dest);
    audioFiles++;
  }
  return { name, uri: dir.uri, count: records.length, audioFiles, createdAt: Date.now() };
}

export function listBackups(): BackupInfo[] {
  if (!BACKUP_ROOT.exists) return [];
  let entries: Array<File | Directory> = [];
  try { entries = BACKUP_ROOT.list(); } catch { return []; }
  const out: BackupInfo[] = [];
  for (const e of entries) {
    if (!(e instanceof Directory)) continue;
    const name = baseName(e.uri.replace(/\/$/, ''));
    const manifest = new File(e, MANIFEST);
    if (!manifest.exists) continue;
    let count = 0;
    let audioFiles = 0;
    try {
      const recs = JSON.parse(manifest.textSync()) as ScheduleRecord[];
      count = Array.isArray(recs) ? recs.length : 0;
      audioFiles = Array.isArray(recs) ? audioNamesOf(recs).filter((n) => new File(e, n).exists).length : 0;
    } catch {}
    out.push({ name, uri: e.uri, count, audioFiles, createdAt: parseBackupDate(name) });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function restoreBackup(dirUri: string, existing: ScheduleRecord[]): RestoreResult {
  const dir = new Directory(dirUri);
  const manifest = new File(dir, MANIFEST);
  const incoming = JSON.parse(manifest.textSync()) as ScheduleRecord[];
  if (!Array.isArray(incoming)) throw new Error(t('백업 목록 파일이 올바르지 않아요'));
  if (!DB_DIR.exists) DB_DIR.create({ intermediates: true });
  let missingAudio = 0;
  for (const n of audioNamesOf(incoming)) {
    const dest = new File(DB_DIR, n);
    if (dest.exists) continue;
    const src = new File(dir, n);
    if (!src.exists) { missingAudio++; continue; }
    src.copySync(dest);
  }
  const merged = mergeRecords(existing, relocate(incoming));
  return { ...merged, missingAudio };
}

export function deleteBackup(dirUri: string) {
  const dir = new Directory(dirUri);
  if (dir.exists) dir.delete();
}

// ── Android: 사용자가 고른 폴더로 내보내기 / 가져오기 (Storage Access Framework) ────
const SAF = Legacy.StorageAccessFramework;

export async function exportBackupToFolderAndroid(records: ScheduleRecord[]): Promise<BackupInfo | null> {
  if (Platform.OS !== 'android') return null;
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  const name = backupName();
  const sub = await SAF.makeDirectoryAsync(perm.directoryUri, name);
  const manifestUri = await SAF.createFileAsync(sub, MANIFEST, 'application/json');
  await Legacy.writeAsStringAsync(manifestUri, JSON.stringify(records));
  let audioFiles = 0;
  for (const n of audioNamesOf(records)) {
    const src = new File(DB_DIR, n);
    if (!src.exists) continue;
    const b64 = await Legacy.readAsStringAsync(src.uri, { encoding: Legacy.EncodingType.Base64 });
    const target = await SAF.createFileAsync(sub, n, 'audio/mp4');
    await Legacy.writeAsStringAsync(target, b64, { encoding: Legacy.EncodingType.Base64 });
    audioFiles++;
  }
  return { name, uri: sub, count: records.length, audioFiles, createdAt: Date.now() };
}

export async function importBackupFromFolderAndroid(existing: ScheduleRecord[]): Promise<RestoreResult | null> {
  if (Platform.OS !== 'android') return null;
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  const entries = await SAF.readDirectoryAsync(perm.directoryUri);
  const byName = new Map<string, string>();
  for (const u of entries) byName.set(baseName(u), u);
  const manifestUri = byName.get(MANIFEST);
  if (!manifestUri) throw new Error(t('고른 폴더에 records.json이 없어요. 백업 폴더(세이람백업_…)를 골라주세요.'));
  const incoming = JSON.parse(await Legacy.readAsStringAsync(manifestUri)) as ScheduleRecord[];
  if (!Array.isArray(incoming)) throw new Error(t('백업 목록 파일이 올바르지 않아요'));
  if (!DB_DIR.exists) DB_DIR.create({ intermediates: true });
  let missingAudio = 0;
  for (const n of audioNamesOf(incoming)) {
    const dest = new File(DB_DIR, n);
    if (dest.exists) continue;
    const src = byName.get(n);
    if (!src) { missingAudio++; continue; }
    const b64 = await Legacy.readAsStringAsync(src, { encoding: Legacy.EncodingType.Base64 });
    await Legacy.writeAsStringAsync(dest.uri, b64, { encoding: Legacy.EncodingType.Base64 });
  }
  const merged = mergeRecords(existing, relocate(incoming));
  return { ...merged, missingAudio };
}
