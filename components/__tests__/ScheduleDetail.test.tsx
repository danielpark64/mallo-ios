// 상세 화면 단어 구간재생: 단어 탭 → 그 구간만 재생하고 끝에서 정지,
// 길게 누른 채 끌기 → 범위선택 후 재생, 선택 바(다시 듣기/해제), 선택 중 스크롤 잠금
import type React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ScheduleRecord } from '../../lib/storage';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
let mockStatus = { currentTime: 0, duration: 3, playing: false, didJustFinish: false };

const mockSetAudioMode = jest.fn(async () => {});
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioMode(...(args as [])),
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

// 칩 4개를 한 줄에 가로로 배치한 것으로 가정 (x: 0, 44, 88, 132 / 폭 40 / 높이 25)
const CHIP_X = [0, 44, 88, 132];
const chipCenter = (idx: number) => ({ x: CHIP_X[idx] + 20, y: 12 });

/** PanResponder가 읽는 touchHistory까지 포함한 합성 터치 이벤트 */
let touchStart = { x: 0, y: 0, t: 0 };
let touchPrev = { x: 0, y: 0, t: 0 };
const touchEvt = (x: number, y: number, t: number) => {
  const e = {
    nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y, timestamp: t, identifier: 1, touches: [], changedTouches: [] },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: t,
      touchBank: [{
        touchActive: true,
        startPageX: touchStart.x, startPageY: touchStart.y, startTimeStamp: touchStart.t,
        currentPageX: x, currentPageY: y, currentTimeStamp: t,
        previousPageX: touchPrev.x, previousPageY: touchPrev.y, previousTimeStamp: touchPrev.t,
      }],
    },
  };
  touchPrev = { x, y, t };
  return e;
};

type Q = Awaited<ReturnType<typeof render>>;
/** playFrom은 applyRoute(await) 뒤에 play/setPlaying을 호출하므로 마이크로태스크를 넉넉히 비운다 */
const flushMicro = async () => { await new Promise((r) => setTimeout(r, 0)); };
/** 길게 누르기 판정 타이머를 즉시 실행시킨다 — grant 직전에 호출. (가짜 타이머는 RNTL 14의 비동기 render/act와 충돌) */
const pressImmediately = () =>
  jest.spyOn(globalThis, 'setTimeout').mockImplementationOnce(((fn: () => void) => { fn(); return 0; }) as never);
// RNTL 14의 fireEvent/act는 비동기 — await 없이 부르면 act 범위가 열린 채 다음 테스트로 넘어가 렌더가 빈다.
const layoutChips = async (q: Q) => {
  for (let idx = 0; idx < CHIP_X.length; idx++) {
    await fireEvent(q.getByTestId(`chip-${idx}`), 'layout', { nativeEvent: { layout: { x: CHIP_X[idx], y: 0, width: 40, height: 25 } } });
  }
};
const grantAt = async (q: Q, idx: number, t = 1000) => {
  const { x, y } = chipCenter(idx);
  touchStart = { x, y, t };
  touchPrev = { x, y, t };
  await fireEvent(q.getByTestId('wordFlow'), 'responderGrant', touchEvt(x, y, t));
};
const moveTo = async (q: Q, idx: number, t: number) => {
  const { x, y } = chipCenter(idx);
  await fireEvent(q.getByTestId('wordFlow'), 'responderMove', touchEvt(x, y, t));
};
const release = async (q: Q, t: number) => {
  await fireEvent(q.getByTestId('wordFlow'), 'responderRelease', touchEvt(touchPrev.x, touchPrev.y, t));
};

// fireEvent/rerender는 RNTL이 이미 act로 감싼다 — 바깥에서 또 act로 감싸면(중첩) 커밋이 늦어지므로 감싸지 않는다.
/** 탭: 누르고 바로 떼기 */
const tap = async (q: Q, idx: number) => {
  await grantAt(q, idx);
  await release(q, 1050);
  await flushMicro();
};
/** 길게 누른 채 끌어서 범위선택 후 떼기 */
const longPressDrag = async (q: Q, from: number, to: number) => {
  pressImmediately();
  await grantAt(q, from);
  await moveTo(q, to, 1500);
  await release(q, 1600);
  await flushMicro();
};

