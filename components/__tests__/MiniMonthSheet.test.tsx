// 일정 탭 날짜 머리 📅 → 작은 점 달력: 일정 있는 날 점, 날짜를 누르면 그 날로(onPick), 달 넘기기
import { fireEvent, render } from '@testing-library/react-native';
import { MiniMonthSheet } from '../MiniMonthSheet';

test('그 달을 보여 주고, 일정 있는 날에 점, 누른 날을 돌려준다', async () => {
  const onPick = jest.fn();
  const marked = new Set(['2026-10-21', '2026-10-28']);
  const { getByTestId, getAllByTestId, getByText } = await render(
    <MiniMonthSheet visible selected={new Date(2026, 9, 20)} markedDays={marked} onPick={onPick} onClose={() => {}} />,
  );
  expect(getAllByTestId('mini-dot')).toHaveLength(2);
  await fireEvent.press(getByTestId('mini-day-28'));
  expect(onPick.mock.calls[0][0]).toEqual(new Date(2026, 9, 28));
  await fireEvent.press(getByText('›'));
  expect(() => getAllByTestId('mini-dot')).toThrow(); // 11월엔 점 없음
});
