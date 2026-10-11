// 내보내기 미리보기: 변환 결과를 먼저 보여주고, 그 화면의 버튼으로 공유/복사
import { fireEvent, render } from '@testing-library/react-native';
import type { ScheduleRecord } from '../../lib/storage';

const mockExport = { txt: jest.fn(async () => {}), pdf: jest.fn(async () => {}), copy: jest.fn(async () => {}) };
jest.mock('../../lib/exportUtils', () => {
  const actual = jest.requireActual('../../lib/exportUtils');
  return {
    ...actual,
    exportRecordsTxt: (...a: unknown[]) => mockExport.txt(...(a as [])),
    exportRecordsPdf: (...a: unknown[]) => mockExport.pdf(...(a as [])),
    copyRecords: (...a: unknown[]) => mockExport.copy(...(a as [])),
  };
});

import { ExportPreview } from '../ExportPreview';

const records: ScheduleRecord[] = [
  {
    id: 'r1', uri: '', durationSec: 0, transcript: '', content: '치과 예약',
    scheduleAt: new Date(2026, 9, 10, 15).getTime(), scheduleDisplay: '', hasDate: true, hasTime: true, createdAt: 1,
    appends: [{ id: 'a', uri: '', durationSec: 0, transcript: '', content: '보험 카드 챙기기', createdAt: 1 }],
  },
  {
    id: 'r2', uri: '', durationSec: 0, transcript: '', content: '회의',
    scheduleAt: new Date(2026, 9, 17, 9).getTime(), scheduleDisplay: '', hasDate: true, hasTime: true, createdAt: 1,
  },
];

beforeEach(() => jest.clearAllMocks());

describe('ExportPreview', () => {
  test('PDF 미리보기는 문서와 같은 행(일시·내용·추가 메모)을 보여주고, 버튼을 눌러야 내보낸다', async () => {
    const { getByText } = await render(<ExportPreview visible kind="pdf" records={records} onClose={() => {}} />);
    expect(getByText('PDF 미리보기')).toBeTruthy();
    expect(getByText('10월 10일 (토) 오후 3:00')).toBeTruthy();
    expect(getByText('치과 예약')).toBeTruthy();
    expect(getByText('• 보험 카드 챙기기')).toBeTruthy();
    expect(getByText('회의')).toBeTruthy();
    expect(mockExport.pdf).not.toHaveBeenCalled();
    await fireEvent.press(getByText('PDF로 내보내기'));
    expect(mockExport.pdf).toHaveBeenCalledWith(records);
  });

  test('텍스트 미리보기는 변환된 본문을 보여주고 복사/내보내기를 제공한다', async () => {
    const { getByText } = await render(<ExportPreview visible kind="txt" records={records} onClose={() => {}} />);
    expect(getByText('텍스트 미리보기')).toBeTruthy();
    expect(getByText(/치과 예약[\s\S]*\+ 보험 카드 챙기기[\s\S]*회의/)).toBeTruthy();
    await fireEvent.press(getByText('복사'));
    expect(mockExport.copy).toHaveBeenCalledWith(records);
    await fireEvent.press(getByText('텍스트로 내보내기'));
    expect(mockExport.txt).toHaveBeenCalledWith(records);
  });

  test('닫기를 누르면 onClose', async () => {
    const onClose = jest.fn();
    const { getByText } = await render(<ExportPreview visible kind="txt" records={records} onClose={onClose} />);
    await fireEvent.press(getByText('닫기'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('visible이 아니면 본문을 그리지 않는다', async () => {
    const { queryByText } = await render(<ExportPreview visible={false} kind="txt" records={records} onClose={() => {}} />);
    expect(queryByText('텍스트 미리보기')).toBeNull();
    expect(queryByText(/치과 예약/)).toBeNull();
  });

  test('내보내기를 누르면 공유 뒤 미리보기를 닫는다', async () => {
    const onClose = jest.fn();
    const { getByText } = await render(<ExportPreview visible kind="pdf" records={records} onClose={onClose} />);
    await fireEvent.press(getByText('PDF로 내보내기'));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockExport.pdf).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
