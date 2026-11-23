// 일정 화면(상세+수정 합친 화면): 날짜·알림·내용 팝업의 [완료]/[취소], 되돌리기, 버튼 줄(미루기·?·결과·보내기·내보내기),
// 상태 띠, 첨부 [＋], 뒤로가기, 큰 글씨. 단어 탭·범위 재생은 ScheduleDetail.test.tsx에서 본다.
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { ScheduleRecord } from '../../lib/storage';
import type { EditorResult } from '../ScheduleEditor';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), replace: jest.fn() };
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 3, playing: false, didJustFinish: false }),
  setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock('../../lib/exportUtils', () => ({
  ...jest.requireActual('../../lib/exportUtils'),
  copyRecords: jest.fn(), exportRecordsTxt: jest.fn(), exportRecordsPdf: jest.fn(),
}));
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: { start: jest.fn(), stop: jest.fn(), abort: jest.fn() },
  useSpeechRecognitionEvent: jest.fn(),
}));
jest.mock('../../lib/useVoiceRecorder', () => {
  const voice = {
    recorderState: { isRecording: false, durationMillis: 0, metering: -20 },
    liveText: '',
    listening: false,
    fileRecording: true,
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => ({ uri: 'file:///a.m4a', transcript: '약국 들르기', durationSec: 3, segments: [] })),
    cancel: jest.fn(async () => {}),
  };
  return { useVoiceRecorder: () => voice, __voice: voice };
});
jest.mock('../../lib/attachments', () => ({
  ...jest.requireActual('../../lib/attachments'),
  attachSupported: () => true, thumbnailOf: async () => null, attachmentExists: async () => true,
  pickAttachments: jest.fn(async () => ({ items: [{ ref: 'content://p1', kind: 'photo', name: 'p1.jpg', addedAt: 1 }], hidden: 0, denied: false })),
}));
jest.mock('expo-clipboard', () => ({
  hasImageAsync: jest.fn(async () => false),
  getStringAsync: jest.fn(async () => '강남역 3번 출구'),
  hasUrlAsync: jest.fn(async () => false),
  getUrlAsync: jest.fn(async () => null),
  setStringAsync: jest.fn(),
}));

import { ScheduleDetail, UNDO_MS } from '../ScheduleDetail';
import { ThemeProvider } from '../../lib/theme';
import { copyRecords } from '../../lib/exportUtils';
import { pickAttachments } from '../../lib/attachments';

const mockVoice = jest.requireMock('../../lib/useVoiceRecorder').__voice;

const DAY = 86_400_000;
/** 3일 뒤 오후 3:37(5분 단위가 아닌 분) */
const at = (() => { const d = new Date(Date.now() + 3 * DAY); d.setHours(15, 37, 0, 0); return d.getTime(); })();

const withAudio: ScheduleRecord = {
  id: 'r1', uri: 'file:///rec_r1.m4a', durationSec: 3, transcript: '내일 오후 세시 회의', content: '회의',
  scheduleAt: at, scheduleDisplay: '표시', hasDate: true, hasTime: true,
  alarmMode: 'both', remindBefore: [30], exactAlarm: true, createdAt: 1,
  segments: [
    { segment: '내일', startTimeMillis: 0, endTimeMillis: 500 },
    { segment: '오후', startTimeMillis: 600, endTimeMillis: 1000 },
    { segment: '세시', startTimeMillis: 1100, endTimeMillis: 1600 },
    { segment: '회의', startTimeMillis: 1700, endTimeMillis: 2300 },
  ],
};
const textOnly: ScheduleRecord = {
  id: 't1', uri: '', durationSec: 0, transcript: '', content: '치과 예약\n보험증 챙기기',
  scheduleAt: at, scheduleDisplay: '표시', hasDate: true, hasTime: true,
  alarmMode: 'both', remindBefore: [60, 1440], exactAlarm: false, createdAt: 1,
};

type Props = Partial<React.ComponentProps<typeof ScheduleDetail>>;
const ui = (record: ScheduleRecord, p: Props = {}) => (
  <ScheduleDetail visible record={record} onClose={jest.fn()} onSave={jest.fn(async () => true)} onUndo={jest.fn()} {...p} />
);
const lastRes = (fn: jest.Mock): EditorResult => fn.mock.calls[fn.mock.calls.length - 1][0];
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

beforeEach(() => {
  jest.clearAllMocks();
  mockVoice.liveText = '';
  mockVoice.listening = false;
  mockVoice.recorderState = { isRecording: false, durationMillis: 0, metering: -20 };
});
afterEach(() => jest.restoreAllMocks());

