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
  visible: true, record, defaultDate: new Date(Date.now() + 86_400_000), markedDays: new Set<string>(),
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

  test('기존 일정 수정 화면의 마이크는 원래 녹음·내용을 바꾸지 않고, 녹음을 새 항목으로 덧붙인다(저장 한 번에 함께)', async () => {
    const onSave = jest.fn();
    mockVoice.start.mockClear();
    const view = await render(<ScheduleEditor {...base} onSave={onSave} />);
    expect(view.getByText('＋ 말로 덧붙이기')).toBeTruthy();
    await fireEvent.press(view.getByTestId('editor-mic'));
    expect(mockVoice.start).toHaveBeenCalled();
    await fireEvent.press(view.getByTestId('editor-mic'));
    expect(view.getByText('덧붙일 내용 · 저장하면 추가돼요')).toBeTruthy();
    await fireEvent.press(view.getByText('저장'));
    const res = onSave.mock.calls[0][0];
    expect(res.content).toBe('치과 예약'); // 메인 내용은 그대로
    expect(res.capture).toBeUndefined();
    expect(res.append).toEqual(expect.objectContaining({ content: '약국 들르기', uri: 'file:///a.m4a', durationSec: 3 }));
  });

  test('덧붙일 내용을 ✕로 지우면 저장 때 덧붙이지 않는다', async () => {
    const onSave = jest.fn();
    const view = await render(<ScheduleEditor {...base} onSave={onSave} />);
    await fireEvent.press(view.getByTestId('editor-mic'));
    await fireEvent.press(view.getByTestId('editor-mic'));
    await fireEvent.press(view.getByLabelText('덧붙일 내용 지우기'));
    await fireEvent.press(view.getByText('저장'));
    expect(onSave.mock.calls[0][0].append).toBeUndefined();
  });
});

describe('수정 화면에서 원래 녹음 듣기', () => {
  test('녹음이 있는 일정을 고칠 때 "▶ 녹음 듣기"가 보인다(날짜 없이 녹음한 것을 정할 때 내용 확인용)', async () => {
    const view = await render(<ScheduleEditor {...base} record={{ ...record, uri: 'file:///r1.m4a', needsDate: true }} />);
    expect(view.getByText('▶ 녹음 듣기')).toBeTruthy();
  });
  test('새 일정에는 들을 녹음이 없으니 보이지 않는다', async () => {
    const view = await render(<ScheduleEditor {...base} record={null} />);
    expect(view.queryByText('▶ 녹음 듣기')).toBeNull();
  });
});

describe('지난 시각 저장과 날짜 미정 녹음 정하기', () => {
  test('지난 시각으로 저장하려 하면 알람이 울리지 않는다고 묻고, "그대로 저장"을 눌러야 저장된다', async () => {
    const onSave = jest.fn();
    const spy = jest.spyOn(Alert, 'alert');
    const view = await render(<ScheduleEditor {...base} record={null} defaultDate={new Date(Date.now() - 2 * 86_400_000)} onSave={onSave} />);
    await fireEvent.changeText(view.getByPlaceholderText('할 일을 입력하세요'), '지난 일');
    await fireEvent.press(view.getByText('저장'));
    expect(onSave).not.toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('지난 시각이에요');
    await act(async () => { (spy.mock.calls[0][2] as any)[1].onPress(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('날짜를 안 정한 녹음을 "정하기"로 열면 지난 녹음 시각이 아니라 다음 정시가 기본값이고, 기본 미리 알림이 붙는다', async () => {
    const onSave = jest.fn();
    const recAt = new Date(); recAt.setMinutes(recAt.getMinutes() - 30, 0, 0);
    const view = await render(<ScheduleEditor {...base} defaultRemind={[30]} onSave={onSave}
      record={{ ...record, uri: 'file:///r1.m4a', scheduleAt: recAt.getTime(), hasTime: true, needsDate: true, remindBefore: undefined }} />);
    await fireEvent.press(view.getByText('저장'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const res = onSave.mock.calls[0][0];
    expect(res.date.getTime()).toBeGreaterThan(Date.now());
    expect(res.date.getMinutes()).toBe(0);
    expect(res.remindBefore).toEqual([30]);
  });
});

describe('지난 일정 고치기', () => {
  test('날짜·시간을 건드리지 않고 지난 일정의 내용만 고치면 확인 창 없이 바로 저장된다', async () => {
    const onSave = jest.fn();
    const spy = jest.spyOn(Alert, 'alert');
    const past = new Date(Date.now() - 3 * 86_400_000); past.setHours(15, 37, 0, 0);
    const view = await render(<ScheduleEditor {...base} onSave={onSave} record={{ ...record, scheduleAt: past.getTime(), hasTime: true }} />);
    await fireEvent.changeText(view.getByDisplayValue('치과 예약'), '치과 예약 끝');
    await fireEvent.press(view.getByText('저장'));
    expect(spy).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].date.getMinutes()).toBe(37); // 5분 단위가 아닌 분도 그대로
    spy.mockRestore();
  });
});

describe('말하기 막대', () => {
  test('입력 칸 위에 "눌러서 말하기" 막대가 크게 보이고, 녹음 중에는 같은 자리가 "■ 완료"로 바뀐다', async () => {
    const view = await render(<ScheduleEditor {...base} record={null} />);
    expect(view.getByText('눌러서 말하기')).toBeTruthy();
    await fireEvent.press(view.getByText('눌러서 말하기'));
    expect(view.getByText('■ 완료')).toBeTruthy();
    expect(view.queryByText('눌러서 말하기')).toBeNull();
    await fireEvent.press(view.getByText('■ 완료'));
    expect(view.getByText('눌러서 말하기')).toBeTruthy();
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
