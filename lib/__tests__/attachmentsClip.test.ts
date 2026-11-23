// 메모·링크·붙여넣은 이미지 첨부 — 옛 데이터 호환, 권한 반납·파일 지우기, 글자 인식 결과 정리
const mockNative = {
  release: jest.fn(),
  thumbnail: jest.fn(async () => 'data:x'),
  exists: jest.fn(async () => false),
  open: jest.fn(() => true),
  saveClipboardImage: jest.fn(async () => ({ ref: 'app:clip_1.jpg', name: 'clip_1.jpg', size: 1234, mime: 'image/jpeg' })),
  recognizeText: jest.fn(async () => ({ status: 'ok', text: ' 12월 3일 ' })),
};
jest.mock('expo-modules-core', () => ({ ...jest.requireActual('expo-modules-core'), requireOptionalNativeModule: (name: string) => (name === 'SayramAttach' ? new Proxy({}, { get: (_t, k) => (mockNative as any)[k] }) : null) }));
jest.mock('expo-clipboard', () => ({}));
import {
  appFileName, attachmentExists, clipRefsInUse, holdClipRefs, isMemo, orphanClipNames, openAttachment, recognizeText, releaseUnused, saveClipboardImage, thumbnailOf, unusedRefs,
} from '../attachments';
import { makeLinkAttachment, makeTextAttachment } from '../clipImport';
import type { Attachment, ScheduleRecord } from '../storage';

const rec = (id: string, attachments?: Attachment[]): ScheduleRecord => ({
  id, uri: '', durationSec: 0, transcript: '', content: id, scheduleAt: 0, scheduleDisplay: '',
  hasDate: false, hasTime: false, createdAt: 0, attachments,
});
const photo = (ref: string): Attachment => ({ ref, kind: 'photo', name: ref, addedAt: 0 });

beforeEach(() => jest.clearAllMocks());

test('옛 데이터(text 없는 photo·file)는 그대로 읽힌다', () => {
  const old = JSON.parse('[{"ref":"content://a","kind":"photo","name":"a.jpg","addedAt":1},{"ref":"bm:xx","kind":"file","name":"b.pdf","size":10,"mime":"application/pdf","addedAt":2}]') as Attachment[];
  expect(old.map(isMemo)).toEqual([false, false]);
  expect(old.every((a) => a.text === undefined)).toBe(true);
});

test('메모·링크는 네이티브를 거치지 않는다', async () => {
  const m = makeTextAttachment('치과');
  const l = makeLinkAttachment('https://a.com');
  expect(isMemo(m) && isMemo(l)).toBe(true);
  await expect(thumbnailOf(m)).resolves.toBeNull();
  await expect(attachmentExists(l)).resolves.toBe(true);
  await expect(openAttachment(m)).resolves.toBe(false);
  expect(mockNative.thumbnail).not.toHaveBeenCalled();
  expect(mockNative.exists).not.toHaveBeenCalled();
});

test('appFileName: app: 파일 이름만, 경로가 끼면 거절', () => {
  expect(appFileName('app:clip_1.jpg')).toBe('clip_1.jpg');
  expect(appFileName('app:../records.json')).toBeNull();
  expect(appFileName('app:a/b.jpg')).toBeNull();
  expect(appFileName('content://x')).toBeNull();
});

test('appFileName: clip_<숫자>.jpg만 — records.json·녹음(rec_*.m4a)은 지우기·백업 대상이 아니다', () => {
  expect(appFileName('app:clip_1732000000000.jpg')).toBe('clip_1732000000000.jpg');
  for (const bad of ['app:records.json', 'app:records.bak.json', 'app:rec_123.m4a', 'app:clip_.jpg', 'app:clip_1.png', 'app:clip_1.jpg.bak', 'app:xclip_1.jpg', 'app:clip_a.jpg']) {
    expect(appFileName(bad)).toBeNull();
  }
});

