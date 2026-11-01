import { lunarCellText, lunarShortText } from '../calendarKit/lunar';

describe('달력 칸 음력', () => {
  it('음력 초하루는 "월.1", 나머지는 일만', () => {
    // 2026-11-09 = 음력 10.1, 2026-11-18 = 음력 10.10
    expect(lunarShortText(new Date(2026, 10, 9))).toBe('10.1');
    expect(lunarCellText(new Date(2026, 10, 9))).toBe('10.1');
    expect(lunarShortText(new Date(2026, 10, 18))).toBe('10.10');
    expect(lunarCellText(new Date(2026, 10, 18))).toBe('10');
    expect(lunarCellText(new Date(2026, 10, 1))).toBe('22');
  });
  it('범위 밖은 빈 글자', () => {
    expect(lunarCellText(new Date(2100, 0, 1))).toBe('');
  });
});