describe('한 화면 구성', () => {
  test('위 막대는 닫기 · 일정 · 🗑, [수정] 버튼과 "＋ 내용 추가" 큰 버튼은 없다', async () => {
    const q = await render(ui(withAudio, { onDelete: jest.fn() }));
    expect(q.getByText('닫기')).toBeTruthy();
    expect(q.getByText('일정')).toBeTruthy();
    expect(q.getByLabelText('일정 삭제')).toBeTruthy();
    expect(q.queryByText('수정')).toBeNull();
    expect(q.queryByText('＋ 내용 추가')).toBeNull();
    expect(q.queryByText('일정이 바뀌었나요?')).toBeNull();
    expect(q.queryByText('🔔 알림 바꾸기 ›')).toBeNull();
  });
  test('날짜 줄·알림 칩·내용 카드(재생·스피커/수화기)·버튼 줄·첨부 [＋]가 한 화면에', async () => {
    const q = await render(ui(withAudio, { onOutcome: jest.fn(), onAttachmentsChange: jest.fn() }));
    expect(q.getByTestId('when-open')).toHaveTextContent(/오후 3:37/);
    expect(q.getByTestId('alarm-mode-chip')).toHaveTextContent('🔔📳 소리 + 진동');
    expect(q.getByTestId('remind-open')).toHaveTextContent('⏰ 30분 전 · 정각 켬 ›');
    expect(q.getByTestId('content-edit')).toBeTruthy();
    expect(q.getByText('▶')).toBeTruthy();
    expect(q.getByText('🔊 스피커')).toBeTruthy();
    expect(q.getByText('📞 수화기')).toBeTruthy();
    expect(q.getByTestId('outcome-moved')).toBeTruthy();
    expect(q.getByTestId('postpone-help')).toBeTruthy();
    expect(q.getByTestId('detail-send')).toBeTruthy();
    expect(q.getByTestId('export-open')).toBeTruthy();
    expect(q.getByTestId('attach-add')).toBeTruthy();
  });
  test('기간 일정은 날짜 줄에 끝나는 날까지 보인다', async () => {
    const q = await render(ui({ ...withAudio, endAt: at + 2 * DAY }));
    expect(q.getByTestId('when-open')).toHaveTextContent(/~/);
  });
  test('미리 알림이 없고 정각도 끄면 알림 칩은 "알림 없음"', async () => {
    const q = await render(ui({ ...withAudio, remindBefore: [], exactAlarm: false }));
    expect(q.getByTestId('remind-open')).toHaveTextContent('⏰ 알림 없음 ›');
  });
});

describe('알림 팝업', () => {
  test('칩을 누르면 팝업(소리·진동·미리 알림·정각·요약)이 열린다', async () => {
    const q = await render(ui(withAudio));
    expect(q.queryByTestId('sheet-alarm')).toBeNull();
    await fireEvent.press(q.getByTestId('remind-open'));
    expect(q.getByTestId('sheet-alarm')).toBeTruthy();
    expect(q.getByTestId('mode-both')).toBeTruthy();
    expect(q.getByTestId('mode-sound')).toBeTruthy();
    expect(q.getByTestId('mode-vibe')).toBeTruthy();
    expect(q.getByLabelText('미리 알림 10분 전')).toBeTruthy();
    expect(q.getByLabelText('정각 알림')).toBeTruthy();
    expect(q.getByTestId('remind-summary')).toHaveTextContent('30분 전에 한 번씩 미리 알려요, 정각에도 울려요');
  });
  test('칩을 바꿔도 [완료]를 눌러야 한 번 저장되고 팝업이 닫힌다 (날짜는 그대로)', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('alarm-mode-chip'));
    await fireEvent.press(q.getByLabelText('미리 알림 하루 전'));
    await fireEvent.press(q.getByLabelText('정각 알림'));
    await fireEvent.press(q.getByTestId('mode-vibe'));
    expect(onSave).not.toHaveBeenCalled();
    await fireEvent.press(q.getByTestId('sheet-alarm-done'));
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    const res = lastRes(onSave);
    expect(res).toMatchObject({ id: 'r1', remindBefore: [30, 1440], exactAlarm: false, alarmMode: 'vibe', keepWhen: true, content: '회의' });
    expect(res.date.getTime()).toBe(at);
    expect(q.queryByTestId('sheet-alarm')).toBeNull();
  });
  test('바꾸고 [취소]하면 저장하지 않는다', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('remind-open'));
    await fireEvent.press(q.getByLabelText('미리 알림 10분 전'));
    await fireEvent.press(q.getByTestId('sheet-alarm-cancel'));
    expect(onSave).not.toHaveBeenCalled();
    expect(q.queryByTestId('sheet-alarm')).toBeNull();
  });
  test('어두운 바깥을 눌러도 취소', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('remind-open'));
    await fireEvent.press(q.getByLabelText('미리 알림 10분 전'));
    await fireEvent.press(q.getByTestId('sheet-alarm-backdrop', { includeHiddenElements: true }));
    expect(onSave).not.toHaveBeenCalled();
    expect(q.queryByTestId('sheet-alarm')).toBeNull();
  });
  test('아무것도 안 바꾸고 [완료]하면 저장하지 않고 닫는다', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('remind-open'));
    await fireEvent.press(q.getByTestId('sheet-alarm-done'));
    expect(onSave).not.toHaveBeenCalled();
    expect(q.queryByTestId('sheet-alarm')).toBeNull();
  });
  test('미리 알림·정각을 모두 끄면 요약이 경고로 바뀐다', async () => {
    const q = await render(ui(withAudio));
    await fireEvent.press(q.getByTestId('remind-open'));
    await fireEvent.press(q.getByLabelText('미리 알림 30분 전'));
    await fireEvent.press(q.getByLabelText('정각 알림'));
    expect(q.getByTestId('remind-summary')).toHaveTextContent('알림 없음 — 울리지 않아요');
  });
  test('지난 일정은 알림 칩 없이 "지난 일정 (알림 없음)" 띠만', async () => {
    const q = await render(ui({ ...withAudio, scheduleAt: Date.now() - 3_600_000 }));
    expect(q.getByTestId('band-past')).toHaveTextContent('지난 일정 (알림 없음)');
    expect(q.queryByTestId('remind-open')).toBeNull();
  });
});

