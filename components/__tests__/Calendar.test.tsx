// 달력이 바깥 selectedDate 변경을 따라가는지
import { fireEvent, render } from '@testing-library/react-native';
import { Calendar } from '../Calendar';

const noop = () => {};
const marks = new Set<string>();

describe('Calendar', () => {
  test('처음엔 selectedDate의 달을 보여준다', async () => {
    const { getByText } = await render(
      <Calendar selectedDate={new Date(2026, 5, 6)} onSelectDate={noop} markedDays={marks} />
    );
    expect(getByText('2026년 6월')).toBeTruthy();
  });

  test('바깥에서 selectedDate가 다른 달로 바뀌면 달력도 그 달로 이동한다', async () => {
    const { getByText, rerender } = await render(
      <Calendar selectedDate={new Date(2026, 5, 6)} onSelectDate={noop} markedDays={marks} />
    );
    await rerender(<Calendar selectedDate={new Date(2026, 8, 15)} onSelectDate={noop} markedDays={marks} />);
    expect(getByText('2026년 9월')).toBeTruthy();
  });

  test('사용자가 직접 넘긴 달은 selectedDate가 그대로면 유지된다', async () => {
    const selected = new Date(2026, 5, 6);
    const { getByText, rerender } = await render(
      <Calendar selectedDate={selected} onSelectDate={noop} markedDays={marks} />
    );
    await fireEvent.press(getByText('›'));
    expect(getByText('2026년 7월')).toBeTruthy();
    // 부모가 다른 이유로 리렌더돼도(같은 selectedDate 객체) 7월 그대로
    await rerender(<Calendar selectedDate={selected} onSelectDate={noop} markedDays={marks} />);
    expect(getByText('2026년 7월')).toBeTruthy();
  });

  test('날짜를 누르면 onSelectDate가 그 날짜로 호출된다', async () => {
    const onSelect = jest.fn();
    const { getByText } = await render(
      <Calendar selectedDate={new Date(2026, 5, 6)} onSelectDate={onSelect} markedDays={marks} />
    );
    await fireEvent.press(getByText('20'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const d: Date = onSelect.mock.calls[0][0];
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 20]);
  });
});
