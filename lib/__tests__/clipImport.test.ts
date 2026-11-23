// 복사한 것 붙이기: 클립보드 분류(이미지/URL/글/빈 것)와 메모·링크 첨부 만들기
const mockClip = { image: false, text: '', hasUrl: false, url: null as string | null };
jest.mock('expo-clipboard', () => ({
  hasImageAsync: jest.fn(async () => mockClip.image),
  getStringAsync: jest.fn(async () => mockClip.text),
  hasUrlAsync: jest.fn(async () => mockClip.hasUrl),
  getUrlAsync: jest.fn(async () => mockClip.url),
}));
import * as Clipboard from 'expo-clipboard';
import {
  MAX_MEMO_CHARS, classifyClip, cleanClipText, hasSameMemo, isSingleUrl, makeLinkAttachment, makeTextAttachment, memoTitle, readClipboard,
} from '../clipImport';

beforeEach(() => {
  Object.assign(mockClip, { image: false, text: '', hasUrl: false, url: null });
  jest.clearAllMocks();
});

describe('classifyClip', () => {
  test('이미지가 있으면 이미지(글이 함께 있어도)', () => {
    expect(classifyClip({ hasImage: true, text: '안녕' })).toEqual({ kind: 'image' });
  });
  test('URL 한 줄이면 링크', () => {
    expect(classifyClip({ text: '  https://example.com/a?b=1  ' })).toEqual({ kind: 'link', url: 'https://example.com/a?b=1' });
  });
  test('주소가 섞인 글·여러 줄은 글', () => {
    expect(classifyClip({ text: '여기 보세요 https://example.com' }).kind).toBe('text');
    expect(classifyClip({ text: 'https://a.com\nhttps://b.com' }).kind).toBe('text');
  });
  test('글이 비고 URL만 있으면 링크(iOS 사파리 주소 복사)', () => {
    expect(classifyClip({ text: '', url: 'https://naver.com' })).toEqual({ kind: 'link', url: 'https://naver.com' });
  });
  test('공백·보이지 않는 글자뿐이면 빈 것', () => {
    expect(classifyClip({ text: ' \n​ ' })).toEqual({ kind: 'empty' });
    expect(classifyClip({})).toEqual({ kind: 'empty' });
  });
  test('http가 아닌 주소는 링크로 보지 않는다', () => {
    expect(isSingleUrl('javascript:alert(1)')).toBe(false);
    expect(isSingleUrl('ftp://x.com')).toBe(false);
  });
});

describe('readClipboard — 누를 때만 읽는다', () => {
  test('이미지면 글을 읽지 않는다(iOS 허락 창 최소)', async () => {
    mockClip.image = true; mockClip.text = '무시';
    await expect(readClipboard()).resolves.toEqual({ kind: 'image' });
    expect(Clipboard.getStringAsync).not.toHaveBeenCalled();
  });
  test('allowImage:false면 이미지를 건너뛰고 글로', async () => {
    mockClip.image = true; mockClip.text = '치과';
    await expect(readClipboard({ allowImage: false })).resolves.toEqual({ kind: 'text', text: '치과' });
  });
  test('글이 있으면 URL은 묻지 않는다', async () => {
    mockClip.text = '11/25 오후 2시 치과 예약';
    await expect(readClipboard()).resolves.toEqual({ kind: 'text', text: '11/25 오후 2시 치과 예약' });
    expect(Clipboard.hasUrlAsync).not.toHaveBeenCalled();
  });
  test('글이 비면 URL을 본다', async () => {
    mockClip.hasUrl = true; mockClip.url = 'https://example.com';
    await expect(readClipboard()).resolves.toEqual({ kind: 'link', url: 'https://example.com' });
  });
  test('아무것도 없으면 empty, 읽다 실패해도 empty', async () => {
    await expect(readClipboard()).resolves.toEqual({ kind: 'empty' });
    (Clipboard.hasImageAsync as jest.Mock).mockRejectedValueOnce(new Error('x'));
    (Clipboard.getStringAsync as jest.Mock).mockRejectedValueOnce(new Error('x'));
    await expect(readClipboard()).resolves.toEqual({ kind: 'empty' });
  });
});

describe('메모·링크 첨부', () => {
  test('메모: 글을 담고 첫 줄이 이름, ref는 txt:', () => {
    const a = makeTextAttachment('\r\n  [병원] 예약 안내\r\n12월 3일 14:30\r\n', 1000);
    expect(a.kind).toBe('text');
    expect(a.ref.startsWith('txt:')).toBe(true);
    expect(a.text).toBe('[병원] 예약 안내\n12월 3일 14:30');
    expect(a.name).toBe('[병원] 예약 안내');
    expect(a.addedAt).toBe(1000);
  });
  test('메모는 최대 길이까지만 남긴다', () => {
    expect(makeTextAttachment('가'.repeat(MAX_MEMO_CHARS + 100)).text).toHaveLength(MAX_MEMO_CHARS);
    expect(cleanClipText('a\n\n\n\nb')).toBe('a\n\nb');
  });
  test('링크: 주소는 text, 이름은 호스트', () => {
    const a = makeLinkAttachment('https://m.place.naver.com/hospital/123?x=1');
    expect(a).toMatchObject({ kind: 'link', name: 'm.place.naver.com', text: 'https://m.place.naver.com/hospital/123?x=1' });
  });
  test('같은 글·주소를 두 번 붙이지 않는다', () => {
    const list = [makeTextAttachment('치과 예약'), makeLinkAttachment('https://a.com')];
    expect(hasSameMemo(list, 'text', ' 치과 예약 ')).toBe(true);
    expect(hasSameMemo(list, 'link', 'https://a.com')).toBe(true);
    expect(hasSameMemo(list, 'text', '다른 글')).toBe(false);
    expect(hasSameMemo(undefined, 'text', '치과')).toBe(false);
  });
  test('이름은 길면 줄인다', () => {
    expect(memoTitle('가'.repeat(60))).toHaveLength(40);
  });
});