describe('날짜·시간 팝업', () => {
  test('날짜 줄을 누르면 팝업(오늘·내일·모레·날짜 고르기·시분·＋기간)이 열린다', async () => {
    const q = await render(ui(withAudio));
    await fireEvent.press(q.getByTestId('when-open'));
    expect(q.getByTestId('sheet-date')).toBeTruthy();
    const sheet = within(q.getByTestId('sheet-date'));
    for (const k of ['오늘', '내일', '모레', '시간', '＋ 기간 (끝나는 날)']) expect(sheet.getByText(k)).toBeTruthy();
    expect(q.getByTestId('date-pick')).toBeTruthy();
  });
  test('[내일] → [완료]: 그 날짜(원래 시각)로 저장한다', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('when-open'));
    await fireEvent.press(within(q.getByTestId('sheet-date')).getByText('내일'));
    await fireEvent.press(q.getByTestId('sheet-date-done'));
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    const res = lastRes(onSave);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    expect(res.date.toDateString()).toBe(tomorrow.toDateString());
    expect(res.date.getHours()).toBe(15);
    expect(res.date.getMinutes()).toBe(37);
    expect(res).toMatchObject({ id: 'r1', hasTime: true, keepWhen: false, needsDate: false, remindBefore: [30], content: '회의' });
    expect(q.queryByTestId('sheet-date')).toBeNull();
  });
  test('＋기간으로 끝나는 날을 붙여 저장한다', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('when-open'));
    await fireEvent.press(q.getByText('＋ 기간 (끝나는 날)'));
    await fireEvent.press(q.getByTestId('sheet-date-done'));
    await flush();
    const res = lastRes(onSave);
    expect(res.endDate?.toDateString()).toBe(new Date(at + DAY).toDateString());
  });
  test('겹치는 일정 확인에서 취소(onSave가 false)하면 저장되지 않은 것으로 보고 팝업을 그대로 둔다', async () => {
    const onSave = jest.fn(async () => false);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('when-open'));
    await fireEvent.press(within(q.getByTestId('sheet-date')).getByText('모레'));
    await fireEvent.press(q.getByTestId('sheet-date-done'));
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(q.getByTestId('sheet-date')).toBeTruthy();
    expect(q.queryByTestId('undo-bar')).toBeNull();
  });
  test('지난 시각으로 정하면 알람이 울리지 않는다고 묻고, "그대로 저장"을 눌러야 저장된다', async () => {
    const onSave = jest.fn(async () => true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // 내일 0:00 일정 → [오늘]을 누르면 오늘 0:00(이미 지난 시각)
    const midnight = new Date(); midnight.setDate(midnight.getDate() + 1); midnight.setHours(0, 0, 0, 0);
    const past = { ...withAudio, scheduleAt: midnight.getTime() };
    const q = await render(ui(past, { onSave }));
    await fireEvent.press(q.getByTestId('when-open'));
    await fireEvent.press(within(q.getByTestId('sheet-date')).getByText('오늘'));
    await fireEvent.press(q.getByTestId('sheet-date-done'));
    expect(onSave).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toBe('지난 시각이에요');
    await act(async () => { (alert.mock.calls[0][2] as any)[1].onPress(); });
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  test('아무것도 안 바꾸고 [완료]하면 저장하지 않는다', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('when-open'));
    await fireEvent.press(q.getByTestId('sheet-date-done'));
    expect(onSave).not.toHaveBeenCalled();
  });
  test('날짜 안 정한 녹음: "정하기"로 열면 지난 녹음 시각이 아니라 다음 정시가 기본이고, 기본 미리 알림이 붙는다', async () => {
    const onSave = jest.fn(async () => true);
    const recAt = new Date(); recAt.setMinutes(recAt.getMinutes() - 30, 0, 0);
    const nd = { ...withAudio, scheduleAt: recAt.getTime(), needsDate: true, remindBefore: undefined };
    const q = await render(ui(nd, { onSave, defaultRemind: [30] }));
    await fireEvent.press(q.getByTestId('band-needsDate'));
    expect(q.getByTestId('sheet-date')).toBeTruthy();
    await fireEvent.press(q.getByTestId('sheet-date-done'));
    await flush();
    const res = lastRes(onSave);
    expect(res.date.getTime()).toBeGreaterThan(Date.now());
    expect(res.date.getMinutes()).toBe(0);
    expect(res.remindBefore).toEqual([30]);
    expect(res.needsDate).toBe(false);
  });
  test('카드의 "정하기"로 열면(openSheet) 날짜 팝업이 바로 뜨고, 같은 요청으로 다시 열리지 않는다', async () => {
    const nd = { ...withAudio, needsDate: true };
    const q = await render(ui(nd, { openSheet: { kind: 'date', nonce: 7 } }));
    expect(q.getByTestId('sheet-date')).toBeTruthy();
    await fireEvent.press(q.getByTestId('sheet-date-cancel'));
    await q.rerender(ui(nd, { openSheet: { kind: 'date', nonce: 7 } }));
    expect(q.queryByTestId('sheet-date')).toBeNull();
  });
});

