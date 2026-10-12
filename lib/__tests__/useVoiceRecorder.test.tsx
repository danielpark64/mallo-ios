// useVoiceRecorder: 녹음 파일 모드(Android 13+/iOS)와 인식 전용 모드(Android 12 이하)의 동작 차이
// 주의: jest.mock 팩토리는 파일 맨 위로 끌어올려져 바깥 const를 못 보므로(undefined) 목 객체는 팩토리 안에서 만든다
jest.mock('expo-audio', () => {
  const recorder = {
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(),
    stop: jest.fn(async () => {}),
    uri: 'file:///tmp/rec.m4a',
  };
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    setAudioModeAsync: jest.fn(async () => {}),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => ({ isRecording: true, durationMillis: 4200, metering: -20 }),
    __recorder: recorder,
  };
});
jest.mock('expo-speech-recognition', () => {
  const handlers: Record<string, (e: any) => void> = {};
  return {
    ExpoSpeechRecognitionModule: { start: jest.fn(), stop: jest.fn(), abort: jest.fn() },
    useSpeechRecognitionEvent: (name: string, fn: (e: any) => void) => { handlers[name] = fn; },
    __handlers: handlers,
  };
});

const audioMock = jest.requireMock('expo-audio');
const sttMock = jest.requireMock('expo-speech-recognition');
const mockRecorder = audioMock.__recorder as { prepareToRecordAsync: jest.Mock; record: jest.Mock; stop: jest.Mock; uri: string };
const mockSetAudioMode = audioMock.setAudioModeAsync as jest.Mock;
const mockStt = sttMock.ExpoSpeechRecognitionModule as { start: jest.Mock; stop: jest.Mock; abort: jest.Mock };
const mockHandlers = sttMock.__handlers as Record<string, (e: any) => void>;

import { act, renderHook } from '@testing-library/react-native';
import { useVoiceRecorder } from '../useVoiceRecorder';

// 이 환경(jest-expo + RNTL 14)에서는 가짜 타이머를 켜면 act 안의 상태 갱신이 반영되지 않아 실제 타이머를 쓴다.
// 시간 흐름은 Date.now 스파이로 흉내 낸다 (훅의 길이 계산이 Date.now 기준).
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const fireResult = (transcript: string) =>
  act(async () => { mockHandlers.result({ results: [{ transcript, segments: [] }] }); });
let nowMs = 1_000_000;
beforeEach(() => {
  jest.clearAllMocks();
  mockStt.stop.mockReset(); // 앞 테스트에서 넣은 'end' 흉내 구현을 지운다
  nowMs = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
});
afterEach(() => jest.restoreAllMocks());

describe('녹음 파일 모드', () => {
  test('녹음기와 음성 인식을 둘 다 시작하고, 멈추면 파일 uri와 녹음기 길이를 돌려준다', async () => {
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
    expect(result.current.fileRecording).toBe(true);
    await act(async () => { await result.current.start(); });
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: true }));
    await wait(400); // startSTT는 300ms 뒤 시작
    expect(mockStt.start).toHaveBeenCalledWith(expect.objectContaining({ lang: 'ko-KR', continuous: true }));
    await fireResult('내일 오후 세 시 치과');
    expect(result.current.liveText).toBe('내일 오후 세 시 치과');
    expect(result.current.recorderState).toMatchObject({ isRecording: true, durationMillis: 4200, metering: -20 });
    let res: any;
    await act(async () => { res = await result.current.stop(); });
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ uri: 'file:///tmp/rec.m4a', transcript: '내일 오후 세 시 치과', durationSec: 4 });
  });
});

describe('인식 전용 모드 (Android 12 이하)', () => {
  test('녹음기는 건드리지 않고 음성 인식만 돌리며, 타이머가 흐르고, 멈추면 uri 없이 글만 돌려준다', async () => {
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: false }));
    expect(result.current.fileRecording).toBe(false);
    await act(async () => { await result.current.start(); });
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(mockSetAudioMode).not.toHaveBeenCalled();
    expect(result.current.recorderState.isRecording).toBe(true);
    nowMs += 3000;
    await wait(400); // STT 시작(300ms) + 타이머 한 틱(250ms)
    expect(mockStt.start).toHaveBeenCalledTimes(1);
    expect(result.current.recorderState.durationMillis).toBe(3000);
    await fireResult('우유');
    expect(result.current.liveText).toBe('우유');
    // 정지 직후 도착하는 최종 결과(마지막 단어)는 'end'가 올 때까지 받아들인다
    mockStt.stop.mockImplementation(() => {
      setTimeout(() => mockHandlers.result({ results: [{ transcript: '우유 사기', segments: [] }] }), 30);
      setTimeout(() => mockHandlers.end({}), 60);
    });
    let res: any;
    const t0 = performance.now();
    await act(async () => { res = await result.current.stop(); });
    expect(performance.now() - t0).toBeLessThan(700); // 'end'를 받으면 800ms를 다 기다리지 않는다
    expect(mockStt.stop).toHaveBeenCalledTimes(1);
    expect(mockRecorder.stop).not.toHaveBeenCalled();
    expect(res).toMatchObject({ uri: null, transcript: '우유 사기', durationSec: 3 });
    expect(mockStt.start).toHaveBeenCalledTimes(1); // 'end'가 와도 재시작하지 않는다
    expect(result.current.recorderState).toEqual({ isRecording: false, durationMillis: 0 });
  });

  test("'end'가 안 오면 800ms 뒤 멈추고 그때까지의 글을 돌려준다", async () => {
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: false }));
    await act(async () => { await result.current.start(); });
    await wait(350);
    await fireResult('빵');
    let res: any;
    const t0 = performance.now();
    await act(async () => { res = await result.current.stop(); });
    expect(performance.now() - t0).toBeGreaterThanOrEqual(780);
    expect(res.transcript).toBe('빵');
  });

  test('취소하면 인식을 중단하고 타이머·글을 비운다', async () => {
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: false }));
    await act(async () => { await result.current.start(); });
    await wait(350);
    await fireResult('취소될 말');
    expect(result.current.liveText).toBe('취소될 말');
    await act(async () => { await result.current.cancel(); });
    expect(mockStt.abort).toHaveBeenCalledTimes(1);
    expect(mockRecorder.stop).not.toHaveBeenCalled();
    expect(result.current.liveText).toBe('');
    expect(result.current.recorderState).toEqual({ isRecording: false, durationMillis: 0 });
    nowMs += 1000;
    await wait(300);
    expect(result.current.recorderState.durationMillis).toBe(0); // 타이머가 멈춰 있어야 한다
  });
});
