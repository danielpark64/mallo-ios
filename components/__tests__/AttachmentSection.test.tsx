// 첨부 칸: 링크는 http/https만 열고, 붙여넣은 이미지를 뺄 때는 그에 맞는 문구
import { Alert, Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../../lib/attachments', () => ({
  ...jest.requireActual('../../lib/attachments'),
  attachSupported: () => true, thumbnailOf: async () => null, attachmentExists: async () => true,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

import { AttachmentSection } from '../AttachmentSection';
import type { Attachment } from '../../lib/storage';

const link = (url: string): Attachment => ({ ref: `txt:${url}`, kind: 'link', name: url, text: url, addedAt: 0 });

beforeEach(() => jest.clearAllMocks());

test('링크: http/https만 열고 다른 스킴은 열지 않는다', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await render(<AttachmentSection recordId="r" attachments={[link('https://a.com'), link('tel:01012345678'), link('javascript:alert(1)')]} onChange={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('링크 https://a.com'));
  await fireEvent.press(view.getByLabelText('링크 tel:01012345678'));
  await fireEvent.press(view.getByLabelText('링크 javascript:alert(1)'));
  expect(open.mock.calls.map((c) => c[0])).toEqual(['https://a.com']);
  expect(alert).toHaveBeenCalledWith('이 링크를 열 수 없어요');
  open.mockRestore(); alert.mockRestore();
});

test('붙여넣은 이미지를 뺄 때는 "붙여넣은 이미지를 지울까요?", 고른 사진은 원본 안내', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const clip: Attachment = { ref: 'app:clip_1.jpg', kind: 'photo', name: 'clip_1.jpg', addedAt: 0 };
  const pic: Attachment = { ref: 'content://p', kind: 'photo', name: 'p.jpg', addedAt: 1 };
  const view = await render(<AttachmentSection recordId="r" attachments={[clip, pic]} onChange={jest.fn()} />);
  await fireEvent(view.getByLabelText('사진 clip_1.jpg'), 'longPress');
  expect(alert.mock.calls[0][1]).toBe('붙여넣은 이미지를 지울까요?');
  await fireEvent(view.getByLabelText('사진 p.jpg'), 'longPress');
  expect(alert.mock.calls[1][1]).toBe('이 일정에서만 빠지고 원본 사진·파일은 그대로 있어요.');
  alert.mockRestore();
});
