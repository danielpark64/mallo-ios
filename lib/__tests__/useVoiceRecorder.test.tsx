// useVoiceRecorder: 녹음 파일 모드(Android 13+/iOS)와 인식 전용 모드(Android 12 이하)의 동작 차이
// 주의: jest.mock 팩토리는 파일 맨 위로 끌어올려져 바깥 const를 못 보므로(undefined) 목 객체는 팩토리 안에서 만든다
jest.mock('expo-audio', () => {
  const recorder = {
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(),
    pause: jest.fn(),
    isRecording: true, // 네이티브 녹음기(AVAudioRecorder)의 실제 상태
    stop: jest.fn(async () => {}),
    uri: 'file:///tmp/rec.m4a',
    getStatus: jest.fn(() => ({ isRecording: true, durationMillis: 4200, metering: -20 })),
  };
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    setAudioModeAsync: jest.fn(async () => {}),
    useAudioRecorder: () => recorder,
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

// 저장 직전 빈 녹음 검사 — 기본은 정상 파일
jest.mock('../audioCheck', () => ({ recordedFileIsEmpty: jest.fn(() => false) }));

const audioMock = jest.requireMock('expo-audio');
const mockFileEmpty = jest.requireMock('../audioCheck').recordedFileIsEmpty as jest.Mock;
const sttMock = jest.requireMock('expo-speech-recognition');
const mockRecorder = audioMock.__recorder as { prepareToRecordAsync: jest.Mock; record: jest.Mock; pause: jest.Mock; isRecording: boolean; stop: jest.Mock; uri: string; getStatus: jest.Mock };
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
  mockRecorder.getStatus.mockImplementation(() => ({ isRecording: true, durationMillis: 4200, metering: -20 }));
  mockRecorder.isRecording = true;
  mockFileEmpty.mockReturnValue(false);
  mockStt.stop.mockReset(); // 앞 테스트에서 넣은 'end' 흉내 구현을 지운다
  nowMs = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
});
afterEach(() => jest.restoreAllMocks());

