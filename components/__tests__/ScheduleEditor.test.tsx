// 편집기: 내용 추가 녹음 중 파형·실시간 글 표시, 키보드가 올라오면 날짜·시간 칸 접기
import { Alert, Keyboard } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ScheduleRecord } from '../../lib/storage';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), replace: jest.fn() }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 0, playing: false, didJustFinish: false }),
}));
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: { start: jest.fn(), stop: jest.fn(), abort: jest.fn() },
  useSpeechRecognitionEvent: jest.fn(),
}));
jest.mock('../../lib/useVoiceRecorder', () => {
  const voice = {
    recorderState: { isRecording: false, durationMillis: 0, metering: -20 },
    liveText: '',
    listening: false,
    fileRecording: true,
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => ({ uri: 'file:///a.m4a', transcript: '약국 들르기', durationSec: 3, segments: [] })),
    cancel: jest.fn(async () => {}),
  };
  return { useVoiceRecorder: () => voice, __voice: voice };
});
const mockVoice = jest.requireMock('../../lib/useVoiceRecorder').__voice;

import { ScheduleEditor } from '../ScheduleEditor';

const record: ScheduleRecord = {
  id: 'r1', uri: '', durationSec: 0, transcript: '치과 예약', content: '치과 예약',
  scheduleAt: Date.now() + 3_600_000, scheduleDisplay: '', hasDate: true, hasTime: true,
  alarmMode: 'both', createdAt: 1,
};
const base = {
  visible: true, record, defaultDate: new Date(), markedDays: new Set<string>(),
  onSave: jest.fn(), onAppend: jest.fn(), onDelete: jest.fn(), onClose: jest.fn(),
};

beforeEach(() => {
  mockVoice.liveText = '';
  mockVoice.listening = false;
  mockVoice.recorderState = { isRecording: false, durationMillis: 0, metering: -20 };
});

describe('내용 추가 녹음', () => {
  test('마이크를 누르면 바로 "준비 중…"이 보이고, 인식이 시작되면 "지금 말씀하세요"와 실시간 글이 입력 칸에 보인다', async () => {
    const view = await render(<ScheduleEditor {...base} appendMode />);
    const input = view.getByPlaceholderText('이어붙일 내용을 말하거나 입력하세요');
    await fireEvent.press(view.getByTestId('editor-mic'));
    expect(mockVoice.start).toHaveBeenCalled();
    expect(view.getByText('준비 중…')).toBeTruthy();

    mockVoice.listening = true;
    mockVoice.liveText = '약국 들르기';
    mockVoice.recorderState = { isRecording: true, durationMillis: 2000, metering: -10 };
    await view.rerender(<ScheduleEditor {...base} appendMode />);
    expect(view.getByText(/지금 말씀하세요 · 0:02/)).toBeTruthy();
    expect(input.props.value).toBe('약국 들르기'); // 멈추기 전에도 글이 보인다
    expect(input.props.editable).toBe(false);

    await fireEvent.press(view.getByTestId('editor-mic'));
    expect(input.props.value).toBe('약국 들르기');
    expect(input.props.editable).toBe(true);
  });
});

describe('새 일정 화면의 마이크', () => {
  test('말한 녹음을 함께 넘겨 메인 녹음으로 저장되게 한다 (글만 저장돼 ▶가 없던 문제)', async () => {
    const onSave = jest.fn();
    const view = await render(<ScheduleEditor {...base} record={null} onSave={onSave} />);
    await fireEvent.press(view.getByTestId('editor-mic'));
    expect(mockVoice.start).toHaveBeenCalled();
    await fireEvent.press(view.getByTestId('editor-mic'));
    await fireEvent.press(view.getByText('저장'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      content: '약국 들르기',
      capture: expect.objectContaining({ uri: 'file:///a.m4a', durationSec: 3, transcript: '약국 들르기' }),
    }));
  });

  test('기존 일정 수정에서는 녹음을 넘기지 않는다 (원래 녹음을 바꾸지 않는다)', async () => {
    const onSave = jest.fn();
    mockVoice.start.mockClear();
    const view = await render(<ScheduleEditor {...base} onSave={onSave} />);
    await fireEvent.press(view.getByTestId('editor-mic'));
    expect(mockVoice.start).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId('editor-mic'));
    await fireEvent.press(view.getByText('저장'));
    expect(onSave.mock.calls[0][0].capture).toBeUndefined();
  });
});

