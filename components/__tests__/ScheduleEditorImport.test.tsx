// 새 일정 화면: [📋 붙여넣기] → 미리보기 → 저장(원문 메모 함께), 날짜를 못 찾으면 날짜 미정
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), replace: jest.fn() }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 0, playing: false, didJustFinish: false }),
}));
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: { start: jest.fn(), stop: jest.fn(), abort: jest.fn() },
  useSpeechRecognitionEvent: jest.fn(),
}));
jest.mock('../../lib/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    recorderState: { isRecording: false, durationMillis: 0, metering: -20 }, liveText: '', listening: false, fileRecording: true,
    start: jest.fn(), stop: jest.fn(), cancel: jest.fn(),
  }),
}));
const mockClip = { image: false, text: '' };
jest.mock('expo-clipboard', () => ({
  hasImageAsync: jest.fn(async () => mockClip.image),
  getStringAsync: jest.fn(async () => mockClip.text),
  hasUrlAsync: jest.fn(async () => false),
  getUrlAsync: jest.fn(async () => null),
}));

import { ScheduleEditor } from '../ScheduleEditor';

const base = {
  visible: true, record: null, defaultDate: new Date(), markedDays: new Set<string>(),
  onSave: jest.fn(), onAppend: jest.fn(), onClose: jest.fn(),
};
const nextYear = new Date().getFullYear() + 1;

beforeEach(() => { mockClip.image = false; mockClip.text = ''; jest.clearAllMocks(); });

test('복사한 글 → 미리보기 → 저장: 찾은 날짜·시간·내용과 원문 메모가 넘어간다', async () => {
  mockClip.text = `[순천향대병원] ${nextYear}년 12월 3일(목) 14:30 진료 예약`;
  const onSave = jest.fn();
  const view = await render(<ScheduleEditor {...base} onSave={onSave} />);
  await fireEvent.press(view.getByTestId('editor-paste'));
  expect(view.getByTestId('import-preview')).toBeTruthy();
  expect(view.getByText('이 내용으로 저장할까요?')).toBeTruthy();
  await fireEvent.press(view.getByTestId('import-save'));
  const res = onSave.mock.calls[0][0];
  expect(res.date.getFullYear()).toBe(nextYear);
  expect(res.date.getMonth()).toBe(11);
  expect(res.date.getDate()).toBe(3);
  expect([res.date.getHours(), res.date.getMinutes(), res.hasTime]).toEqual([14, 30, true]);
  expect(res.content).toContain('진료 예약');
  expect(res.needsDate).toBeUndefined();
  expect(res.attachments).toHaveLength(1);
  expect(res.attachments[0]).toMatchObject({ kind: 'text', text: mockClip.text });
});

test('날짜를 못 찾으면 안내하고 날짜 미정(needsDate)으로 저장', async () => {
  mockClip.text = '보험증 챙기기';
  const onSave = jest.fn();
  const view = await render(<ScheduleEditor {...base} onSave={onSave} />);
  await fireEvent.press(view.getByTestId('editor-paste'));
  expect(view.getByText('날짜를 못 찾았어요. 날짜 미정으로 저장하고 나중에 정할 수 있어요.')).toBeTruthy();
  await fireEvent.press(view.getByTestId('import-save'));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ content: '보험증 챙기기', needsDate: true, hasTime: false }));
});

test('[고쳐서 저장]은 칸을 채우고, 그 뒤 저장해도 원문 메모가 함께 간다', async () => {
  mockClip.text = `${nextYear}-12-03 오후 2:30 회의`;
  const onSave = jest.fn();
  const view = await render(<ScheduleEditor {...base} onSave={onSave} />);
  await fireEvent.press(view.getByTestId('editor-paste'));
  await fireEvent.press(view.getByTestId('import-edit'));
  expect(view.queryByTestId('import-preview')).toBeNull();
  expect(view.getByDisplayValue('회의')).toBeTruthy();
  await fireEvent.press(view.getByText('저장'));
  const res = onSave.mock.calls[0][0];
  expect([res.date.getMonth(), res.date.getDate(), res.date.getHours(), res.date.getMinutes()]).toEqual([11, 3, 14, 30]);
  expect(res.attachments?.[0]).toMatchObject({ kind: 'text' });
});

test('비어 있으면 "복사한 내용이 없어요", 취소하면 붙일 것을 버린다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onDiscardImport = jest.fn();
  const view = await render(<ScheduleEditor {...base} onDiscardImport={onDiscardImport} />);
  await fireEvent.press(view.getByTestId('editor-paste'));
  expect(alert).toHaveBeenCalledWith('복사한 내용이 없어요');
  mockClip.text = '치과 예약';
  await fireEvent.press(view.getByTestId('editor-paste'));
  await fireEvent.press(view.getAllByText('취소')[1]); // 미리보기의 취소
  expect(onDiscardImport).toHaveBeenCalledWith([expect.objectContaining({ kind: 'text', text: '치과 예약' })]);
  alert.mockRestore();
});

test('내용 추가(＋ 추가) 화면에는 붙여넣기 버튼이 없다 — 있는 일정의 붙여넣기는 일정 화면의 첨부 [＋]에서', async () => {
  const record = { id: 'r1', uri: '', durationSec: 0, transcript: '', content: 'x', scheduleAt: Date.now() + 3_600_000, scheduleDisplay: '', hasDate: true, hasTime: true, createdAt: 1 };
  const view = await render(<ScheduleEditor {...base} record={record} appendMode />);
  expect(view.queryByTestId('editor-paste')).toBeNull();
});

test('겹치는 일정 확인에서 취소(onSave가 false)하면 미리보기 내용이 그대로 남는다', async () => {
  mockClip.text = `${nextYear}년 12월 3일 14:30 진료 예약`;
  const onSave = jest.fn(async () => false);
  const view = await render(<ScheduleEditor {...base} onSave={onSave} />);
  await fireEvent.press(view.getByTestId('editor-paste'));
  await fireEvent.press(view.getByTestId('import-save'));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('import-preview')).toBeTruthy();
  expect(view.getAllByText(/진료 예약/).length).toBeGreaterThan(0);
  // 다시 눌러도 같은 원문 메모가 함께 간다
  onSave.mockImplementation(async () => true);
  await fireEvent.press(view.getByTestId('import-save'));
  expect((onSave.mock.calls[1] as any)[0].attachments?.[0]).toMatchObject({ kind: 'text' });
  expect(view.queryByTestId('import-preview')).toBeNull();
});
