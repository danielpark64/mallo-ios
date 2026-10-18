// 녹음 소리가 비어 버려졌을 때(lib/audioCheck.ts) 사용자에게 바로 알린다 — 메인 녹음·편집기 녹음이 같은 문구를 쓴다.
// 2026-10-18 폰: 빈 녹음이 조용히 저장돼 나중에 ▶가 무음인 걸 알았다. 이제는 저장하는 그 자리에서 알린다.
import { Alert } from 'react-native';
import { t } from './i18n';

export const AUDIO_LOST_TITLE = '녹음 소리가 저장되지 않았어요';
export const AUDIO_LOST_BODY = '녹음이 중간에 끊겨 소리는 저장하지 못했어요. 말한 내용(글)과 알람은 그대로 저장했어요.';

export function notifyAudioLost() {
  Alert.alert(t(AUDIO_LOST_TITLE), t(AUDIO_LOST_BODY));
}
