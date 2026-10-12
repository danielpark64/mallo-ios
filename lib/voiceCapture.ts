// ─── 녹음 파일 + 음성 인식 동시 캡처 가능 여부 ──────────────────────────────────
// Android 12(API 32) 이하에서는 앱 녹음기(expo-audio)와 시스템 음성 인식기(구글, 별도 uid)가
// 동시에 마이크를 열면 Android 오디오 정책이 화면에 떠 있는 앱(우리 녹음기)만 살리고
// 인식기 쪽을 무음 처리한다(dumpsys audio → RecordActivityMonitor: silenced:true, 노트10+ 실측).
// 그래서 말을 해도 한 글자도 인식되지 않는다. Android 13부터는 인식기 캡처가 호출 앱에 귀속돼 둘 다 동작한다.
// 라이브러리의 "인식기 오디오 저장(recordingOptions.persist)"도 Android 13+ 전용이라, 12 이하에서는
// 녹음 파일을 포기하고 음성 인식만 돌리는 것이 유일한 선택이다.
import { Platform } from 'react-native';

export function canRecordFileWhileRecognizing(
  os: string = Platform.OS,
  version: string | number = Platform.Version,
): boolean {
  if (os !== 'android') return true;
  const api = typeof version === 'number' ? version : parseInt(String(version), 10);
  return Number.isFinite(api) ? api >= 33 : true;
}

/** 녹음 시트·편집기에 보여줄 안내 (Android 12 이하 전용) */
export const NO_FILE_NOTICE = '이 폰(Android 12 이하)에서는 녹음 파일 없이 말한 내용만 글로 저장돼요';
