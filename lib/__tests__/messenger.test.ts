// 일정 보내기 1.2.1: 나라(지역)별 메신저 고르기, 앱이 없을 때 공유 창으로 대체, 옛 설정값('kakao') 옮기기
import { Linking, Platform, Share } from 'react-native';

const mockShareTextTo = jest.fn();
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: (name: string) => (name === 'SayramShare' ? { shareTextTo: (...a: any[]) => mockShareTextTo(...a) } : null),
}));
// prefs(i18n가 불러옴)는 파일을 쓰지 않게 비운다
jest.mock('expo-file-system', () => {
  class F { constructor(..._a: any[]) {} get exists() { return false; } create() {} write() {} textSync() { return ''; } }
  return { Directory: F, File: F, Paths: { document: 'doc', cache: 'cache' } };
});
jest.mock('expo-sms', () => ({ isAvailableAsync: jest.fn(async () => false), sendSMSAsync: jest.fn() }));

const mockRegion = { code: 'KR' as string | null };
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: mockRegion.code }] }));

import { deviceRegion, messengerButtonLabel, messengerForRegion, messengerNote, sendButtons, MESSENGER_PKG } from '../messenger';
import { iosMessengerUrl, openMessenger } from '../sendActions';
import { translate } from '../i18n';

const ko = (k: string, p?: Record<string, string | number>) => translate('ko', k, p);
const en = (k: string, p?: Record<string, string | number>) => translate('en', k, p);

describe('나라 → 메신저', () => {
  test.each([
    ['KR', 'kakao', 'com.kakao.talk', false],
    ['JP', 'line', 'jp.naver.line.android', false],
    ['TW', 'line', 'jp.naver.line.android', false],
    ['TH', 'line', 'jp.naver.line.android', false],
    ['CN', 'wechat', 'com.tencent.mm', false],
    ['US', 'generic', null, true],
    ['CA', 'generic', null, true],
    ['BR', 'whatsapp', 'com.whatsapp', false],
    ['DE', 'whatsapp', 'com.whatsapp', false],
    ['IN', 'whatsapp', 'com.whatsapp', false],
    ['kr', 'kakao', 'com.kakao.talk', false], // 소문자도
  ])('%s → %s', (region, id, pkg, smsFirst) => {
    expect(messengerForRegion(region)).toEqual({ id, androidPkg: pkg, smsFirst });
  });
  test.each([null, undefined, '', '001', 'KOR', '419'])('모르는 지역(%p) → 일반 메신저', (region) => {
    expect(messengerForRegion(region as any)).toEqual({ id: 'generic', androidPkg: null, smsFirst: false });
  });
  test('기기 지역 읽기(주입) — 없으면 null', () => {
    mockRegion.code = 'JP';
    expect(deviceRegion()).toBe('JP');
    mockRegion.code = null;
    expect(deviceRegion()).toBeNull();
  });
});

describe('버튼 이름·안내 문구', () => {
  test('한국어: 카톡은 "카톡", 나머지는 앱 이름', () => {
    expect(messengerButtonLabel('kakao', ko)).toBe('💬 카톡으로 보내기');
    expect(messengerButtonLabel('line', ko)).toBe('💬 LINE으로 보내기');
    expect(messengerButtonLabel('whatsapp', ko)).toBe('💬 WhatsApp으로 보내기');
    expect(messengerButtonLabel('generic', ko)).toBeNull(); // 나라 메신저가 없으면 버튼을 두지 않는다
    expect(ko('📤 다른 앱으로 보내기')).toBe('📤 다른 앱으로 보내기');
    expect(messengerNote('kakao', ko)).toBe('문자는 글이 길면 요금이 나올 수 있어요. 카톡은 무료예요');
    expect(messengerNote('generic', ko)).toBe('문자는 글이 길면 요금이 나올 수 있어요');
  });
  test('영어', () => {
    expect(messengerButtonLabel('kakao', en)).toBe('💬 Send via KakaoTalk');
    expect(messengerButtonLabel('wechat', en)).toBe('💬 Send via WeChat');
    expect(en('📤 다른 앱으로 보내기')).toBe('📤 Send via other apps');
    expect(messengerNote('whatsapp', en)).toBe('Long text messages may cost extra. WhatsApp is free.');
    expect(messengerNote('generic', en)).toBe('Long text messages may cost extra.');
  });
  test('9개 언어 모두 {app} 자리에 이름이 들어가고 KakaoTalk 고정 문구가 남지 않는다', () => {
    for (const lang of ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt'] as const) {
      const tl = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);
      const label = messengerButtonLabel('line', tl);
      expect(label).toContain('LINE');
      expect(tl('📤 다른 앱으로 보내기')).toMatch(/^📤 /);
      expect(label).not.toContain('{app}');
      expect(messengerNote('line', tl)).toContain('LINE');
      expect(messengerNote('generic', tl)).not.toMatch(/kakao|카톡|カカオ/i);
    }
  });
});