describe('녹음 파일 모드', () => {
  test('준비하는 사이 취소되면 녹음기와 인식을 뒤늦게 켜지 않는다 (화면 없이 마이크만 도는 것 방지)', async () => {
    let release: () => void = () => {};
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
    let started: Promise<void> = Promise.resolve();
    await act(async () => { started = result.current.start(); });
    await act(async () => { await result.current.cancel(); });
    await act(async () => { release(); await started; });
    await wait(150);
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(mockStt.start).not.toHaveBeenCalled();
  });

  test("인식기의 'start' 신호가 와야 listening이 켜지고(화면의 '지금 말씀하세요'), 멈추면 꺼진다", async () => {
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
    await act(async () => { await result.current.start(); });
    expect(result.current.listening).toBe(false); // 아직 준비 중
    await wait(150);
    expect(mockStt.start).toHaveBeenCalledTimes(1);
    await act(async () => { mockHandlers.start({}); });
    expect(result.current.listening).toBe(true);
    await act(async () => { await result.current.stop(); });
    expect(result.current.listening).toBe(false);
  });

  test('녹음기와 음성 인식을 둘 다 시작하고, 멈추면 파일 uri와 녹음기 길이를 돌려준다', async () => {
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
    expect(result.current.fileRecording).toBe(true);
    await act(async () => { await result.current.start(); });
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: true }));
    await wait(150); // startSTT는 60ms 뒤 시작 (말 첫머리가 잘리지 않게 짧게)
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

// ── 2026-10-18 폰: 11월 일정 2건의 녹음이 0.2초에서 끊겨 ▶가 무음이었다 (재발 방지 세 겹) ──
describe('녹음이 중간에 끊기지 않게 (iOS 오디오 세션)', () => {
  const expectSameSession = (opts: any) => {
    // 인식기가 녹음기(expo-audio)와 똑같은 세션을 쓰게 해야 인식 시작 때 세션이 바뀌며 녹음기가 멈추지 않는다
    expect(opts.iosCategory).toEqual({
      category: 'playAndRecord',
      categoryOptions: expect.arrayContaining(['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers']),
      mode: 'default',
    });
    expect(opts.iosCategory.categoryOptions).toHaveLength(3);
  };

  test('① 인식기를 처음 켤 때와 끊겨 다시 켤 때 모두 녹음기와 같은 세션을 넘긴다', async () => {
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
    await act(async () => { await result.current.start(); });
    await wait(150);
    expect(mockStt.start).toHaveBeenCalledTimes(1);
    expectSameSession(mockStt.start.mock.calls[0][0]);
    await act(async () => { mockHandlers.end({}); });
    await wait(300);
    expect(mockStt.start).toHaveBeenCalledTimes(2);
    expectSameSession(mockStt.start.mock.calls[1][0]);
    await act(async () => { await result.current.stop(); });
  });

  test('② (iOS) expo는 녹음 중이라는데 실제 녹음기가 멈췄으면 pause→record로 다시 건다 (최대 3번)', async () => {
    const { Platform } = require('react-native');
    const prevOS = Platform.OS;
    Platform.OS = 'ios';
    try {
      const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
      await act(async () => { await result.current.start(); });
      expect(mockRecorder.record).toHaveBeenCalledTimes(1);
      // 폰에서 본 모양: 상태(getStatus)는 녹음 중, 실제 녹음기만 멈춤
      mockRecorder.isRecording = false;
      await wait(450);
      expect(mockRecorder.pause).toHaveBeenCalled();
      expect(mockRecorder.record.mock.calls.length).toBeGreaterThanOrEqual(2);
      await wait(1500);
      expect(mockRecorder.record.mock.calls.length).toBeLessThanOrEqual(4); // 무한히 다시 켜지 않는다
      await act(async () => { await result.current.stop(); });
    } finally {
      Platform.OS = prevOS;
    }
  });

  test('② 통화 같은 중단(expo가 일시정지로 바꿈) 중에는 건드리지 않는다 — 중단이 끝나면 expo가 이어 녹음', async () => {
    const { Platform } = require('react-native');
    const prevOS = Platform.OS;
    Platform.OS = 'ios';
    try {
      const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
      await act(async () => { await result.current.start(); });
      mockRecorder.isRecording = false;
      mockRecorder.getStatus.mockImplementation(() => ({ isRecording: false, durationMillis: 1000 }));
      await wait(450);
      expect(mockRecorder.pause).not.toHaveBeenCalled();
      expect(mockRecorder.record).toHaveBeenCalledTimes(1);
      await act(async () => { await result.current.stop(); });
    } finally {
      Platform.OS = prevOS;
    }
  });

  test('② Android는 다시 걸기를 하지 않는다', async () => {
    const { Platform } = require('react-native');
    const prevOS = Platform.OS;
    Platform.OS = 'android';
    try {
      const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
      await act(async () => { await result.current.start(); });
      mockRecorder.isRecording = false;
      await wait(450);
      expect(mockRecorder.record).toHaveBeenCalledTimes(1);
      await act(async () => { await result.current.stop(); });
    } finally {
      Platform.OS = prevOS;
    }
  });

  test('③ 멈춘 뒤 파일에 소리가 없으면 uri를 버리고 audioLost로 알린다 (글은 그대로)', async () => {
    mockFileEmpty.mockReturnValue(true);
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
    await act(async () => { await result.current.start(); });
    await wait(150);
    await fireResult('11월 4일 9시 병원');
    nowMs += 6000;
    let res: any;
    await act(async () => { res = await result.current.stop(); });
    expect(res.uri).toBeNull();
    expect(res.audioLost).toBe(true);
    expect(res.transcript).toBe('11월 4일 9시 병원');
  });

  test('정상 녹음이면 uri를 그대로 돌려주고 audioLost는 거짓', async () => {
    const { result } = await renderHook(() => useVoiceRecorder({ fileRecording: true }));
    await act(async () => { await result.current.start(); });
    let res: any;
    await act(async () => { res = await result.current.stop(); });
    expect(res.uri).toBe('file:///tmp/rec.m4a');
    expect(res.audioLost).toBe(false);
  });
});