const rerenderWith = async (q: Q, status: typeof mockStatus, nowOffset: number, el: () => React.ReactElement = ui) => {
  (Date.now as jest.Mock).mockReturnValue(1_000_000 + nowOffset);
  mockStatus = status;
  await q.rerender(el());
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = { currentTime: 0, duration: 3, playing: false, didJustFinish: false };
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
});
afterEach(() => jest.restoreAllMocks());

describe('ScheduleDetail 단어 탭 재생', () => {
  test('단어를 탭하면 그 단어 시작점으로 이동해 재생한다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await tap(q, 2);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(1.1);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });

  test('단어 끝 시각에 도달하면 자동으로 정지한다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await tap(q, 2);
    await rerenderWith(q, { currentTime: 1.3, duration: 3, playing: true, didJustFinish: false }, 400);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    await rerenderWith(q, { currentTime: 1.62, duration: 3, playing: true, didJustFinish: false }, 700);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(q.getByText('▶')).toBeTruthy();
  });

  test('재생 중인 단어가 하이라이트되고, 단어 사이 공백에서도 직전 단어가 유지된다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await tap(q, 0);
    await rerenderWith(q, { currentTime: 0.3, duration: 3, playing: true, didJustFinish: false }, 400);
    expect(JSON.stringify(q.getByText('내일').props.style)).toContain('"fontWeight":"700"');
    expect(JSON.stringify(q.getByText('회의').props.style)).not.toContain('"fontWeight":"700"');
  });

  test('범위 재생 중 단어 사이 공백(0.5~0.6s)에서도 직전 단어 하이라이트가 유지된다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await longPressDrag(q, 0, 1); // 내일~오후
    await rerenderWith(q, { currentTime: 0.55, duration: 3, playing: true, didJustFinish: false }, 650);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    expect(JSON.stringify(q.getByText('내일').props.style)).toContain('"fontWeight":"700"');
    expect(JSON.stringify(q.getByText('세시').props.style)).not.toContain('"fontWeight":"700"');
  });

  test('길게 누르기 전에 손가락이 많이 움직이면(스크롤) 재생하지 않는다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await grantAt(q, 1);
    await fireEvent(q.getByTestId('wordFlow'), 'responderMove', touchEvt(chipCenter(1).x, 60, 1100)); // 아래로 48px → 타이머 취소
    await release(q, 1600);
    await flushMicro();
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(q.queryByText(/다시 듣기/)).toBeNull();
  });
});

describe('ScheduleDetail 전체 재생·오디오 경로', () => {
  test('플레이어가 duration을 0으로 보고해도 저장된 녹음 길이(durationSec) 기준으로 끝에서 멈춘다', async () => {
    mockStatus = { currentTime: 0, duration: 0, playing: false, didJustFinish: false };
    const q = await render(ui());
    await fireEvent.press(q.getByText('▶'));
    await flushMicro();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    const stuck = { currentTime: 0, duration: 0, playing: false, didJustFinish: false };
    await rerenderWith(q, stuck, 1500); // 1.5s < 3s
    expect(q.getByText('⏸')).toBeTruthy();
    await rerenderWith(q, stuck, 3300); // 시계 3.3s(-0.3 = 3.0) ≥ durationSec 3 - 0.1 → 종료
    expect(q.getByText('▶')).toBeTruthy();
  });

  test('끝 근처에서 멈춘 상태로 ▶를 누르면 이어 재생이 아니라 처음부터 재생한다', async () => {
    mockStatus = { currentTime: 2.7, duration: 3, playing: false, didJustFinish: false }; // 마지막 단어 듣고 멈춘 상태
    const q = await render(ui());
    await fireEvent.press(q.getByText('▶'));
    await flushMicro();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  });

  test('중간에서 멈춘 상태로 ▶를 누르면 그 지점부터 이어 재생한다', async () => {
    mockStatus = { currentTime: 1.2, duration: 3, playing: false, didJustFinish: false };
    const q = await render(ui());
    await fireEvent.press(q.getByText('▶'));
    await flushMicro();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(1.2);
  });

  test('스피커 모드는 재생 전용 세션(allowsRecording=false), 수화기를 고르면 녹음용 세션+수화기 라우팅', async () => {
    const q = await render(ui());
    await flushMicro();
    // 열릴 때 스피커 모드 적용
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false, shouldRouteThroughEarpiece: false }),
    );
    await fireEvent.press(q.getByText('📞 수화기'));
    await flushMicro();
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: true, shouldRouteThroughEarpiece: true }),
    );
    await fireEvent.press(q.getByText('🔊 스피커'));
    await flushMicro();
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false, shouldRouteThroughEarpiece: false }),
    );
  });
});

