// ─── JS 치명 오류 기록 ───────────────────────────────────────────────────────
// 릴리스 빌드에서 JS 오류가 나면 앱이 그냥 꺼져 원인을 알 수 없다(크래시 로그엔 메시지가 없음).
// 전역 핸들러로 메시지·스택을 Documents/mallo/last-error.txt 에 남겨 devicectl로 꺼내 볼 수 있게 한다.
import { Directory, File, Paths } from 'expo-file-system';

const DIR = new Directory(Paths.document, 'mallo');
export const ERROR_FILE = new File(DIR, 'last-error.txt');

export function writeCrashLog(e: unknown, isFatal?: boolean) {
  try {
    if (!DIR.exists) DIR.create({ intermediates: true });
    const err = e as { message?: string; stack?: string } | undefined;
    const text = `${new Date().toISOString()} fatal=${String(isFatal)}\n${err?.message ?? String(e)}\n${err?.stack ?? ''}\n`;
    if (!ERROR_FILE.exists) ERROR_FILE.create();
    ERROR_FILE.write(text);
  } catch {}
}

export function installCrashLogger() {
  const g = globalThis as any;
  const utils = g.ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  const prev = utils.getGlobalHandler?.();
  utils.setGlobalHandler((e: unknown, isFatal?: boolean) => {
    writeCrashLog(e, isFatal);
    prev?.(e, isFatal);
  });
}
