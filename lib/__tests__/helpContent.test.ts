// 사용설명서 내용이 비어 있거나 번호가 어긋나지 않는지
import { HELP_SECTIONS } from '../helpContent';

test('설명서 항목이 10개이고 각 항목에 제목과 본문이 있다', () => {
  expect(HELP_SECTIONS).toHaveLength(10);
  HELP_SECTIONS.forEach((sec, i) => {
    expect(sec.title.startsWith(`${i + 1}. `)).toBe(true);
    expect(sec.body.length).toBeGreaterThan(0);
    sec.body.forEach((p) => expect(p.trim().length).toBeGreaterThan(10));
  });
});

test('핵심 기능이 모두 언급된다', () => {
  const all = HELP_SECTIONS.flatMap((s) => [s.title, ...s.body]).join('\n');
  for (const kw of ['마이크', '정하기', '월 | 주', '기간 선택', '길게 누른 채', '다시 듣기', '미리보기', '지워줘', '알람 끄기', '백업', '복원']) {
    expect(all).toContain(kw);
  }
});