describe('ScheduleDetail 단어 시각이 없는 녹음(iOS 인식기 미제공) 호환', () => {
  const degenerateRecord: ScheduleRecord = {
    ...record, durationSec: 4,
    segments: record.segments!.map((seg) => ({ ...seg, startTimeMillis: 303, endTimeMillis: 303 })),
  };
  const ui2 = () => (
    <ScheduleDetail visible record={degenerateRecord} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} />
  );
  test('모든 단어가 같은 시각이면 녹음 길이에 글자 수 비례로 배분해 단어 탭이 그 구간을 재생한다', async () => {
    mockStatus = { currentTime: 0, duration: 0, playing: false, didJustFinish: false }; // 플레이어 duration 미제공 → durationSec 4 사용
    const q = await render(ui2());
    await layoutChips(q);
    await tap(q, 2); // 내일·오후·세시·회의 각 2글자 → 1초씩. 세시 = 2.0~3.0
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(2);
    await rerenderWith(q, { currentTime: 0, duration: 0, playing: false, didJustFinish: false }, 500, ui2); // 시계 2.5s
    expect(JSON.stringify(q.getByTestId('chip-2').props.style)).toContain('"backgroundColor":"#F06A6A"');
    await rerenderWith(q, { currentTime: 0, duration: 0, playing: false, didJustFinish: false }, 1050, ui2); // 3.05s ≥ 3.0 → 정지
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });
});

