// [LONGREC 시험판] 긴 녹음 받아쓰기 문단 쌓기
import { clock, emptyLong, isRestart, longFinal, longParas, longPartial, longSessionEnd } from '../longTranscript';

test('부분 결과는 진행 중인 문단을 갈아 끼우고, 시각은 처음 것을 지킨다', () => {
  let st = emptyLong();
  st = longPartial(st, '오늘 회의', 3000);
  st = longPartial(st, '오늘 회의 안건은 두 가지', 5000);
  expect(longParas(st)).toEqual([{ atMs: 2500, text: '오늘 회의 안건은 두 가지' }]);
});

test('세션이 끊기면 문단이 끝나고, 다음 세션은 새 문단이 된다', () => {
  let st = emptyLong();
  st = longPartial(st, '첫 번째 안건은 예산입니다', 4000);
  st = longSessionEnd(st);
  st = longPartial(st, '두 번째는 일정', 65000);
  expect(longParas(st).map((p) => p.text)).toEqual(['첫 번째 안건은 예산입니다', '두 번째는 일정']);
  expect(longParas(st)[1].atMs).toBe(64500);
});

test('확정 결과가 마지막 조각만 담겨 와도 앞말을 지우지 않는다', () => {
  let st = emptyLong();
  st = longPartial(st, '내일 오후 세 시에 다시 모여서 결정하겠습니다', 9000);
  st = longFinal(st, '결정하겠습니다', 9500);
  expect(longParas(st)).toEqual([{ atMs: 8500, text: '내일 오후 세 시에 다시 모여서 결정하겠습니다' }]);
});

test('확정한 뒤 같은 글이 누적으로 다시 오면 겹쳐 쌓지 않는다', () => {
  let st = emptyLong();
  st = longPartial(st, '예산은 삼백만 원', 2000);
  st = longFinal(st, '예산은 삼백만 원', 2500);
  st = longPartial(st, '예산은 삼백만 원 정도로 잡았습니다', 4000);
  st = longSessionEnd(st);
  expect(longParas(st)).toEqual([{ atMs: 1500, text: '예산은 삼백만 원 정도로 잡았습니다' }]);
});

test('말이 멈춘 뒤 부분 결과가 처음부터 다시 오면 앞 문장을 문단으로 남긴다', () => {
  let st = emptyLong();
  st = longPartial(st, '지난주 매출은 전주보다 십 퍼센트 늘었습니다', 10000);
  st = longPartial(st, '다음', 20000);
  st = longPartial(st, '다음 주 계획을 말씀드리겠습니다', 22000);
  expect(longParas(st)).toEqual([
    { atMs: 9500, text: '지난주 매출은 전주보다 십 퍼센트 늘었습니다' },
    { atMs: 19500, text: '다음 주 계획을 말씀드리겠습니다' },
  ]);
});

test('인식기가 앞 단어를 고쳐 쓰는 것은 새 문장으로 보지 않는다', () => {
  expect(isRestart('지난주 매출은 전주보다 늘었습니다', '지난 주 매출은 전주보다 십 퍼센트 늘었습니다')).toBe(false);
  expect(isRestart('지난주 매출은 전주보다 늘었습니다', '지난주 매출')).toBe(false); // 첫머리가 같다
  expect(isRestart('네', '다음')).toBe(false); // 너무 짧은 글은 판단하지 않는다
});

test('빈 결과는 아무것도 지우지 않는다', () => {
  let st = longPartial(emptyLong(), '회의를 시작하겠습니다', 1000);
  st = longPartial(st, '', 2000);
  st = longFinal(st, '', 3000);
  expect(longParas(st).map((p) => p.text)).toEqual(['회의를 시작하겠습니다']);
});

test('시각 표시', () => {
  expect(clock(0)).toBe('0:00');
  expect(clock(307000)).toBe('5:07');
  expect(clock(3753000)).toBe('1:02:33');
});