test('releaseUnused: app:records.json·app:rec_*.m4a는 네이티브로 넘기지 않는다', () => {
  releaseUnused([photo('app:records.json'), photo('app:rec_1.m4a'), photo('app:clip_9.jpg')], []);
  expect(mockNative.release.mock.calls.map((c) => c[0])).toEqual(['app:clip_9.jpg']);
});

test('orphanClipNames: 참조 없는 clip만 — 미리보기에 쓰는 것·10분 안 된 것·다른 파일은 남긴다', () => {
  const now = 100 * 60_000;
  const old = now - 11 * 60_000;
  const files = [
    { name: 'clip_1.jpg', mtime: old },   // 일정이 씀
    { name: 'clip_2.jpg', mtime: old },   // 남은 것 → 지움
    { name: 'clip_3.jpg', mtime: now - 60_000 }, // 막 만든 것
    { name: 'clip_4.jpg', mtime: old },   // 미리보기에 쓰는 중
    { name: 'clip_5.jpg', mtime: undefined }, // 시각을 모르면 남긴다
    { name: 'records.json', mtime: old },
    { name: 'rec_1.m4a', mtime: old },
  ];
  expect(orphanClipNames(files, [rec('a', [photo('app:clip_1.jpg')])], new Set(['app:clip_4.jpg']), now)).toEqual(['clip_2.jpg']);
});

test('clip 미리보기 표시: 쓰는 동안만 inUse에 있다', () => {
  holdClipRefs(['app:clip_7.jpg', 'txt:1']);
  expect(clipRefsInUse().has('app:clip_7.jpg')).toBe(true);
  holdClipRefs([]);
  expect(clipRefsInUse().size).toBe(0);
});

test('releaseUnused: 메모는 건너뛰고, 다른 일정이 쓰는 사진은 남긴다', () => {
  const m = makeTextAttachment('메모');
  const clip = photo('app:clip_1.jpg');
  const shared = photo('content://shared');
  releaseUnused([m, clip, shared], [rec('2', [shared])]);
  expect(mockNative.release.mock.calls.map((c) => c[0])).toEqual(['app:clip_1.jpg']);
  expect(unusedRefs([clip], [rec('3', [clip])])).toEqual([]);
});

test('saveClipboardImage → 사진 첨부(app:)', async () => {
  const a = await saveClipboardImage(5);
  expect(a).toEqual({ ref: 'app:clip_1.jpg', kind: 'photo', name: 'clip_1.jpg', size: 1234, mime: 'image/jpeg', addedAt: 5 });
  expect(mockNative.saveClipboardImage).toHaveBeenCalledWith(1600);
  mockNative.saveClipboardImage.mockResolvedValueOnce(null as any);
  await expect(saveClipboardImage()).resolves.toBeNull();
  mockNative.saveClipboardImage.mockResolvedValueOnce({ ref: 'app:../x', name: 'x', size: 1, mime: null } as any);
  await expect(saveClipboardImage()).resolves.toBeNull();
});

test('recognizeText: 결과 정리(ok·empty·notReady·failed)', async () => {
  const p = photo('ph:1');
  await expect(recognizeText(p, 'ko')).resolves.toEqual({ status: 'ok', text: '12월 3일' });
  expect(mockNative.recognizeText).toHaveBeenCalledWith('ph:1', 'ko');
  mockNative.recognizeText.mockResolvedValueOnce({ status: 'ok', text: '   ' });
  await expect(recognizeText(p, 'ko')).resolves.toEqual({ status: 'empty', text: '' });
  mockNative.recognizeText.mockResolvedValueOnce({ status: 'notReady', text: '' });
  await expect(recognizeText(p, 'ko')).resolves.toEqual({ status: 'notReady', text: '' });
  mockNative.recognizeText.mockRejectedValueOnce(new Error('x'));
  await expect(recognizeText(p, 'ko')).resolves.toEqual({ status: 'failed', text: '' });
  // 사진이 아니면 읽지 않는다
  await expect(recognizeText(makeTextAttachment('x'), 'ko')).resolves.toEqual({ status: 'failed', text: '' });
});
