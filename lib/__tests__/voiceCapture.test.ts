// Android 12 이하에서는 녹음 파일 + 음성 인식 동시 캡처가 불가(인식기 무음 처리) → 인식만 돌려야 한다
import { canRecordFileWhileRecognizing, NO_FILE_NOTICE } from '../voiceCapture';

describe('canRecordFileWhileRecognizing', () => {
  test('iOS는 항상 가능', () => {
    expect(canRecordFileWhileRecognizing('ios', '17.0')).toBe(true);
  });
  test('Android 12(API 31·32) 이하는 불가', () => {
    expect(canRecordFileWhileRecognizing('android', 31)).toBe(false);
    expect(canRecordFileWhileRecognizing('android', 32)).toBe(false);
    expect(canRecordFileWhileRecognizing('android', 28)).toBe(false);
  });
  test('Android 13(API 33) 이상은 가능', () => {
    expect(canRecordFileWhileRecognizing('android', 33)).toBe(true);
    expect(canRecordFileWhileRecognizing('android', '34')).toBe(true);
  });
  test('버전을 알 수 없으면 기존 동작(녹음 포함) 유지', () => {
    expect(canRecordFileWhileRecognizing('android', 'unknown')).toBe(true);
  });
  test('안내 문구는 Android 12 이하와 글만 저장됨을 말한다', () => {
    expect(NO_FILE_NOTICE).toMatch(/Android 12/);
    expect(NO_FILE_NOTICE).toMatch(/글/);
  });
});