describe('내용 팝업', () => {
  test('[✏️ 고치기] → 큰 입력칸(최소 6줄)에 내용 전체, 고치고 [완료]하면 날짜는 그대로 저장(지난 일정도 확인 창 없이)', async () => {
    const onSave = jest.fn(async () => true);
    const alert = jest.spyOn(Alert, 'alert');
    const pastRec = { ...textOnly, scheduleAt: at - 6 * DAY };
    const q = await render(ui(pastRec, { onSave }));
    await fireEvent.press(q.getByTestId('content-edit'));
    const input = q.getByTestId('content-input');
    expect(input.props.value).toBe('치과 예약\n보험증 챙기기');
    expect((StyleSheet.flatten(input.props.style) as { minHeight: number }).minHeight).toBeGreaterThanOrEqual(6 * 24);
    await fireEvent.changeText(input, '치과 예약 끝');
    await fireEvent.press(q.getByTestId('sheet-content-done'));
    await flush();
    expect(alert).not.toHaveBeenCalled();
    const res = lastRes(onSave);
    expect(res).toMatchObject({ content: '치과 예약 끝', keepWhen: true, hasTime: true });
    expect(res.date.getMinutes()).toBe(37);
    expect(res.append).toBeUndefined();
  });
  test('[🎙 ＋ 말로 덧붙이기]는 원래 녹음·내용을 바꾸지 않고 녹음을 새 항목으로 덧붙인다([완료] 한 번에)', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('content-edit'));
    expect(q.getByText('＋ 말로 덧붙이기')).toBeTruthy();
    await fireEvent.press(q.getByTestId('content-mic'));
    expect(mockVoice.start).toHaveBeenCalled();
    expect(q.getByText('■ 완료')).toBeTruthy();
    await fireEvent.press(q.getByTestId('content-mic'));
    expect(q.getByText('덧붙일 내용 · 완료하면 추가돼요')).toBeTruthy();
    await fireEvent.press(q.getByTestId('sheet-content-done'));
    await flush();
    const res = lastRes(onSave);
    expect(res.content).toBe('회의');
    expect(res.capture).toBeUndefined();
    expect(res.append).toEqual(expect.objectContaining({ content: '약국 들르기', uri: 'file:///a.m4a', durationSec: 3 }));
  });
  test('덧붙일 내용을 ✕로 지우면 덧붙이지 않는다(내용도 그대로면 저장하지 않는다)', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('content-edit'));
    await fireEvent.press(q.getByTestId('content-mic'));
    await fireEvent.press(q.getByTestId('content-mic'));
    await fireEvent.press(q.getByLabelText('덧붙일 내용 지우기'));
    await fireEvent.press(q.getByTestId('sheet-content-done'));
    expect(onSave).not.toHaveBeenCalled();
  });
  test('녹음 중에 [완료]를 누르면 먼저 녹음을 마치라고 하고 저장하지 않는다', async () => {
    const onSave = jest.fn(async () => true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('content-edit'));
    await fireEvent.press(q.getByTestId('content-mic'));
    await fireEvent.press(q.getByTestId('sheet-content-done'));
    expect(alert.mock.calls[0][0]).toBe('녹음 중이에요');
    expect(onSave).not.toHaveBeenCalled();
  });
  test('고친 뒤 [취소]·배경을 누르면 먼저 묻고, [계속 고치기]면 남고 [버리기]면 버린다', async () => {
    const onSave = jest.fn(async () => true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const q = await render(ui(textOnly, { onSave }));
    await fireEvent.press(q.getByTestId('content-edit'));
    await fireEvent.changeText(q.getByTestId('content-input'), '바뀐 글');
    await fireEvent.press(q.getByTestId('sheet-content-cancel'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('고친 내용을 버릴까요?');
    expect(q.getByTestId('sheet-content')).toBeTruthy(); // 묻는 동안은 그대로
    await fireEvent.press(q.getByTestId('sheet-content-cancel'));
    const buttons = alert.mock.calls[1][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { buttons.find((b) => b.text === '버리기')!.onPress!(); });
    alert.mockRestore();
    expect(onSave).not.toHaveBeenCalled();
    expect(q.queryByTestId('sheet-content')).toBeNull();
    expect(q.getByText('치과 예약\n보험증 챙기기')).toBeTruthy();
  });
  test('안 고쳤으면 [취소]는 묻지 않고 닫는다', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const q = await render(ui(textOnly));
    await fireEvent.press(q.getByTestId('content-edit'));
    await fireEvent.press(q.getByTestId('sheet-content-cancel'));
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
    expect(q.queryByTestId('sheet-content')).toBeNull();
  });
  test('내용을 다 지우고 [완료]하면 저장하지 않는다', async () => {
    const onSave = jest.fn(async () => true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const q = await render(ui(textOnly, { onSave }));
    await fireEvent.press(q.getByTestId('content-edit'));
    await fireEvent.changeText(q.getByTestId('content-input'), '  ');
    await fireEvent.press(q.getByTestId('sheet-content-done'));
    expect(alert).toHaveBeenCalledWith('내용을 입력해주세요');
    expect(onSave).not.toHaveBeenCalled();
  });
  test('녹음 없는 일정은 내용을 눌러도 바로 고치기가 열린다', async () => {
    const q = await render(ui(textOnly));
    await fireEvent.press(q.getByTestId('content-text'));
    expect(q.getByTestId('sheet-content')).toBeTruthy();
  });
  test('녹음 있는 일정에서 단어를 탭하면 재생만 하고 고치기는 열리지 않는다', async () => {
    const q = await render(ui(withAudio));
    expect(q.queryByTestId('content-text')).toBeNull();
    const flow = q.getByTestId('wordFlow');
    await fireEvent(q.getByTestId('chip-2'), 'layout', { nativeEvent: { layout: { x: 88, y: 0, width: 40, height: 25 } } });
    const evt = (t: number) => ({
      nativeEvent: { pageX: 108, pageY: 12, locationX: 108, locationY: 12, timestamp: t, identifier: 1, touches: [], changedTouches: [] },
      touchHistory: { numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: t,
        touchBank: [{ touchActive: true, startPageX: 108, startPageY: 12, startTimeStamp: 1000, currentPageX: 108, currentPageY: 12, currentTimeStamp: t, previousPageX: 108, previousPageY: 12, previousTimeStamp: t }] },
    });
    await fireEvent(flow, 'responderGrant', evt(1000));
    await fireEvent(flow, 'responderRelease', evt(1050));
    await flush();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(1.1);
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(q.queryByTestId('sheet-content')).toBeNull();
  });
});

describe('되돌리기', () => {
  test('저장 직후 "바꿨어요 · 되돌리기"가 뜨고, 누르면 바꾸기 전 레코드를 넘긴다', async () => {
    const onUndo = jest.fn();
    const q = await render(ui(withAudio, { onUndo }));
    await fireEvent.press(q.getByTestId('remind-open'));
    await fireEvent.press(q.getByLabelText('미리 알림 하루 전'));
    await fireEvent.press(q.getByTestId('sheet-alarm-done'));
    await flush();
    expect(q.getByTestId('undo-bar')).toHaveTextContent(/바꿨어요/);
    await fireEvent.press(q.getByTestId('undo'));
    expect(onUndo).toHaveBeenCalledWith(withAudio);
    expect(q.queryByTestId('undo-bar')).toBeNull();
  });
  test('타이머는 setTimeout 하나(약 4초) — 시간이 지나면 띠가 사라진다', async () => {
    const timers: Array<{ fn: () => void; ms?: number }> = [];
    const real = globalThis.setTimeout;
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === UNDO_MS) { timers.push({ fn, ms }); return 1 as never; }
      return real(fn, ms);
    }) as never);
    const q = await render(ui(textOnly));
    await fireEvent.press(q.getByTestId('content-edit'));
    await fireEvent.changeText(q.getByTestId('content-input'), '새 글');
    await fireEvent.press(q.getByTestId('sheet-content-done'));
    await flush();
    expect(q.getByTestId('undo-bar')).toBeTruthy();
    expect(timers).toHaveLength(1);
    expect(UNDO_MS).toBeGreaterThanOrEqual(3000);
    expect(UNDO_MS).toBeLessThanOrEqual(5000);
    await act(async () => { timers[0].fn(); });
    expect(q.queryByTestId('undo-bar')).toBeNull();
  });
  test('창을 닫으면 띠도 치운다', async () => {
    const q = await render(ui(textOnly));
    await fireEvent.press(q.getByTestId('content-edit'));
    await fireEvent.changeText(q.getByTestId('content-input'), '새 글');
    await fireEvent.press(q.getByTestId('sheet-content-done'));
    await flush();
    expect(q.getByTestId('undo-bar')).toBeTruthy();
    await q.rerender(<ScheduleDetail visible={false} record={textOnly} onClose={jest.fn()} onSave={jest.fn(async () => true)} onUndo={jest.fn()} />);
    await q.rerender(ui(textOnly));
    expect(q.queryByTestId('undo-bar')).toBeNull();
  });
});

