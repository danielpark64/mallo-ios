// 이미 소리 없이 저장된 녹음(2026-10-18 폰 11월 일정 2건 같은)을 앱 시작 때 정리한다:
// uri를 비워 ▶가 무음 대신 "글 읽어 주기"로 동작하게 하고, 글·알람·추가 엔트리는 그대로 둔다.
import { healEmptyRecordings } from '../healRecordings';
import type { ScheduleRecord } from '../storage';

const rec = (id: string, uri: string, extra: Partial<ScheduleRecord> = {}): ScheduleRecord => ({
  id, uri, durationSec: 6, transcript: '11월 4일 9시 병원', content: '병원', scheduleAt: 1, scheduleDisplay: '',
  hasDate: true, hasTime: true, createdAt: 1, ...extra,
});
const emptyUris = new Set(['file:///a/rec_bad.m4a', 'file:///a/rec_bad_a1.m4a']);
const isEmpty = (uri: string) => emptyUris.has(uri);

test('빈 녹음의 uri만 비우고 나머지는 그대로', () => {
  const input = [rec('bad', 'file:///a/rec_bad.m4a'), rec('ok', 'file:///a/rec_ok.m4a')];
  const { records, healed, removed } = healEmptyRecordings(input, isEmpty);
  expect(healed).toBe(1);
  expect(removed).toEqual(['file:///a/rec_bad.m4a']);
  expect(records[0]).toEqual({ ...input[0], uri: '' });
  expect(records[1]).toBe(input[1]);
});

test('추가 엔트리의 빈 녹음도 정리한다', () => {
  const input = [rec('x', 'file:///a/rec_ok.m4a', {
    appends: [{ id: 'a1', uri: 'file:///a/rec_bad_a1.m4a', durationSec: 5, transcript: 't', content: 't', createdAt: 1 }],
  })];
  const { records, healed } = healEmptyRecordings(input, isEmpty);
  expect(healed).toBe(1);
  expect(records[0].uri).toBe('file:///a/rec_ok.m4a');
  expect(records[0].appends![0].uri).toBe('');
});

test('고칠 게 없으면 같은 배열을 돌려준다(저장하지 않게)', () => {
  const input = [rec('ok', 'file:///a/rec_ok.m4a'), rec('text', '')];
  const out = healEmptyRecordings(input, isEmpty);
  expect(out.healed).toBe(0);
  expect(out.records).toBe(input);
});
