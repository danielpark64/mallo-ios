// 설정 화면: 달력 기본 보기 토글, 백업/설명서 진입
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));
jest.mock('../../lib/backup', () => ({
  createBackup: jest.fn(), deleteBackup: jest.fn(), listBackups: jest.fn(() => []), restoreBackup: jest.fn(),
  exportBackupToFolderAndroid: jest.fn(), importBackupFromFolderAndroid: jest.fn(),
}));

import { SettingsSheet } from '../SettingsSheet';

const base = { visible: true, records: [], onRestored: () => {}, onClose: () => {} };

describe('SettingsSheet', () => {
  test('버전과 항목이 보이고, 주 보기를 누르면 onCalendarMode("week")', async () => {
    const onMode = jest.fn();
    const { getByText, getByLabelText } = await render(
      <SettingsSheet {...base} calendarMode="month" onCalendarMode={onMode} />
    );
    expect(getByText('1.2.3')).toBeTruthy();
    expect(getByText('백업 · 폰 옮기기')).toBeTruthy();
    expect(getByText('사용설명서')).toBeTruthy();
    await fireEvent.press(getByLabelText('월 보기'));
    expect(onMode).not.toHaveBeenCalled();
    await fireEvent.press(getByLabelText('주 보기'));
    expect(onMode).toHaveBeenCalledWith('week');
  });

  test('사용설명서를 누르면 설명서 화면이 열린다', async () => {
    const { getByLabelText, getByText } = await render(
      <SettingsSheet {...base} calendarMode="month" onCalendarMode={() => {}} />
    );
    await fireEvent.press(getByLabelText('사용설명서'));
    expect(getByText('1. 시작하기')).toBeTruthy();
    expect(getByText('9. 백업과 폰 옮기기')).toBeTruthy();
  });

  test('백업 · 폰 옮기기를 누르면 백업 화면이 열린다', async () => {
    const { getByLabelText, getByText } = await render(
      <SettingsSheet {...base} calendarMode="week" onCalendarMode={() => {}} />
    );
    await fireEvent.press(getByLabelText('백업 · 폰 옮기기'));
    expect(getByText('지금 백업 만들기')).toBeTruthy();
  });
});