describe('버튼 줄', () => {
  test('앞으로의 일정: [↪ 미루기]를 누르면 바뀜(moved)으로 넘긴다', async () => {
    const onOutcome = jest.fn();
    const q = await render(ui(withAudio, { onOutcome }));
    expect(q.queryByText('📝 어떻게 됐나요?')).toBeNull();
    await fireEvent.press(q.getByTestId('outcome-moved'));
    expect(onOutcome).toHaveBeenCalledWith(withAudio, 'moved');
  });
  test('[?]를 누르면 미루기 설명이 뜨고 [알겠어요]로 닫는다', async () => {
    const q = await render(ui(withAudio, { onOutcome: jest.fn() }));
    await fireEvent.press(q.getByTestId('postpone-help'));
    expect(q.getByText('미루기란?')).toBeTruthy();
    expect(q.getByText(/새 날짜로 일정을 다시 만들고/)).toBeTruthy();
    await fireEvent.press(q.getByTestId('postpone-ok'));
    expect(q.queryByTestId('sheet-postpone')).toBeNull();
  });
  test('앞으로의 기간 일정에는 미루기가 없다(날짜를 고쳐 옮긴다)', async () => {
    const q = await render(ui({ ...withAudio, endAt: at + 3 * DAY }, { onOutcome: jest.fn() }));
    expect(q.queryByTestId('outcome-moved')).toBeNull();
    expect(q.queryByTestId('outcome-open')).toBeNull();
  });
  test('지난 일정: [📝 어떻게 됐나요?] → 작은 팝업에서 고르면 부모에게 종류를 넘긴다', async () => {
    const onOutcome = jest.fn();
    const past = { ...withAudio, id: 'p1', scheduleAt: Date.now() - 3_600_000 };
    const q = await render(ui(past, { onOutcome }));
    expect(q.queryByTestId('outcome-moved')).toBeNull();
    await fireEvent.press(q.getByTestId('outcome-open'));
    expect(q.getByText('했으면 그대로 두세요')).toBeTruthy();
    expect(q.getByTestId('outcome-skipped')).toBeTruthy();
    expect(q.getByTestId('outcome-partial')).toBeTruthy();
    await fireEvent.press(q.getByTestId('outcome-moved'));
    expect(onOutcome).toHaveBeenCalledWith(past, 'moved');
    expect(q.queryByTestId('sheet-outcome')).toBeNull();
  });
  test('결과를 표시한 지난 일정은 버튼에 그 결과가 보인다', async () => {
    const past = { ...withAudio, scheduleAt: Date.now() - 3_600_000, outcome: { kind: 'skipped' as const } };
    const q = await render(ui(past, { onOutcome: jest.fn() }));
    expect(q.getByTestId('outcome-open')).toHaveTextContent('📝 못 했어요');
  });
  test('[⋯ 내보내기] → 팝업에서 복사·텍스트·PDF', async () => {
    const q = await render(ui(withAudio));
    await fireEvent.press(q.getByTestId('export-open'));
    expect(q.getByTestId('sheet-export')).toBeTruthy();
    await fireEvent.press(q.getByTestId('export-copy'));
    expect(copyRecords).toHaveBeenCalledWith([withAudio]);
    expect(q.queryByTestId('sheet-export')).toBeNull();
    await fireEvent.press(q.getByTestId('export-open'));
    await fireEvent.press(q.getByTestId('export-pdf'));
    expect(q.queryByTestId('sheet-export')).toBeNull();
    expect(q.getByText('PDF 미리보기', { exact: false })).toBeTruthy();
  });
  test('날짜가 정해진 일정에는 [📤 보내기]가 있고, 누르면 보내기 시트가 열린다', async () => {
    const q = await render(ui(withAudio));
    expect(q.queryByTestId('send-sheet')).toBeNull();
    await fireEvent.press(q.getByTestId('detail-send'));
    expect(q.getByTestId('send-sheet')).toBeTruthy();
    expect(q.getByText('녹음한 목소리는 보내지 않고 글로만 갑니다', { exact: false })).toBeTruthy();
    expect(q.getByText('💬 카톡으로 보내기')).toBeTruthy();
    expect(q.getByText('✉️ 문자로 보내기')).toBeTruthy();
  });
  test('날짜를 안 정한 녹음에는 보내기·미루기가 없다', async () => {
    const q = await render(ui({ ...withAudio, needsDate: true }, { onOutcome: jest.fn() }));
    expect(q.queryByTestId('detail-send')).toBeNull();
    expect(q.queryByTestId('outcome-moved')).toBeNull();
  });
});

