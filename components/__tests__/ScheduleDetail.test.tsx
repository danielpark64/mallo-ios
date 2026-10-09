// 상세 화면 단어 구간재생: 단어 탭 → 그 구간만 재생하고 끝에서 정지, 범위선택
import { fireEvent, render } from '@testing-library/react-native';
import type { ScheduleRecord } from '../../lib/storage';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
let mockStatus = { currentTime: 0, duration: 3, playing: false, didJustFinish: false };

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock('../../lib/exportUtils', () => ({
  copyRecords: jest.fn(), exportRecordsTxt: jest.fn(), exportRecordsPdf: jest.fn(),
}));

import { ScheduleDetail } from '../ScheduleDetail';

const record: ScheduleRecord = {
  id: 'r1', uri: 'file:///rec_r1.m4a', durationSec: 3, transcript: '내일 오후 세시 회의', content: '회의',
  scheduleAt: Date.now() + 3_600_000, scheduleDisplay: '', hasDate: true, hasTime: true,
  alarmMode: 'both', createdAt: 1,
  segments: [
    { segment: '내일', startTimeMillis: 0,    endTimeMillis: 500 },
    { segment: '오후', startTimeMillis: 600,  endTimeMillis: 1000 },
    { segment: '세시', startTimeMillis: 1100, endTimeMillis: 1600 },
    { segment: '회의', startTimeMillis: 1700, endTimeMillis: 2300 },
  ],
};

const ui = () => (
  <ScheduleDetail visible record={record} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} />
);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = { currentTime: 0, duration: 3, playing: false, didJustFinish: false };
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
});
afterEach(() => jest.restoreAllMocks());

describe('ScheduleDetail 구간재생', () => {
  test('단어를 누르면 그 단어 시작점으로 이동해 재생한다', async () => {
    const { getByText } = await render(ui());
    await fireEvent.press(getByText('세시'));
    await flush();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(1.1);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });

  test('단어 끝 시각에 도달하면 자동으로 정지한다', async () => {
    const { getByText, rerender } = await render(ui());
    await fireEvent.press(getByText('세시'));
    await flush();
    // 진행 중(끝 전): 정지 안 함
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 400);
    mockStatus = { currentTime: 1.3, duration: 3, playing: true, didJustFinish: false };
    await rerender(ui());
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    // 끝(1.6s) 도달
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 700);
    mockStatus = { currentTime: 1.62, duration: 3, playing: true, didJustFinish: false };
    await rerender(ui());
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(getByText('▶')).toBeTruthy();
  });

  test('재생 중인 단어가 하이라이트된다', async () => {
    const { getByText, rerender } = await render(ui());
    await fireEvent.press(getByText('내일'));
    await flush();
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 400);
    mockStatus = { currentTime: 0.3, duration: 3, playing: true, didJustFinish: false };
    await rerender(ui());
    const playingStyle = getByText('내일').props.style;
    const idleStyle = getByText('회의').props.style;
    expect(JSON.stringify(playingStyle)).toContain('"fontWeight":"700"');
    expect(JSON.stringify(idleStyle)).not.toContain('"fontWeight":"700"');
  });

  test('길게 누른 뒤 다른 단어를 누르면 두 단어 사이 범위를 재생하고 범위 끝에서 정지한다', async () => {
    const { getByText, rerender } = await render(ui());
    await fireEvent(getByText('오후'), 'longPress');
    await fireEvent.press(getByText('회의'));
    await flush();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0.6); // 오후 시작
    // 중간 단어(세시) 구간 지나는 중엔 정지하지 않음
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 400);
    mockStatus = { currentTime: 1.3, duration: 3, playing: true, didJustFinish: false };
    await rerender(ui());
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    // 범위 끝(회의 끝 2.3s) 도달 → 정지
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 900);
    mockStatus = { currentTime: 2.31, duration: 3, playing: true, didJustFinish: false };
    await rerender(ui());
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });
});