describe('ScheduleDetail 재생 시작 직후 stale status 무시', () => {
  test('직전에 2.0s에서 멈춘 상태로 그보다 앞 단어(세시 1.1~1.6)를 탭해도 즉시 정지하지 않는다', async () => {
    mockStatus = { currentTime: 2.0, duration: 3, playing: false, didJustFinish: false };
    const q = await render(ui());
    await layoutChips(q);
    await tap(q, 2);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(1.1);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    expect(q.getByText('⏸')).toBeTruthy();
    // 새 status 이벤트가 오면 그때부터 판정
    await rerenderWith(q, { currentTime: 1.3, duration: 3, playing: true, didJustFinish: false }, 250);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    await rerenderWith(q, { currentTime: 1.62, duration: 3, playing: true, didJustFinish: false }, 600);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  test('전체 재생이 끝난 뒤(didJustFinish가 남은 status) 단어를 탭해도 바로 ▶로 돌아가지 않는다', async () => {
    mockStatus = { currentTime: 3, duration: 3, playing: false, didJustFinish: true };
    const q = await render(ui());
    await layoutChips(q);
    await tap(q, 0);
    expect(q.getByText('⏸')).toBeTruthy();
    await rerenderWith(q, { currentTime: 0.2, duration: 3, playing: true, didJustFinish: false }, 300);
    expect(q.getByText('⏸')).toBeTruthy();
  });

  test('전체 재생 중 단어를 길게 누르면 재생을 멈추고 선택을 시작한다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await fireEvent.press(q.getByText('▶'));
    await flushMicro();
    await rerenderWith(q, { currentTime: 0.8, duration: 3, playing: true, didJustFinish: false }, 900);
    expect(q.getByText('⏸')).toBeTruthy();
    pressImmediately();
    await grantAt(q, 1);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(q.getByText('끌어서 범위를 넓히세요 · 손을 떼면 재생')).toBeTruthy();
  });
});

describe('ScheduleDetail 범위선택 (길게 누른 채 끌기)', () => {
  test('오후에서 회의까지 끌어 놓으면 그 범위를 재생하고 범위 끝에서 정지한다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await longPressDrag(q, 1, 3);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0.6); // 오후 시작
    expect(q.getByText('▶ 3단어 다시 듣기')).toBeTruthy();
    expect(q.getByText('“오후 세시 회의”')).toBeTruthy();
    // 중간 단어(세시) 지나는 중엔 정지하지 않음
    await rerenderWith(q, { currentTime: 1.3, duration: 3, playing: true, didJustFinish: false }, 400);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    // 범위 끝(회의 끝 2.3s) 도달 → 정지, 선택은 유지(다시 듣기 가능)
    await rerenderWith(q, { currentTime: 2.31, duration: 3, playing: true, didJustFinish: false }, 900);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(q.getByText('▶ 3단어 다시 듣기')).toBeTruthy();
  });

  test('역방향으로 끌어도 같은 범위가 된다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await longPressDrag(q, 3, 1);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0.6);
    expect(q.getByText('▶ 3단어 다시 듣기')).toBeTruthy();
  });

  test('끌어 선택하는 동안은 ScrollView가 터치를 취소하지 못하게 하고, 손을 떼면 되돌린다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    const scroll = () => q.getByTestId('detailScroll');
    expect(scroll().props.canCancelContentTouches).toBe(true);
    pressImmediately();
    await grantAt(q, 1);
    expect(scroll().props.canCancelContentTouches).toBe(false);
    expect(q.getByText('끌어서 범위를 넓히세요 · 손을 떼면 재생')).toBeTruthy();
    await moveTo(q, 2, 1500);
    await release(q, 1600);
    await flushMicro();
    expect(scroll().props.canCancelContentTouches).toBe(true);
  });

  test('플레이어 status가 멈춰 있어도(소리 미출력) 시계 기준으로 단어 하이라이트가 진행되고 범위 끝에서 정지한다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await longPressDrag(q, 1, 3); // 오후(0.6)~회의(2.3)
    // status는 seek 직후 값(0.6)에서 그대로 멈춰 있다고 가정
    const stuck = { currentTime: 0.6, duration: 3, playing: false, didJustFinish: false };
    // 재생 중 단어는 칩 배경이 빨간색(wordPlaying) — 범위 끝단의 굵은 글씨와 구분해 배경으로 판정
    const chipBg = (idx: number) => JSON.stringify(q.getByTestId(`chip-${idx}`).props.style);
    await rerenderWith(q, stuck, 300); // 시계 0.9s → 오후
    expect(chipBg(1)).toContain('"backgroundColor":"#F06A6A"');
    await rerenderWith(q, stuck, 850); // 시계 1.45s(-0.3 여유 = 1.15) → 세시
    expect(chipBg(2)).toContain('"backgroundColor":"#F06A6A"');
    expect(chipBg(1)).not.toContain('"backgroundColor":"#F06A6A"');
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    await rerenderWith(q, stuck, 2100); // 시계 2.7s(-0.3 = 2.4) ≥ 범위 끝 2.3 → 정지
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(q.getByText('▶')).toBeTruthy();
  });

  test('선택 중 네이티브가 터치를 취소(terminate)해도 손을 뗀 것처럼 범위를 재생한다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    pressImmediately();
    await grantAt(q, 1);
    await moveTo(q, 3, 1500);
    await fireEvent(q.getByTestId('wordFlow'), 'responderTerminate', touchEvt(touchPrev.x, touchPrev.y, 1600));
    await flushMicro();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0.6);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(q.getByText('▶ 3단어 다시 듣기')).toBeTruthy();
    expect(q.getByTestId('detailScroll').props.canCancelContentTouches).toBe(true);
  });

  test('선택이 남아 있을 때 범위 밖 단어를 탭하면 그쪽으로 범위가 늘어나 재생된다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await longPressDrag(q, 1, 2); // 오후~세시
    mockPlayer.seekTo.mockClear();
    await tap(q, 0); // 내일 → 내일~세시
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(q.getByText('▶ 3단어 다시 듣기')).toBeTruthy();
  });

  test('다시 듣기를 누르면 같은 범위를 처음부터 재생한다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await longPressDrag(q, 1, 2);
    mockPlayer.seekTo.mockClear();
    await fireEvent.press(q.getByText('▶ 2단어 다시 듣기'));
    await flushMicro();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0.6);
  });

  test('✕를 누르면 선택이 해제되고 단어 탭은 다시 한 단어 재생으로 돌아온다', async () => {
    const q = await render(ui());
    await layoutChips(q);
    await longPressDrag(q, 1, 2);
    await fireEvent.press(q.getByLabelText('범위 해제'));
    expect(q.queryByText(/다시 듣기/)).toBeNull();
    mockPlayer.seekTo.mockClear();
    await tap(q, 3);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(1.7);
  });
});



