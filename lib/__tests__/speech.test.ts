// 글 읽어 주기: 음성 언어 표기(플랫폼별)와 길이 제한
import { clampSpeech, SPEECH_MAX_CHARS, speechLanguage, recordSpeechText } from '../speech';

test('Android는 언어 코드만(ko), iOS는 지역까지(ko-KR) 넘긴다 — Android 엔진이 ko-KR을 못 알아듣기 때문', () => {
  expect(speechLanguage('android')).toBe('ko');
  expect(speechLanguage('ios')).toBe('ko-KR');
});

test('음성 엔진 한도를 넘는 긴 글은 잘라서 넘긴다(거부되면 ⏸에서 멈춤)', () => {
  const long = '가'.repeat(5000);
  expect(clampSpeech(long).length).toBe(SPEECH_MAX_CHARS);
  expect(clampSpeech('  짧은 글  ')).toBe('짧은 글');
});

test('카드 읽기 문장: 날짜 미정이면 내용만, 시간 없으면 날짜만 붙인다', () => {
  expect(recordSpeechText({ content: '우유 사기', needsDate: true, scheduleAt: Date.now() })).toBe('우유 사기');
  const d = new Date(2026, 9, 14).getTime();
  expect(recordSpeechText({ content: '병원', scheduleAt: d, hasTime: false })).toBe('10월 14일, 수. 병원');
  expect(recordSpeechText({ content: '', transcript: '' })).toBe('');
});