describe('상태 띠', () => {
  test('날짜 미정: "정하기" 띠, 알림 칩은 없다', async () => {
    const q = await render(ui({ ...withAudio, needsDate: true }));
    expect(q.getByTestId('band-needsDate')).toHaveTextContent(/정하기/);
    expect(q.queryByTestId('remind-open')).toBeNull();
  });
  test('미룸: 알림이 울리지 않는다는 띠와 다시 잡은 날짜(누르면 그 일정으로)', async () => {
    const onOpenRecord = jest.fn();
    const moved = { ...withAudio, outcome: { kind: 'moved' as const, nextId: 'n1', nextAt: at + 2 * DAY, nextHasTime: true } };
    const q = await render(ui(moved, { onOutcome: jest.fn(), onOpenRecord }));
    expect(q.getByTestId('band-moved')).toHaveTextContent('미뤄서 이 일정은 알림이 울리지 않아요');
    expect(q.queryByTestId('remind-open')).toBeNull();
    await fireEvent.press(q.getByTestId('outcome-next'));
    expect(onOpenRecord).toHaveBeenCalledWith('n1');
  });
  test('결과: 지난 일정의 "못 함" 꼬리표', async () => {
    const q = await render(ui({ ...withAudio, scheduleAt: Date.now() - DAY, outcome: { kind: 'skipped' } }));
    expect(q.getByTestId('band-outcome')).toHaveTextContent('못 함');
  });
  test('받은 일정: 📩 보낸 사람 이름표', async () => {
    const q = await render(ui({ ...withAudio, received: { id: 'o', t: 1, at: 1, from: '아들' } }));
    expect(q.getByTestId('detail-received')).toHaveTextContent('📩 아들');
  });
  test('지난 일정: "지난 일정 (알림 없음)"', async () => {
    const q = await render(ui({ ...withAudio, scheduleAt: Date.now() - DAY }));
    expect(q.getByTestId('band-past')).toBeTruthy();
  });
  test('다시 잡은 일정이면 원래 일정 줄을 누르면 원래 일정으로 간다', async () => {
    const onOpenRecord = jest.fn();
    const q = await render(ui({ ...withAudio, carriedFrom: 'o1' }, { onOpenRecord, origin: { ...withAudio, id: 'o1', scheduleAt: at - 5 * DAY } }));
    await fireEvent.press(q.getByTestId('outcome-origin'));
    expect(onOpenRecord).toHaveBeenCalledWith('o1');
  });
});