describe('ScheduleDetail 글을 고친 추가 엔트리(단어 시각 없음)', () => {
  test('녹음이 있으면 고친 글을 나눠 칩을 만들어 단어 탭 재생이 된다', async () => {
    const withAppend: ScheduleRecord = {
      ...record,
      appends: [{
        id: 'a1', uri: 'file:///rec_a1.m4a', durationSec: 6, transcript: '수학 옆에 있는 뚝배기',
        content: '송내역 옆에 있는 뚝배기', createdAt: 2, // segments 없음 (편집기가 글을 고치면 비운다)
      }],
    };
    const screen = await render(
      <ScheduleDetail visible record={withAppend} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} />,
    );
    // 메인 4개 + 추가 4개 → chip-0이 두 블록에 하나씩
    expect(screen.getAllByTestId('chip-0')).toHaveLength(2);
    expect(screen.getByText('송내역')).toBeTruthy();
    expect(screen.queryByText(/단어별 재생을 쓸 수 없어요/)).toBeNull();
  });
  test('녹음 파일이 없는 항목(Android 12 이하)은 칩 없이 글만 보이고 안내가 뜬다', async () => {
    const noAudio: ScheduleRecord = { ...record, uri: '', segments: undefined, appends: undefined };
    const screen = await render(
      <ScheduleDetail visible record={noAudio} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} />,
    );
    expect(screen.queryAllByTestId('chip-0')).toHaveLength(0);
    expect(screen.getByText('녹음 파일 없이 글만 저장된 항목이에요')).toBeTruthy();
  });
});

describe('상세 화면의 알림 바꾸기 시트', () => {
  test('상세에는 칩이 없고 "알림 바꾸기" 버튼만 있다 — 칩과 저장은 시트 안에서만', async () => {
    const rec = { ...record, remindBefore: [30], exactAlarm: true };
    const screen = await render(
      <ScheduleDetail visible record={rec} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} onAlarmChange={() => {}} />,
    );
    expect(screen.getByText('미리 알림 30분 전 · 정각 알림 켬')).toBeTruthy();
    expect(screen.getByTestId('remind-open')).toBeTruthy();
  });
  test('시트에서 칩을 바꿔도 "저장"을 눌러야 onAlarmChange가 한 번 불린다', async () => {
    const onAlarmChange = jest.fn();
    const rec = { ...record, remindBefore: [30], exactAlarm: true };
    const screen = await render(
      <ScheduleDetail visible record={rec} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} onAlarmChange={onAlarmChange} />,
    );
    await fireEvent.press(screen.getByTestId('remind-open'));
    await fireEvent.press(screen.getByLabelText('미리 알림 하루 전'));
    await fireEvent.press(screen.getByLabelText('정각 알림'));
    expect(onAlarmChange).not.toHaveBeenCalled(); // 바꾸기만 해서는 저장되지 않는다
    await fireEvent.press(screen.getByTestId('remind-save'));
    expect(onAlarmChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('remind-save')).toBeNull(); // 저장하면 시트가 닫혀 연타로 두 번 걸리지 않는다
    expect(onAlarmChange).toHaveBeenLastCalledWith(rec, [30, 1440], false, false);
  });
  test('시트에서 바꾸고 취소하면 저장하지 않는다', async () => {
    const onAlarmChange = jest.fn();
    const rec = { ...record, remindBefore: [30], exactAlarm: true };
    const screen = await render(
      <ScheduleDetail visible record={rec} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} onAlarmChange={onAlarmChange} />,
    );
    await fireEvent.press(screen.getByTestId('remind-open'));
    await fireEvent.press(screen.getByLabelText('미리 알림 10분 전'));
    await fireEvent.press(screen.getByText('취소'));
    expect(onAlarmChange).not.toHaveBeenCalled();
  });
  test('지난 일정은 칩 없이 안내만', async () => {
    const rec = { ...record, scheduleAt: Date.now() - 3_600_000 };
    const screen = await render(
      <ScheduleDetail visible record={rec} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} onAlarmChange={() => {}} />,
    );
    expect(screen.getByText('지난 일정 (알림 없음)')).toBeTruthy();
    expect(screen.queryByTestId('remind-open')).toBeNull();
  });
});