describe('버튼 순서(다른 앱으로 보내기는 늘 있다)', () => {
  const kr = messengerForRegion('KR');
  const us = messengerForRegion('US');
  const unknown = messengerForRegion(null);
  test('나라 메신저가 있으면 [메신저, 문자, 다른 앱]', () => {
    expect(sendButtons(kr, 'auto')).toEqual(['messenger', 'sms', 'share']);
    expect(sendButtons(messengerForRegion('BR'), 'auto')).toEqual(['messenger', 'sms', 'share']);
  });
  test('미국·캐나다: 메신저 버튼 없이 문자가 위', () => {
    expect(sendButtons(us, 'auto')).toEqual(['sms', 'share']);
  });
  test('나라를 모르면 메신저 버튼 없이 공유 창이 위', () => {
    expect(sendButtons(unknown, 'auto')).toEqual(['share', 'sms']);
  });
  test('마지막에 고른 방식을 위로', () => {
    expect(sendButtons(kr, 'sms')).toEqual(['sms', 'messenger', 'share']);
    expect(sendButtons(kr, 'share')).toEqual(['share', 'messenger', 'sms']);
    expect(sendButtons(us, 'share')).toEqual(['share', 'sms']);
  });
  test('메신저를 고르던 사람이 메신저 없는 나라면 공유 창이 위(옛 kakao 값 포함)', () => {
    expect(sendButtons(us, 'messenger')).toEqual(['share', 'sms']);
    expect(sendButtons(unknown, 'messenger')).toEqual(['share', 'sms']);
  });
  test('모든 경우에 공유 창 버튼이 있다', () => {
    for (const r of ['KR', 'JP', 'CN', 'US', 'BR', null]) for (const v of ['auto', 'messenger', 'sms', 'share'] as const) {
      expect(sendButtons(messengerForRegion(r), v)).toContain('share');
    }
  });
});

describe('보내기 화면 열기', () => {
  let shareSpy: jest.SpyInstance;
  let canOpenSpy: jest.SpyInstance;
  let openSpy: jest.SpyInstance;
  beforeEach(() => {
    mockShareTextTo.mockReset();
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    canOpenSpy = jest.spyOn(Linking, 'canOpenURL');
    openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    // RN 목의 Linking·Share는 원래 jest.fn이라 지난 호출이 남는다 — 비운다
    [shareSpy, canOpenSpy, openSpy].forEach((f) => f.mockClear());
  });
  afterEach(() => jest.restoreAllMocks());

  describe('Android', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
    test.each(['KR', 'JP', 'CN', 'BR'])('%s: 그 나라 메신저 패키지로 바로 연다', async (region) => {
      mockShareTextTo.mockResolvedValue(true);
      const m = messengerForRegion(region);
      await openMessenger('글', m);
      expect(mockShareTextTo).toHaveBeenCalledWith(m.androidPkg, '글');
      expect(shareSpy).not.toHaveBeenCalled();
    });
    test('앱이 없으면(false) 공유 창', async () => {
      mockShareTextTo.mockResolvedValue(false);
      await openMessenger('글', messengerForRegion('BR'));
      expect(shareSpy).toHaveBeenCalledWith({ message: '글' });
    });
    test('네이티브가 던지면 공유 창', async () => {
      mockShareTextTo.mockRejectedValue(new Error('x'));
      await openMessenger('글', messengerForRegion('JP'));
      expect(shareSpy).toHaveBeenCalledWith({ message: '글' });
    });
    test('일반(미국·모름)은 패키지 없이 공유 창', async () => {
      await openMessenger('글', messengerForRegion('US'));
      expect(mockShareTextTo).not.toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalledWith({ message: '글' });
    });
    test('네 패키지가 매니페스트 <queries>와 네이티브 허용 목록에 모두 있다', () => {
      const fs = require('fs');
      const path = require('path');
      const root = path.resolve('modules/sayram-share/android/src/main');
      const manifest = fs.readFileSync(path.join(root, 'AndroidManifest.xml'), 'utf8');
      const kt = fs.readFileSync(path.join(root, 'java/com/danielpark/sayram/share/SayramShareModule.kt'), 'utf8');
      for (const pkg of Object.values(MESSENGER_PKG)) {
        expect(manifest).toContain(`<package android:name="${pkg}"/>`);
        expect(kt).toContain(`"${pkg}"`);
      }
    });
  });

  describe('iOS', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));
    test('WhatsApp: 깔려 있으면 whatsapp://send?text=', async () => {
      canOpenSpy.mockResolvedValue(true);
      await openMessenger('a b&c', messengerForRegion('BR'));
      expect(canOpenSpy).toHaveBeenCalledWith('whatsapp://');
      expect(openSpy).toHaveBeenCalledWith('whatsapp://send?text=a%20b%26c');
      expect(shareSpy).not.toHaveBeenCalled();
    });
    test('LINE: 깔려 있으면 line.me 링크', async () => {
      canOpenSpy.mockResolvedValue(true);
      await openMessenger('일정', messengerForRegion('JP'));
      expect(canOpenSpy).toHaveBeenCalledWith('line://');
      expect(openSpy).toHaveBeenCalledWith(`https://line.me/R/msg/text/?${encodeURIComponent('일정')}`);
    });
    test('앱이 없으면 공유 창', async () => {
      canOpenSpy.mockResolvedValue(false);
      await openMessenger('글', messengerForRegion('TH'));
      expect(openSpy).not.toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalledWith({ message: '글' });
    });
    test('열기에 실패하면 공유 창', async () => {
      canOpenSpy.mockResolvedValue(true);
      openSpy.mockRejectedValue(new Error('x'));
      await openMessenger('글', messengerForRegion('BR'));
      expect(shareSpy).toHaveBeenCalledWith({ message: '글' });
    });
    test.each(['KR', 'CN', 'US', null])('%p: 카톡·WeChat·일반은 바로 공유 창', async (region) => {
      await openMessenger('글', messengerForRegion(region));
      expect(canOpenSpy).not.toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalledWith({ message: '글' });
      expect(iosMessengerUrl(messengerForRegion(region), '글')).toBeNull();
    });
    test('app.json LSApplicationQueriesSchemes에 whatsapp·line', () => {
      const schemes: string[] = require('../../app.json').expo.ios.infoPlist.LSApplicationQueriesSchemes;
      expect(schemes).toEqual(expect.arrayContaining(['alarmapp', 'whatsapp', 'line']));
    });
  });
});