describe('같은 화면에서 다시 녹음', () => {
  const pressAgain = async () => {
    // 확인 창의 '다시 녹음'을 누른 것으로 처리
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => { btns?.[1]?.onPress?.(); });
    return spy;
  };

  test('확인 창을 거쳐 앞 녹음과 그 글을 새 녹음으로 바꾼다 (글과 녹음이 어긋나지 않게)', async () => {
    const onSave = jest.fn();
    const view = await render(<ScheduleEditor {...base} record={null} onSave={onSave} />);
    await fireEvent.press(view.getByTestId('editor-mic'));
    await fireEvent.press(view.getByTestId('editor-mic')); // 첫 녹음: '약국 들르기'
    const spy = await pressAgain();
    mockVoice.stop.mockResolvedValueOnce({ uri: 'file:///b.m4a', transcript: '우유 사기', durationSec: 2, segments: [] });
    await fireEvent.press(view.getByTestId('editor-mic'));
    expect(spy).toHaveBeenCalled();
    await act(async () => {});
    await fireEvent.press(view.getByTestId('editor-mic'));
    spy.mockRestore();
    await fireEvent.press(view.getByText('저장'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      content: '우유 사기',
      capture: expect.objectContaining({ uri: 'file:///b.m4a', transcript: '우유 사기' }),
    }));
  });

  test('다시 한 녹음에서 아무 말도 못 알아들으면 앞 녹음과 글을 되돌린다', async () => {
    const onSave = jest.fn();
    const view = await render(<ScheduleEditor {...base} record={null} onSave={onSave} />);
    await fireEvent.press(view.getByTestId('editor-mic'));
    await fireEvent.press(view.getByTestId('editor-mic'));
    const spy = await pressAgain();
    mockVoice.stop.mockResolvedValueOnce({ uri: 'file:///b.m4a', transcript: '', durationSec: 1, segments: [] });
    await fireEvent.press(view.getByTestId('editor-mic'));
    await act(async () => {});
    await fireEvent.press(view.getByTestId('editor-mic'));
    spy.mockRestore();
    await fireEvent.press(view.getByText('저장'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      content: '약국 들르기',
      capture: expect.objectContaining({ uri: 'file:///a.m4a', transcript: '약국 들르기' }),
    }));
  });

  test('정지가 실패해도 "녹음 중"에 갇히지 않는다', async () => {
    const view = await render(<ScheduleEditor {...base} record={null} />);
    await fireEvent.press(view.getByTestId('editor-mic'));
    mockVoice.stop.mockRejectedValueOnce(new Error('boom'));
    await fireEvent.press(view.getByTestId('editor-mic'));
    expect(view.queryByText('준비 중…')).toBeNull();
    expect(view.getByPlaceholderText('할 일을 입력하세요').props.editable).toBe(true);
  });
});

describe('키보드', () => {
  test('키보드가 올라오면 날짜·시간·알림 칸을 접고 "입력 완료"를 보여준다. 내려가면 다시 편다', async () => {
    const listeners: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((ev: string, fn: () => void) => {
      listeners[ev] = fn;
      return { remove: () => {} };
    }) as never);
    const view = await render(<ScheduleEditor {...base} />);
    expect(view.getByText('시간')).toBeTruthy();
    await act(async () => { (listeners.keyboardWillShow ?? listeners.keyboardDidShow)(); });
    expect(view.queryByText('시간')).toBeNull();
    expect(view.queryByText('알림')).toBeNull();
    expect(view.getByText('입력 완료')).toBeTruthy();
    expect(view.getByDisplayValue('치과 예약')).toBeTruthy();
    await act(async () => { (listeners.keyboardWillHide ?? listeners.keyboardDidHide)(); });
    expect(view.getByText('시간')).toBeTruthy();
    jest.restoreAllMocks();
  });
});
