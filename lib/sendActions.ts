// ─── 일정 보내기: 메신저·문자 앱 열기, 연락처에서 번호 찾기 ───────────────────────────
// 모두 "보내기 화면을 여는" 데까지만 한다. 실제 발송은 사용자가 메신저·문자 앱에서 직접 누른다(자동 발송 없음).
// - 메신저(나라별, lib/messenger.ts):
//     Android는 그 앱 패키지(카카오톡·LINE·WeChat·WhatsApp)를 지정해 ACTION_SEND(modules/sayram-share), 없으면 공유 창.
//     iOS는 WhatsApp(whatsapp://send?text=)·LINE(https://line.me/R/msg/text/?)만 바로 열고,
//     카카오톡·WeChat·일반은 공유 창(각 SDK 쓰지 않음). 앱이 없거나 열기에 실패하면 공유 창.
// - 문자: expo-sms 작성 화면(Android SEND_SMS 권한 없이 작성 화면만 연다). 문자를 못 쓰는 기기면 공유 창.
// - 연락처: "엄마한테 보내줘"라고 말했을 때만, 문자를 고른 그 순간에 권한을 묻는다. 번호는 이 폰 안에서만 쓰고 저장하지 않는다.
import { Linking, Platform, Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as SMS from 'expo-sms';
// expo-contacts는 불러오는 순간 네이티브 클래스를 이어받는다 — 쓸 때만 불러온다(테스트·네이티브 없는 빌드에서 앱이 죽지 않게)
type ContactsLib = typeof import('expo-contacts');

type Native = { shareTextTo?(pkg: string, text: string): Promise<boolean> };
const native = requireOptionalNativeModule<Native>('SayramShare');
import type { Messenger } from './messenger';

/** OS 공유 창('다른 앱으로 보내기' 버튼, 그리고 모든 실패의 대체 경로) — 교대알람 근무표 보내기와 같은 방식 */
export async function shareSheet(text: string): Promise<void> {
  try {
    await Share.share({ message: text });
  } catch (e) {
    console.warn('공유 창 열기 실패:', e);
  }
}

/** iOS에서 바로 열 주소(설치 확인용 scheme, 열 주소). 카카오톡·WeChat·일반은 없음 → 공유 창 */
export function iosMessengerUrl(m: Messenger, text: string): { check: string; open: string } | null {
  const q = encodeURIComponent(text);
  if (m.id === 'whatsapp') return { check: 'whatsapp://', open: `whatsapp://send?text=${q}` };
  // LINE은 유니버설 링크 — 앱이 없으면 사파리로 가므로 line:// 로 설치부터 확인한다
  if (m.id === 'line') return { check: 'line://', open: `https://line.me/R/msg/text/?${q}` };
  return null;
}

/** 메신저로 보내기 화면 열기(나라별 앱, 안 되면 공유 창) */
export async function openMessenger(text: string, m: Messenger): Promise<void> {
  if (Platform.OS === 'android') {
    if (m.androidPkg && native?.shareTextTo) {
      try {
        if (await native.shareTextTo(m.androidPkg, text)) return;
      } catch {}
    }
  } else if (Platform.OS === 'ios') {
    const url = iosMessengerUrl(m, text);
    if (url) {
      try {
        // canOpenURL은 Info.plist LSApplicationQueriesSchemes(whatsapp·line)에 있어야 true가 나온다
        if (await Linking.canOpenURL(url.check)) {
          await Linking.openURL(url.open);
          return;
        }
      } catch {}
    }
  }
  await shareSheet(text);
}

/** 문자 작성 화면 열기(번호가 없으면 비운 채로) */
export async function openSms(text: string, phone: string | null): Promise<void> {
  try {
    if (await SMS.isAvailableAsync()) {
      await SMS.sendSMSAsync(phone ? [phone] : [], text);
      return;
    }
  } catch (e) {
    console.warn('문자 작성 화면 열기 실패:', e);
  }
  await shareSheet(text);
}

const digits = (s: string) => s.replace(/[^\d+]/g, '');

/** 연락처에서 이름으로 번호 찾기. 권한을 거부했거나 못 찾으면 null(번호를 비운 채로 연다) */
export async function findPhoneByName(name: string): Promise<string | null> {
  const q = name.trim();
  if (!q) return null;
  try {
    const { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } = require('expo-contacts') as ContactsLib;
    let perm = await getPermissionsAsync();
    if (perm.status !== 'granted' && perm.canAskAgain) perm = await requestPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const list = await Contact.getAllDetails(
      [ContactField.FULL_NAME, ContactField.GIVEN_NAME, ContactField.NICKNAME, ContactField.PHONES] as const,
      { name: q, limit: 20 },
    );
    const norm = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, '').toLowerCase() : '');
    const want = norm(q);
    const withPhone = list.filter((c: any) => Array.isArray(c.phones) && c.phones.some((p: any) => digits(p?.number ?? '').length >= 3));
    // 이름·별명이 똑같은 사람 먼저, 없으면 이름에 들어 있는 첫 사람
    const exact = withPhone.find((c: any) => [c.fullName, c.givenName, c.nickname].some((v) => norm(v) === want));
    const pick: any = exact ?? withPhone[0];
    if (!pick) return null;
    const phones: any[] = pick.phones;
    const mobile = phones.find((p) => /mobile|휴대|cell|iphone/i.test(String(p?.label ?? ''))) ?? phones[0];
    const n = digits(mobile?.number ?? '');
    return n.length >= 3 ? n : null;
  } catch (e) {
    console.warn('연락처 찾기 실패:', e);
    return null;
  }
}
