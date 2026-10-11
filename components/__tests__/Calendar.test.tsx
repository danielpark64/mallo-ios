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

describe('Calendar 주 보기 / 모드 토글 / 보이는 기간', () => {
  const sel = new Date(2026, 9, 14); // 2026-10-14 수

  test('주 보기는 그 주(일~토) 7일만 보여주고 라벨은 "10월 11일 – 17일"', async () => {
    const { getByText, queryByText } = await render(
      <Calendar selectedDate={sel} onSelectDate={noop} markedDays={marks} mode="week" onModeChange={noop} />
    );
    expect(getByText('10월 11일 – 17일')).toBeTruthy();
    for (const d of [11, 12, 13, 14, 15, 16, 17]) expect(getByText(String(d))).toBeTruthy();
    expect(queryByText('10')).toBeNull();
    expect(queryByText('18')).toBeNull();
  });

  test('주 보기에서 › 는 한 주 뒤로, 달이 바뀌면 양쪽 달을 표기', async () => {
    const { getByText } = await render(
      <Calendar selectedDate={new Date(2026, 9, 28)} onSelectDate={noop} markedDays={marks} mode="week" onModeChange={noop} />
    );
    expect(getByText('10월 25일 – 31일')).toBeTruthy();
    await fireEvent.press(getByText('›'));
    expect(getByText('11월 1일 – 7일')).toBeTruthy();
    await fireEvent.press(getByText('‹'));
    await fireEvent.press(getByText('‹'));
    expect(getByText('10월 18일 – 24일')).toBeTruthy();
  });

  test('월/주 토글을 누르면 onModeChange가 호출된다 (같은 모드는 무시)', async () => {
    const onMode = jest.fn();
    const { getByLabelText } = await render(
      <Calendar selectedDate={sel} onSelectDate={noop} markedDays={marks} mode="month" onModeChange={onMode} />
    );
    await fireEvent.press(getByLabelText('월 보기'));
    expect(onMode).not.toHaveBeenCalled();
    await fireEvent.press(getByLabelText('주 보기'));
    expect(onMode).toHaveBeenCalledWith('week');
  });

  test('onModeChange가 없으면 토글이 보이지 않는다', async () => {
    const { queryByLabelText } = await render(<Calendar selectedDate={sel} onSelectDate={noop} markedDays={marks} />);
    expect(queryByLabelText('주 보기')).toBeNull();
  });

  test('보이는 기간을 알려준다: 월은 1일~말일, 주는 일~토, 이동하면 다시 알려준다', async () => {
    const onRange = jest.fn();
    const { getByText, rerender } = await render(
      <Calendar selectedDate={sel} onSelectDate={noop} markedDays={marks} mode="month" onModeChange={noop} onVisibleRangeChange={onRange} />
    );
    expect(onRange).toHaveBeenCalledTimes(1);
    let r = onRange.mock.calls[0][0];
    expect([r.start.getDate(), r.end.getDate(), r.end.getMonth()]).toEqual([1, 31, 9]);
    await fireEvent.press(getByText('›'));
    r = onRange.mock.calls[onRange.mock.calls.length - 1][0];
    expect([r.start.getMonth(), r.end.getDate()]).toEqual([10, 30]);
    // 11월을 보던 중 주 보기로 → 선택 날짜(10월)가 보던 달 밖이므로 보던 달(11월)의 첫 주
    await rerender(
      <Calendar selectedDate={sel} onSelectDate={noop} markedDays={marks} mode="week" onModeChange={noop} onVisibleRangeChange={onRange} />
    );
    r = onRange.mock.calls[onRange.mock.calls.length - 1][0];
    expect([r.start.getMonth(), r.start.getDate(), r.end.getDate()]).toEqual([10, 1, 7]);
    // 다시 월 보기로 → 보던 주의 달(11월) 유지
    await rerender(
      <Calendar selectedDate={sel} onSelectDate={noop} markedDays={marks} mode="month" onModeChange={noop} onVisibleRangeChange={onRange} />
    );
    r = onRange.mock.calls[onRange.mock.calls.length - 1][0];
    expect([r.start.getMonth(), r.start.getDate(), r.end.getDate()]).toEqual([10, 1, 30]);
  });

  test('라벨을 누르면 오늘로 이동하며 onSelectDate(오늘)을 호출', async () => {
    const onSelect = jest.fn();
    const { getByText } = await render(
      <Calendar selectedDate={new Date(2020, 0, 1)} onSelectDate={onSelect} markedDays={marks} mode="week" onModeChange={noop} />
    );
    expect(getByText('오늘로')).toBeTruthy();
    await fireEvent.press(getByText('오늘로'));
    const d: Date = onSelect.mock.calls[0][0];
    const t = new Date();
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([t.getFullYear(), t.getMonth(), t.getDate()]);
  });
});