describe('지난 일정의 결과 버튼', () => {
  // Date.now는 위 테스트에서 고정될 수 있어 테스트 안에서 시각을 잡는다
  let past: ScheduleRecord;
  beforeEach(() => { past = { ...record, id: 'p1', scheduleAt: Date.now() - 3_600_000 }; });

  it('지난 일정에만 "어떻게 됐나요?"가 보이고, 누르면 부모에게 종류를 넘긴다', async () => {
    const onOutcome = jest.fn();
    const screen = await render(
      <ScheduleDetail visible record={past} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} onOutcome={onOutcome} />
    );
    expect(screen.getByText('어떻게 됐나요?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('outcome-moved'));
    expect(onOutcome).toHaveBeenCalledWith(past, 'moved');
  });

  it('앞으로의 일정에는 "미루기" 하나만 보이고, 누르면 바뀜(moved)으로 넘긴다', async () => {
    const onOutcome = jest.fn();
    const screen = await render(
      <ScheduleDetail visible record={record} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} onOutcome={onOutcome} />
    );
    expect(screen.queryByText('어떻게 됐나요?')).toBeNull();
    expect(screen.queryByTestId('outcome-skipped')).toBeNull();
    await fireEvent.press(screen.getByText('미루기'));
    expect(onOutcome).toHaveBeenCalledWith(record, 'moved');
  });

  it('앞으로의 기간 일정에는 미루기를 두지 않는다(날짜를 고쳐 옮긴다)', async () => {
    const range = { ...record, endAt: (record.scheduleAt ?? 0) + 3 * 86_400_000 };
    const screen = await render(
      <ScheduleDetail visible record={range} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} onOutcome={jest.fn()} />
    );
    expect(screen.queryByTestId('outcome-box')).toBeNull();
  });

  it('다시 잡은 날짜를 누르면 그 일정으로, 원래 일정 줄을 누르면 원래 일정으로 간다', async () => {
    const onOpenRecord = jest.fn();
    const marked: ScheduleRecord = { ...past, outcome: { kind: 'moved', nextId: 'n1', nextAt: Date.now() + 86_400_000, nextHasTime: true } };
    const screen = await render(
      <ScheduleDetail visible record={marked} onClose={() => {}} onEdit={() => {}} onAppend={() => {}} onOutcome={jest.fn()} onOpenRecord={onOpenRecord} origin={{ ...past, id: 'o1' }} />
    );
    await fireEvent.press(screen.getByTestId('outcome-next'));
    expect(onOpenRecord).toHaveBeenCalledWith('n1');
    await fireEvent.press(screen.getByTestId('outcome-origin'));
    expect(onOpenRecord).toHaveBeenCalledWith('o1');
  });
});
