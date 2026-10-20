// 음성 인식을 아예 못 쓰는 오류만 골라 재시도를 멈춘다(일시적인 오류는 그대로 다시 시도)
import { isSttBlockedError } from '../sttErrors';

test('Siri·받아쓰기 꺼짐·권한 없음·언어 미지원은 멈춤', () => {
  expect(isSttBlockedError('service-not-allowed')).toBe(true);
  expect(isSttBlockedError('not-allowed')).toBe(true);
  expect(isSttBlockedError('language-not-supported')).toBe(true);
});
test('말이 없음·중단·네트워크 같은 일시적 오류는 계속 다시 시도', () => {
  for (const c of ['no-speech', 'aborted', 'network', 'audio-capture', '', undefined, null]) {
    expect(isSttBlockedError(c as string)).toBe(false);
  }
});
