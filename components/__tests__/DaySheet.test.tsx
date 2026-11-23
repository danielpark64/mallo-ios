// 날짜 시트 아래 버튼: 그날 일정이 있으면 "＋ 다른 일정 추가", 없으면 "＋ 이 날 일정 추가"
import { fireEvent, render } from '@testing-library/react-native';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 0, playing: false, didJustFinish: false }),
}));
import { DaySheet } from '../DaySheet';
import type { ScheduleRecord } from '../../lib/storage';

const day = new Date(2026, 11, 3);
const rec: ScheduleRecord = {
  id: 'd1', uri: '', durationSec: 0, transcript: '', content: '치과',
  scheduleAt: new Date(2026, 11, 3, 15, 0).getTime(), scheduleDisplay: '', hasDate: true, hasTime: true,
  alarmMode: 'both', createdAt: 1,
};
const props = { day, compact: false, onClose: jest.fn(), onOpen: jest.fn(), onAppend: jest.fn(), onFixDate: jest.fn(), onAdd: jest.fn() };

test('일정이 없는 날: "＋ 이 날 일정 추가"', async () => {
  const q = await render(<DaySheet {...props} records={[]} />);
  expect(q.getByTestId('day-add')).toHaveTextContent('＋ 이 날 일정 추가');
});
test('일정이 하나라도 있는 날: "＋ 다른 일정 추가", 누르면 그 날짜로 새 일정', async () => {
  const onAdd = jest.fn();
  const q = await render(<DaySheet {...props} records={[rec]} onAdd={onAdd} />);
  expect(q.getByTestId('day-add')).toHaveTextContent('＋ 다른 일정 추가');
  await fireEvent.press(q.getByTestId('day-add'));
  expect(onAdd).toHaveBeenCalledWith(day);
});