describe('첨부', () => {
  test('[＋] → 팝업(사진·파일·붙여넣기) → 사진을 고르면 붙인다', async () => {
    const onAttachmentsChange = jest.fn();
    const q = await render(ui(withAudio, { onAttachmentsChange }));
    await fireEvent.press(q.getByTestId('attach-add'));
    expect(q.getByTestId('sheet-attach')).toBeTruthy();
    expect(q.getByTestId('attach-file')).toBeTruthy();
    await fireEvent.press(q.getByTestId('attach-photo'));
    await flush();
    expect(pickAttachments).toHaveBeenCalledWith('photo', expect.any(Number));
    expect(onAttachmentsChange).toHaveBeenCalledWith(withAudio, [expect.objectContaining({ ref: 'content://p1' })], []);
    expect(q.queryByTestId('sheet-attach')).toBeNull();
  });
  test('[📋 붙여넣기]는 복사한 글을 메모로 붙인다', async () => {
    const onAttachmentsChange = jest.fn();
    const q = await render(ui(withAudio, { onAttachmentsChange }));
    await fireEvent.press(q.getByTestId('attach-add'));
    await fireEvent.press(q.getByTestId('attach-paste'));
    await flush();
    expect(onAttachmentsChange).toHaveBeenCalledWith(withAudio, [expect.objectContaining({ kind: 'text', text: '강남역 3번 출구' })], []);
  });
});

