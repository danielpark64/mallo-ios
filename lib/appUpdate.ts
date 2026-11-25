// 새 버전 안내(1.2.3) — 판정만 하는 순수 함수. React Native·네이티브·i18n import 금지(lib/__tests__/appUpdate.test.ts가 jest에서 돈다).
// 교대알람 src/utils/appUpdate.ts(1.6.3, 기기 검증)를 그대로 가져왔다. 규칙: 본부/규칙/업데이트-안내.md
//   iOS: App Store 공개 조회(itunes lookup) 응답의 version ↔ 깔린 판(CFBundleShortVersionString)
//   Android: Play 인앱 업데이트(AppUpdateManager)의 availableVersionCode ↔ 깔린 versionCode — 인터넷 대신 Play 스토어 앱이 확인
// 앱 값은 lib/appInfo.ts.

export type UpdateInfo = {
  /** 스토어 판(iOS "1.6.3", Android versionCode 문자열) — 화면에는 안 쓰고 기록용 */
  storeVersion: string;
  /** 필수 판(구조만 — appInfo.UPDATE_REQUIRED가 비어 있으면 늘 false) */
  required: boolean;
};

/** Play AppUpdateInfo에서 넘겨받는 값(modules/app-update getPlayUpdate) */
export type PlayUpdate = { availability: number; versionCode: number };
/** com.google.android.play.core.install.model.UpdateAvailability.UPDATE_AVAILABLE */
export const PLAY_UPDATE_AVAILABLE = 2;

const VERSION_RE = /^\d+(\.\d+){0,3}$/;

function parseVersion(v: unknown): number[] | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!VERSION_RE.test(s)) return null;
  return s.split('.').map(Number);
}

/** 숫자 마디로 비교: a > b → 1, 같음 → 0, a < b → -1, 형식이 깨짐 → null. "1.6" = "1.6.0" */
export function compareVersions(a: unknown, b: unknown): 1 | 0 | -1 | null {
  const x = parseVersion(a); const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? 0; const q = y[i] ?? 0;
    if (p !== q) return p > q ? 1 : -1;
  }
  return 0;
}

/** App Store 조회 응답에서 버전. 형식이 깨졌거나 결과가 없거나(그 나라에 아직 안 풀림) 다른 앱이면 null */
export function parseLookupVersion(json: unknown, bundleId?: string): string | null {
  if (!json || typeof json !== 'object') return null;
  const results = (json as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length < 1) return null;
  const r = results[0];
  if (!r || typeof r !== 'object') return null;
  const { version, bundleId: bid } = r as { version?: unknown; bundleId?: unknown };
  if (bundleId && typeof bid === 'string' && bid !== bundleId) return null;
  return parseVersion(version) ? String(version).trim() : null;
}

/** iOS: 스토어 판이 깔린 판보다 높을 때만 안내. 같거나 깔린 판이 높으면(심사 중 빌드) null */
export function decideIos(installed: string, lookupJson: unknown, minRequired: string | null = null, bundleId?: string): UpdateInfo | null {
  const store = parseLookupVersion(lookupJson, bundleId);
  if (!store || compareVersions(store, installed) !== 1) return null;
  return { storeVersion: store, required: minRequired != null && compareVersions(installed, minRequired) === -1 };
}

/** Android: Play가 "업데이트 가능"이라 하고 그 versionCode가 깔린 것보다 높을 때만 안내 */
export function decideAndroid(installedCode: number, play: PlayUpdate | null, minRequiredCode: number | null = null): UpdateInfo | null {
  if (!play || !Number.isFinite(installedCode)) return null;
  if (typeof play.availability !== 'number' || typeof play.versionCode !== 'number' || !Number.isFinite(play.versionCode)) return null;
  if (play.availability !== PLAY_UPDATE_AVAILABLE || play.versionCode <= installedCode) return null;
  return { storeVersion: String(play.versionCode), required: minRequiredCode != null && installedCode < minRequiredCode };
}

/** 기기 날짜 키(YYYY-MM-DD) — [나중에]를 누른 날 기록용 */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 띄울지 — 울리는 중이면 절대 안 띄운다(필수 판도). [나중에]를 누른 날은 안 띄우고 다음 날 다시. 필수 판은 [나중에]가 없다 */
export function shouldShowUpdate(o: { info: UpdateInfo | null; laterDay: string | null; today: string; ringing: boolean }): boolean {
  if (o.ringing || !o.info) return false;
  if (o.info.required) return true;
  return o.laterDay !== o.today;
}

/** iOS 조회 주소 — 번들 ID와 나라(2글자)만 보낸다. 기기 ID·사용자 정보는 넣지 않는다 */
export function lookupUrl(bundleId: string, country: string | null | undefined): string {
  const base = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`;
  const c = typeof country === 'string' ? country.trim().toLowerCase() : '';
  return /^[a-z]{2}$/.test(c) ? `${base}&country=${c}` : base;
}
