// 내 목소리 알람: 어떤 일정이 목소리로 울리는지(voiceUriOf)와 예약 때 두 플랫폼에 전달되는 것
jest.mock('expo-modules-core', () => {
  const alarm = { schedule: jest.fn(), cancel: jest.fn(), cancelByRecordId: jest.fn(), cancelAll: jest.fn(), setVoice: jest.fn(), clearVoices: jest.fn() };
  const voice = {
    makeSound: jest.fn(async (_src: string, name: string) => `${name}.wav`),
    removeSound: jest.fn(), pruneSounds: jest.fn(), hasSound: jest.fn(() => false),
  };
  return {
    ...jest.requireActual('expo-modules-core'),
    requireOptionalNativeModule: (name: string) => (name === 'MalloAlarm' ? alarm : name === 'MalloVoiceSound' ? voice : null),
    __alarm: alarm, __voice: voice,
  };
});
const core = jest.requireMock('expo-modules-core');
const mockAlarm = core.__alarm as Record<string, jest.Mock>;
const mockVoice = core.__voice as Record<string, jest.Mock>;

import { Platform } from 'react-native';
import { prepareVoiceAlarm, removeVoiceAlarm, resetVoiceAlarms, setVoiceAlarmDefault, voiceAlarmOn, voiceAlarmToStore, voiceUriOf } from '../voiceAlarm';

const setOS = (os: 'ios' | 'android') => { (Platform as { OS: string }).OS = os; };
beforeEach(() => { jest.clearAllMocks(); setVoiceAlarmDefault(false); });

describe('voiceUriOf', () => {
  test('켜져 있고 녹음이 있고 소리 나는 모드일 때만 녹음 경로를 돌려준다', () => {
    expect(voiceUriOf({ uri: 'file:///a.m4a', voiceAlarm: true, alarmMode: 'both' })).toBe('file:///a.m4a');
    expect(voiceUriOf({ uri: 'file:///a.m4a', voiceAlarm: true, alarmMode: 'sound' })).toBe('file:///a.m4a');
    expect(voiceUriOf({ uri: 'file:///a.m4a', voiceAlarm: false })).toBeNull(); // 기본은 기존 알람음
    expect(voiceUriOf({ uri: 'file:///a.m4a' })).toBeNull();
    expect(voiceUriOf({ uri: '', voiceAlarm: true })).toBeNull(); // 녹음 없는 일정
    expect(voiceUriOf({ uri: 'file:///a.m4a', voiceAlarm: true, alarmMode: 'vibe' })).toBeNull(); // 진동 전용
    expect(voiceUriOf(null)).toBeNull();
  });
});

describe('설정과 일정별 선택', () => {
  test('일정에 따로 정한 값이 없으면 설정을 따른다 — 설정을 바꾸면 기존 일정도 함께 바뀐다', () => {
    const old = { uri: 'file:///a.m4a', alarmMode: 'both' }; // 기능이 생기기 전에 만든 일정
    expect(voiceUriOf(old)).toBeNull();
    setVoiceAlarmDefault(true);
    expect(voiceUriOf(old)).toBe('file:///a.m4a');
    expect(voiceAlarmOn(old as { voiceAlarm?: boolean })).toBe(true);
  });
  test('일정마다 칩으로 바꾼 값은 설정보다 우선한다', () => {
    setVoiceAlarmDefault(true);
    expect(voiceUriOf({ uri: 'file:///a.m4a', voiceAlarm: false })).toBeNull();
    setVoiceAlarmDefault(false);
    expect(voiceUriOf({ uri: 'file:///a.m4a', voiceAlarm: true })).toBe('file:///a.m4a');
  });
  test('설정과 같은 선택은 저장하지 않는다(나중에 설정을 따라가게)', () => {
    setVoiceAlarmDefault(true);
    expect(voiceAlarmToStore(true)).toBeUndefined();
    expect(voiceAlarmToStore(false)).toBe(false);
    setVoiceAlarmDefault(false);
    expect(voiceAlarmToStore(false)).toBeUndefined();
    expect(voiceAlarmToStore(true)).toBe(true);
  });
});

describe('Android', () => {
  beforeEach(() => setOS('android'));
  test('네이티브에 일정 id와 파일을 알려 두고, Expo 보조 알림은 기본 소리(null)를 쓴다', async () => {
    expect(await prepareVoiceAlarm('r1', 'file:///a.m4a')).toBeNull();
    expect(mockAlarm.setVoice).toHaveBeenCalledWith('r1', 'file:///a.m4a');
  });
  test('미리 알림(id#preN)도 같은 일정 id로 건다', async () => {
    await prepareVoiceAlarm('r1#pre30', 'file:///a.m4a');
    expect(mockAlarm.setVoice).toHaveBeenCalledWith('r1', 'file:///a.m4a');
  });
  test('꺼진 일정은 이전에 걸어 둔 목소리를 지운다', async () => {
    await prepareVoiceAlarm('r1', null);
    expect(mockAlarm.setVoice).toHaveBeenCalledWith('r1', '');
  });
  test('삭제·전체 재동기화 때 정리한다', () => {
    removeVoiceAlarm('r1');
    expect(mockAlarm.setVoice).toHaveBeenCalledWith('r1', '');
    resetVoiceAlarms(['r2']);
    expect(mockAlarm.clearVoices).toHaveBeenCalled();
  });
});

describe('iOS', () => {
  beforeEach(() => setOS('ios'));
  afterAll(() => setOS('ios'));
  test('녹음을 알림용 소리로 변환하고 그 파일 이름을 돌려준다', async () => {
    expect(await prepareVoiceAlarm('r1', 'file:///a.m4a')).toBe('voice_r1.wav');
    expect(mockVoice.makeSound).toHaveBeenCalledWith('file:///a.m4a', 'voice_r1', 10);
  });
  test('이미 만들어 둔 소리는 다시 만들지 않는다', async () => {
    mockVoice.hasSound.mockReturnValueOnce(true);
    expect(await prepareVoiceAlarm('r1', 'file:///a.m4a')).toBe('voice_r1.wav');
    expect(mockVoice.makeSound).not.toHaveBeenCalled();
  });
  test('변환이 실패하면 기본 알람음으로 떨어진다(null)', async () => {
    mockVoice.makeSound.mockRejectedValueOnce(new Error('x'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await prepareVoiceAlarm('r1', 'file:///a.m4a')).toBeNull();
  });
  test('꺼진 일정은 소리 파일을 지우고, 재동기화 때는 쓰는 것만 남긴다', async () => {
    expect(await prepareVoiceAlarm('r1', null)).toBeNull();
    expect(mockVoice.removeSound).toHaveBeenCalledWith('voice_r1');
    resetVoiceAlarms(['r2', 'r3']);
    expect(mockVoice.pruneSounds).toHaveBeenCalledWith(['voice_r2', 'voice_r3']);
  });
});