describe('뒤로가기와 큰 글씨', () => {
  test('Android 뒤로가기: 팝업이 있으면 팝업부터 닫고, 그다음에 화면을 닫는다', async () => {
    const onClose = jest.fn();
    const q = await render(ui(withAudio, { onClose }));
    await fireEvent.press(q.getByTestId('remind-open'));
    await fireEvent(q.root!, 'requestClose');
    expect(q.queryByTestId('sheet-alarm')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent(q.root!, 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  test('아주 큰 글씨: 주요 요소가 다 있고, 버튼 줄은 한 줄에 둘씩(두 줄로 내려감), 화면은 스크롤된다', async () => {
    const q = await render(
      <ThemeProvider initial={{ fontScale: 'xlarge' }}>
        {ui(withAudio, { onOutcome: jest.fn(), onAttachmentsChange: jest.fn() })}
      </ThemeProvider>,
    );
    for (const id of ['when-open', 'alarm-mode-chip', 'remind-open', 'content-edit', 'outcome-moved', 'detail-send', 'export-open', 'attach-add', 'detailScroll']) {
      expect(q.getByTestId(id)).toBeTruthy();
    }
    const act1 = StyleSheet.flatten(q.getByTestId('detail-send').props.style) as { flexBasis?: string };
    expect(act1.flexBasis).toBe('40%');
    // 팝업도 안에서 스크롤된다
    await fireEvent.press(q.getByTestId('when-open'));
    expect(q.getByTestId('sheet-date')).toBeTruthy();
    expect(q.getByText('시간')).toBeTruthy();
  });
});

describe('알림 팝업 › 알람 소리', () => {
  afterEach(() => require('../../lib/alarmSounds').setDefaultAlarmSound('default'));

  test('소리 줄 → 소리 고르기(기본+6개) → 고르면 미리듣기 → [완료] 두 번에 한 번 저장', async () => {
    require('../../lib/alarmSounds').setDefaultAlarmSound('digital_beep');
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('remind-open'));
    expect(q.getByTestId('alarm-sound-row')).toHaveTextContent(/기본 \(디지털 비프\) ›/);
    await fireEvent.press(q.getByTestId('alarm-sound-row'));
    expect(q.getByTestId('sheet-sound')).toBeTruthy();
    // 설정이 기본음이 아니므로 기본(따름) + 세이람 기본음 + 6개
    for (const id of ['follow', 'default', 'digital_beep', 'bell_march', 'old_clock', 'marimba', 'gentle_piano', 'music_box']) {
      expect(q.getByTestId(`sound-${id}`)).toBeTruthy();
    }
    expect(q.getByTestId('sound-follow')).toHaveTextContent(/기본 \(설정: 디지털 비프\)/);
    await fireEvent.press(q.getByTestId('sound-old_clock'));
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: expect.stringContaining('snd_old_clock') });
    expect(mockPlayer.play).toHaveBeenCalled();
    // 같은 줄을 다시 누르면 멈춘다
    mockPlayer.pause.mockClear();
    await fireEvent.press(q.getByTestId('sound-old_clock'));
    expect(mockPlayer.pause).toHaveBeenCalled();
    await fireEvent.press(q.getByTestId('sheet-sound-done'));
    expect(q.getByTestId('alarm-sound-row')).toHaveTextContent(/옛날 자명종 ›/);
    expect(onSave).not.toHaveBeenCalled();
    await fireEvent.press(q.getByTestId('sheet-alarm-done'));
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(lastRes(onSave)).toMatchObject({ id: 'r1', alarmSound: 'old_clock', alarmMode: 'both' });
  });

  test('따로 고른 일정을 "기본"으로 되돌리면 null(설정을 따름)로 저장', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui({ ...withAudio, alarmSound: 'marimba' }, { onSave }));
    await fireEvent.press(q.getByTestId('remind-open'));
    expect(q.getByTestId('alarm-sound-row')).toHaveTextContent(/마림바 ›/);
    await fireEvent.press(q.getByTestId('alarm-sound-row'));
    await fireEvent.press(q.getByTestId('sound-follow'));
    await fireEvent.press(q.getByTestId('sheet-sound-done'));
    await fireEvent.press(q.getByTestId('sheet-alarm-done'));
    await flush();
    expect(lastRes(onSave).alarmSound).toBeNull();
  });

  test('소리 고르기를 [취소]하면 그대로, 진동만이면 소리 줄이 꺼진다', async () => {
    const onSave = jest.fn(async () => true);
    const q = await render(ui(withAudio, { onSave }));
    await fireEvent.press(q.getByTestId('remind-open'));
    await fireEvent.press(q.getByTestId('alarm-sound-row'));
    await fireEvent.press(q.getByTestId('sound-marimba'));
    await fireEvent.press(q.getByTestId('sheet-sound-cancel'));
    expect(q.getByTestId('alarm-sound-row')).toHaveTextContent(/기본 \(세이람 기본음\) ›/);
    await fireEvent.press(q.getByTestId('mode-vibe'));
    expect(q.getByTestId('alarm-sound-row').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(q.getByTestId('alarm-sound-row'));
    expect(q.queryByTestId('sheet-sound')).toBeNull();
  });
});
