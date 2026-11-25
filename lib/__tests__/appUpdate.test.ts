// 새 버전 안내(lib/appUpdate.ts, 1.2.3) — 교대알람 scripts/logic-tests/app-update.test.js(1.6.3)를 jest로 옮겼다.
// 규칙: 본부/규칙/업데이트-안내.md. 판정은 전부 이 순수 함수들 — 화면·네이티브는 판정 결과만 쓴다.
//  - 버전은 숫자 마디로 비교(문자열 비교 금지: "1.6.10" < "1.6.9"가 되어 버린다)
//  - 깔린 판이 스토어 판보다 높으면(심사 중 빌드) 안 띄운다 — 심사 담당자가 "업데이트하라" 창을 보면 안 된다
//  - 응답이 깨졌으면 조용히 넘어간다(null)
//  - [나중에]를 누른 날은 다시 안 묻는다 — 다음 날 다시 묻는다
//  - 울리는 중이면 절대 안 띄운다
import * as A from '../appUpdate';
import * as AppInfo from '../appInfo';

const BID = 'com.danielpark.sayram';
const ok = (v: string) => ({ resultCount: 1, results: [{ version: v, bundleId: BID, trackViewUrl: 'x' }] });

test('버전 비교', () => {
  expect(A.compareVersions('1.6.10', '1.6.9')).toBe(1);
  expect(A.compareVersions('1.6.9', '1.6.10')).toBe(-1);
  expect(A.compareVersions('1.6.2', '1.6.2')).toBe(0);
  expect(A.compareVersions('1.6', '1.6.0')).toBe(0); // 마디 수가 달라도 같은 판
  expect(A.compareVersions('2.0', '1.99.99')).toBe(1);
  // 형식이 깨지면 null
  expect(A.compareVersions('1.6.x', '1.6.2')).toBeNull();
  expect(A.compareVersions('', '1.0')).toBeNull();
  expect(A.compareVersions(undefined, '1.0')).toBeNull();
});

test('iOS: App Store 조회 응답에서 버전 꺼내기', () => {
  expect(A.parseLookupVersion(ok('1.2.3'))).toBe('1.2.3');
  expect(A.parseLookupVersion(null)).toBeNull();
  expect(A.parseLookupVersion('<html>')).toBeNull();
  expect(A.parseLookupVersion({ resultCount: 0, results: [] })).toBeNull(); // 그 나라에 아직 안 풀림
  expect(A.parseLookupVersion({ resultCount: 1, results: {} })).toBeNull();
  expect(A.parseLookupVersion(ok('beta'))).toBeNull();
  expect(A.parseLookupVersion({ resultCount: 1, results: [{}] })).toBeNull();
  expect(A.parseLookupVersion({ resultCount: 1, results: [{ version: '9.9.9', bundleId: 'com.other.app' }] }, BID)).toBeNull(); // 다른 앱
});

test('iOS: 띄울 판정', () => {
  expect(A.decideIos('1.2.2', ok('1.2.3'))).toEqual({ storeVersion: '1.2.3', required: false });
  expect(A.decideIos('1.6.9', ok('1.6.10'))).not.toBeNull();
  expect(A.decideIos('1.2.2', ok('1.2.2'))).toBeNull(); // 같은 판
  expect(A.decideIos('1.2.3', ok('1.2.2'))).toBeNull(); // 심사 중 빌드(깔린 판이 높음)
  expect(A.decideIos('1.2.2', { foo: 1 })).toBeNull();  // 깨진 응답
  expect(A.decideIos('', ok('1.2.3'))).toBeNull();      // 깔린 버전을 못 읽음
});

test('Android: Play 인앱 업데이트 정보(updateAvailability 2 = UPDATE_AVAILABLE)', () => {
  expect(A.decideAndroid(9, { availability: 2, versionCode: 10 })).toEqual({ storeVersion: '10', required: false });
  expect(A.decideAndroid(9, { availability: 1, versionCode: 9 })).toBeNull();   // 같은 판
  expect(A.decideAndroid(11, { availability: 2, versionCode: 10 })).toBeNull(); // 내부 테스트 빌드(높은 판)
  expect(A.decideAndroid(9, { availability: 3, versionCode: 10 })).toBeNull();  // 설치 중 등
  expect(A.decideAndroid(9, null)).toBeNull();                                 // Play 없음·실패
  expect(A.decideAndroid(9, { availability: '2', versionCode: 'x' } as unknown as A.PlayUpdate)).toBeNull();
  expect(A.decideAndroid(NaN, { availability: 2, versionCode: 10 })).toBeNull();
});

test('필수 판(구조만 — 설정값이 없으면 늘 false)', () => {
  expect(A.decideIos('1.0.0', ok('1.2.3'), null)!.required).toBe(false);
  expect(A.decideIos('1.1.0', ok('1.2.3'), '1.2.0')!.required).toBe(true);
  expect(A.decideIos('1.2.0', ok('1.2.3'), '1.2.0')!.required).toBe(false);
  expect(A.decideAndroid(7, { availability: 2, versionCode: 10 }, 8)!.required).toBe(true);
  // 앱 설정값은 지금 비어 있다(쓰지 않음)
  expect(AppInfo.UPDATE_REQUIRED.iosMinVersion).toBeNull();
  expect(AppInfo.UPDATE_REQUIRED.androidMinVersionCode).toBeNull();
});

