// 음성 인식 결과 이어 붙이기 — 한 번 들은 말은 지우지 않는다 (2026-10-13 32 실측 사례 기반)
import { applyFinal, applyPartial, applySessionEnd, emptyMerge, mergedText } from '../transcriptMerge';

const run = (events: Array<['p' | 'f' | 'end', string?]>) => {
  let st = emptyMerge();
  for (const [k, t] of events) st = k === 'p' ? applyPartial(st, t ?? '') : k === 'f' ? applyFinal(st, t ?? '') : applySessionEnd(st);
  return mergedText(st);
};

describe('transcriptMerge', () => {
  test('말을 마친 뒤 빈 결과가 와도 글이 사라지지 않는다', () => {
    expect(run([['p', '내일 오후 3시에 치과 예약'], ['f', '내일 오후 3시에 치과 예약'], ['p', ''], ['f', ''], ['p', '  ']])).toBe('내일 오후 3시에 치과 예약');
  });
  test('확정 결과가 마지막 조각만 담아 와도 앞 문장(날짜)이 남는다', () => {
    expect(run([
      ['p', 'dentist tomorrow at 3:00 p.m. remind me 30 minutes before'],
      ['f', 'remind me 30 minutes before'],
    ])).toBe('dentist tomorrow at 3:00 p.m. remind me 30 minutes before');
  });
  test('확정 결과가 부분 결과를 다듬은 것이면 확정 결과를 쓴다', () => {
    expect(run([['p', '내일 오후 세시 치과'], ['f', '내일 오후 3시에 치과 예약']])).toBe('내일 오후 3시에 치과 예약');
    expect(run([['p', '내일 오후 3시에 치과 예약해'], ['f', '내일 오후 3시에 치과 예약']])).toBe('내일 오후 3시에 치과 예약');
  });
  test('확정 뒤 새로 말하면 뒤에 이어 붙는다', () => {
    expect(run([['p', '내일 치과'], ['f', '내일 치과'], ['p', '30분 전에'], ['p', '30분 전에 알려줘'], ['f', '30분 전에 알려줘']])).toBe('내일 치과 30분 전에 알려줘');
  });
  test('확정 뒤에도 누적으로 다시 오면 중복되지 않는다', () => {
    expect(run([['p', '내일 치과'], ['f', '내일 치과'], ['p', '내일 치과 예약'], ['f', '내일 치과 예약']])).toBe('내일 치과 예약');
  });
  test('같은 확정 결과가 두 번 와도 한 번만', () => {
    expect(run([['f', '우유 사기'], ['f', '우유 사기']])).toBe('우유 사기');
  });
  test('세션이 끊겨 다시 시작돼도 앞에서 말한 것이 남고 이어진다', () => {
    expect(run([['p', '오늘 회의는'], ['end'], ['p', '세 시에 시작'], ['end'], ['p', '']])).toBe('오늘 회의는 세 시에 시작');
  });
});
