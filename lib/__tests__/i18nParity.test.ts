// 번역 누락 방지: 영어 사전에 있는 문구는 나머지 7개 언어에도 있어야 하고(없으면 그 언어 화면에 영어가 섞여 보인다),
// 설명서 문단은 영어 사전에 모두 있어야 한다.
import { EN } from '../i18n/en';
import { DICTS } from '../i18n/dicts';
import { HELP_SECTIONS } from '../helpContent';

const OTHERS = ['ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt'] as const;

test.each(OTHERS)('%s 사전에 영어 사전의 모든 문구가 있다', (lang) => {
  const dict = (DICTS as Record<string, Record<string, string>>)[lang];
  const missing = Object.keys(EN).filter((k) => !(k in dict));
  expect(missing).toEqual([]);
});

test('설명서의 모든 제목·문단이 영어 사전에 있다', () => {
  const missing = HELP_SECTIONS.flatMap((s) => [s.title, ...s.body]).filter((k) => !(k in EN));
  expect(missing).toEqual([]);
});