test('띄울지: [나중에]·울림', () => {
  const info = { storeVersion: '1.2.3', required: false };
  expect(A.dayKey(new Date('2026-11-25T10:00:00'))).toBe('2026-11-25');
  expect(A.shouldShowUpdate({ info, laterDay: null, today: '2026-11-25', ringing: false })).toBe(true);
  expect(A.shouldShowUpdate({ info, laterDay: '2026-11-25', today: '2026-11-25', ringing: false })).toBe(false); // 같은 날 [나중에]
  expect(A.shouldShowUpdate({ info, laterDay: '2026-11-25', today: '2026-11-26', ringing: false })).toBe(true);  // 다음 날
  expect(A.shouldShowUpdate({ info, laterDay: null, today: '2026-11-25', ringing: true })).toBe(false);          // 울리는 중
  expect(A.shouldShowUpdate({ info: { ...info, required: true }, laterDay: null, today: '2026-11-25', ringing: true })).toBe(false);
  expect(A.shouldShowUpdate({ info: { ...info, required: true }, laterDay: '2026-11-25', today: '2026-11-25', ringing: false })).toBe(true);
  expect(A.shouldShowUpdate({ info: null, laterDay: null, today: '2026-11-25', ringing: false })).toBe(false);
});

test('iOS 조회 주소: 번들 ID와 나라만', () => {
  expect(A.lookupUrl(BID, 'KR')).toBe('https://itunes.apple.com/lookup?bundleId=com.danielpark.sayram&country=kr');
  expect(A.lookupUrl(BID, null)).toBe('https://itunes.apple.com/lookup?bundleId=com.danielpark.sayram');
  expect(A.lookupUrl(BID, 'kr&x=1')).toBe('https://itunes.apple.com/lookup?bundleId=com.danielpark.sayram');
});

test('앱 값: 세이람 번들·패키지, 스토어 주소는 한 곳', () => {
  expect(AppInfo.IOS_BUNDLE_ID).toBe('com.danielpark.sayram');
  expect(AppInfo.ANDROID_PACKAGE).toBe('com.danielpark.sayram');
  expect(AppInfo.STORE_ANDROID_WEB).toBe('https://play.google.com/store/apps/details?id=com.danielpark.sayram');
  expect(typeof AppInfo.IOS_UPDATE_CHECK_ENABLED).toBe('boolean');
});

describe('checkForUpdate(네이티브 연결)', () => {
  afterEach(() => { jest.resetModules(); jest.dontMock('expo-modules-core'); jest.dontMock('../appInfo'); });

  const load = (os: 'ios' | 'android', native: unknown, iosOn = true) => {
    jest.resetModules();
    jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule: () => native }));
    jest.doMock('../appInfo', () => ({ ...jest.requireActual('../appInfo'), IOS_UPDATE_CHECK_ENABLED: iosOn }));
    const RN = require('react-native');
    RN.Platform.OS = os;
    return require('../appUpdateNative') as typeof import('../appUpdateNative');
  };

  test('iOS 스위치가 꺼져 있으면 fetch 자체를 안 한다', async () => {
    const f = jest.fn();
    (globalThis as any).fetch = f;
    const m = load('ios', { getInstalledVersion: () => ({ version: '1.2.2', build: '17' }), getRegion: () => 'KR' }, false);
    expect(await m.checkForUpdate()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  test('iOS 스위치가 켜져 있으면 번들 ID·나라만 넣어 조회한다', async () => {
    const f = jest.fn(async () => ({ ok: true, json: async () => ok('1.2.3') }));
    (globalThis as any).fetch = f;
    const m = load('ios', { getInstalledVersion: () => ({ version: '1.2.2', build: '17' }), getRegion: () => 'KR' }, true);
    expect(await m.checkForUpdate()).toEqual({ storeVersion: '1.2.3', required: false });
    expect((f.mock.calls[0] as unknown[])[0]).toBe('https://itunes.apple.com/lookup?bundleId=com.danielpark.sayram&country=kr');
  });

  test('iOS 조회 실패(인터넷 없음)는 조용히 null', async () => {
    (globalThis as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    const m = load('ios', { getInstalledVersion: () => ({ version: '1.2.2', build: '17' }), getRegion: () => 'KR' }, true);
    expect(await m.checkForUpdate()).toBeNull();
  });

  test('Android는 fetch 없이 Play 정보만 쓴다', async () => {
    const f = jest.fn();
    (globalThis as any).fetch = f;
    const m = load('android', { getInstalledVersion: () => ({ version: '1.2.3', build: '9' }), getPlayUpdate: async () => ({ availability: 2, versionCode: 10 }) });
    expect(await m.checkForUpdate()).toEqual({ storeVersion: '10', required: false });
    expect(f).not.toHaveBeenCalled();
  });

  test('모듈이 없으면(Expo Go·옛 빌드) null', async () => {
    const m = load('android', null);
    expect(await m.checkForUpdate()).toBeNull();
  });
});
