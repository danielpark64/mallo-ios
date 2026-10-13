import type React from 'react';
// 카드 재생 버튼: 재생 종료 시 ▶ 복귀, 종료 직후 재생 시 stale 상태로 오판하지 않기
import { fireEvent, render } from '@testing-library/react-native';
import type { ScheduleRecord } from '../../lib/storage';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), replace: jest.fn() };
let mockStatus = { currentTime: 0, duration: 10, playing: false, didJustFinish: false };

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));

import { ScheduleCard } from '../ScheduleCard';
import { ThemeProvider } from '../../lib/theme';
import { SharedPlayerProvider } from '../../lib/sharedPlayer';

const item: ScheduleRecord = {
  id: 'r1', uri: 'file:///rec_r1.m4a', durationSec: 10, transcript: '내일 회의', content: '회의',
  scheduleAt: Date.now() + 3_600_000, scheduleDisplay: '', hasDate: true, hasTime: true,
  alarmMode: 'both', createdAt: 1,
};

// 카드는 앱 전체 공용 플레이어(SharedPlayerProvider)를 쓴다 — 카드마다 플레이어를 만들지 않는다
const wrap = (ui: React.ReactElement) => <SharedPlayerProvider>{ui}</SharedPlayerProvider>;
const renderCard = () =>
  render(wrap(<ScheduleCard item={item} onPress={() => {}} onAppend={() => {}} />));

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = { currentTime: 0, duration: 10, playing: false, didJustFinish: false };
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
});
afterEach(() => jest.restoreAllMocks());

describe('ScheduleCard 재생', () => {
  test('카드를 길게 누르면 onLongPress가 그 일정으로 불린다 (수정·삭제 메뉴 진입)', async () => {
    const onLongPress = jest.fn();
    const { getByText } = await render(wrap(<ScheduleCard item={item} onPress={() => {}} onAppend={() => {}} onLongPress={onLongPress} />));
    await fireEvent(getByText('회의'), 'longPress');
    expect(onLongPress).toHaveBeenCalledWith(item);
  });

  test('▶ 누르면 파일을 올려 처음부터 재생하고 ⏸로 바뀐다', async () => {
    const { getByText } = await renderCard();
    await fireEvent.press(getByText('▶'));
    expect(mockPlayer.replace).toHaveBeenCalledWith('file:///rec_r1.m4a');
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(getByText('⏸')).toBeTruthy();
  });

  test('재생이 끝나면(didJustFinish) ▶로 돌아온다', async () => {
    const { getByText, rerender } = await renderCard();
    await fireEvent.press(getByText('▶'));
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 2_000);
    mockStatus = { currentTime: 10, duration: 10, playing: false, didJustFinish: true };
    await rerender(wrap(<ScheduleCard item={item} onPress={() => {}} onAppend={() => {}} />));
    expect(getByText('▶')).toBeTruthy();
  });

  test('끝까지 재생한 직후 다시 누르면, 아직 갱신 안 된 "끝 지점" 상태를 보고 즉시 멈추지 않는다', async () => {
    mockStatus = { currentTime: 10, duration: 10, playing: false, didJustFinish: false }; // 직전 재생의 끝
    const { getByText, rerender } = await renderCard();
    await fireEvent.press(getByText('▶'));
    expect(mockPlayer.replace).toHaveBeenCalledWith('file:///rec_r1.m4a');
    // 100ms 뒤 status 이벤트가 아직 이전 값 그대로 와도 300ms 유예 안이면 ⏸ 유지
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 100);
    await rerender(wrap(<ScheduleCard item={item} onPress={() => {}} onAppend={() => {}} />));
    expect(getByText('⏸')).toBeTruthy();
    // 유예가 지나고 실제로 진행 중인 값이 오면 계속 ⏸
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 500);
    mockStatus = { currentTime: 0.4, duration: 10, playing: true, didJustFinish: false };
    await rerender(wrap(<ScheduleCard item={item} onPress={() => {}} onAppend={() => {}} />));
    expect(getByText('⏸')).toBeTruthy();
  });

  test('⏸ 누르면 일시정지, 다시 ▶ 누르면 이어서 재생(처음으로 되감지 않음)', async () => {
    const { getByText, rerender } = await renderCard();
    await fireEvent.press(getByText('▶'));
    mockStatus = { currentTime: 4, duration: 10, playing: true, didJustFinish: false };
    await rerender(wrap(<ScheduleCard item={item} onPress={() => {}} onAppend={() => {}} />));
    await fireEvent.press(getByText('⏸'));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    mockPlayer.seekTo.mockClear();
    await fireEvent.press(getByText('▶'));
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  });

  test('녹음 파일이 없는 일정(수동 입력)은 재생 버튼이 없다', async () => {
    const { queryByText } = await render(
      <ScheduleCard item={{ ...item, uri: '' }} onPress={() => {}} onAppend={() => {}} />
    );
    expect(queryByText('▶')).toBeNull();
  });

  test('날짜 없이 녹음된 일정(needsDate)은 "날짜 미정"과 꼬리표를 보여주고 정하기가 onFixDate를 부른다', async () => {
    const onFix = jest.fn();
    const { getByText, getByLabelText } = await render(
      <ScheduleCard item={{ ...item, needsDate: true, hasTime: false }} onPress={() => {}} onAppend={() => {}} onFixDate={onFix} />
    );
    expect(getByText('날짜 미정')).toBeTruthy();
    expect(getByText('언제인지 아직 안 정했어요')).toBeTruthy();
    await fireEvent.press(getByLabelText('날짜 정하기'));
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });
});

describe('큰 글자(크게·아주 크게)에서는 세로 배치 카드', () => {
  test('아주 크게: 시간 줄·내용·듣기/추가 버튼이 세로로 놓이고, 보통에서는 가로 배치', async () => {
    const onAppend = jest.fn();
    const big = await render(
      wrap(<ThemeProvider initial={{ fontScale: 'xlarge' }}>
        <ScheduleCard item={item} onPress={() => {}} onAppend={onAppend} />
      </ThemeProvider>),
    );
    expect(big.getByTestId('card-stacked')).toBeTruthy();
    expect(big.getByText('▶ 듣기')).toBeTruthy();
    await fireEvent.press(big.getByText('＋ 추가'));
    expect(onAppend).toHaveBeenCalledWith(item);
    await fireEvent.press(big.getByText('▶ 듣기'));
    expect(mockPlayer.play).toHaveBeenCalled();

    const normal = await render(
      wrap(<ThemeProvider initial={{ fontScale: 'medium' }}>
        <ScheduleCard item={item} onPress={() => {}} onAppend={() => {}} />
      </ThemeProvider>),
    );
    expect(normal.queryByTestId('card-stacked')).toBeNull();
    expect(normal.queryByText('▶ 듣기')).toBeNull();
  });
});

describe('날짜 미정·시간 미정 카드', () => {
  test('오늘 날짜 미정 카드는 흐리게(지난 일정처럼) 보이지 않고 알람 배지도 없다', async () => {
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const rec = { ...item, scheduleAt: today0.getTime(), hasTime: false, needsDate: true };
    jest.spyOn(Date, 'now').mockReturnValue(today0.getTime() + 5 * 3_600_000);
    const { queryByText, getByText } = await render(wrap(<ScheduleCard item={rec} onPress={() => {}} onAppend={() => {}} />));
    expect(getByText('날짜 미정')).toBeTruthy();
    expect(queryByText('🔔')).toBeNull();
  });
});
