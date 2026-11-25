// Android 울림 카드 글자(lib/ringCard.ts) — 띠 문구가 9개 언어로 나오고, 네이티브 AlarmLabels.RING_KEYS와 키가 맞는지
import { LANGS, setCurrentLang } from '../i18n/lang';
import { REMIND_OPTIONS } from '../reminders';
import { ringBandLabel, ringCardLabels } from '../ringCard';

// 노드 타입 없이 파일을 본다(jest는 저장소 폴더에서 돈다)
const { readFileSync } = require('fs');
const { join, resolve } = require('path');
const ROOT: string = resolve('.');

afterEach(() => setCurrentLang('ko'));

describe('ringBandLabel — 몇 분 전 알림인지', () => {
  test('한국어: 정각·10분·30분·1시간·하루 전', () => {
    setCurrentLang('ko');
    expect(ringBandLabel(0)).toBe('지금 · 일정 시간');
    expect(ringBandLabel(10)).toBe('10분 전 알림');
    expect(ringBandLabel(30)).toBe('30분 전 알림');
    expect(ringBandLabel(60)).toBe('1시간 전 알림');
    expect(ringBandLabel(120)).toBe('2시간 전 알림');
    expect(ringBandLabel(1440)).toBe('하루 전 알림');
  });
  test('모름(-1)·잘못된 값이면 띠 없음', () => {
    expect(ringBandLabel(-1)).toBeNull();
    expect(ringBandLabel(NaN)).toBeNull();
  });
  test('다른 언어는 미리 알림 이름을 재사용한다', () => {
    setCurrentLang('en');
    expect(ringBandLabel(0)).toBe('Now · Event time');
    expect(ringBandLabel(60)).toBe('1 hour before');
    expect(ringBandLabel(1440)).toBe('Day before');
    setCurrentLang('ja');
    expect(ringBandLabel(30)).toBe('30分前のお知らせ');
    setCurrentLang('zh-Hans');
    expect(ringBandLabel(10)).toBe('提前10分钟提醒');
    setCurrentLang('de');
    expect(ringBandLabel(1440)).toBe('Am Vortag');
  });
  test.each(LANGS)('%s: 한국어 원문이나 치환 자리({label})가 새지 않는다', (lang) => {
    setCurrentLang(lang);
    const labels = ringCardLabels();
    for (const [k, v] of Object.entries(labels)) {
      expect(v).toBeTruthy();
      expect(v).not.toContain('{label}');
      if (lang !== 'ko' && k !== 'lang') expect(v).not.toMatch(/[가-힣]/);
    }
    expect(labels.lang).toBe(lang);
  });
});

test('ringCardLabels 키 = 네이티브 AlarmLabels.RING_KEYS, 미리 알림 옵션마다 pre<N>', () => {
  const kt = readFileSync(
    join(ROOT, 'modules/mallo-alarm/android/src/main/java/com/danielpark/mallo/alarm/AlarmLabels.kt'),
    'utf8'
  );
  const m = /RING_KEYS = listOf\(([^)]*)\)/.exec(kt);
  expect(m).not.toBeNull();
  const nativeKeys = m![1].split(',').map((s) => s.trim().replace(/"/g, '')).sort();
  expect(Object.keys(ringCardLabels()).sort()).toEqual(nativeKeys);
  for (const r of REMIND_OPTIONS) expect(nativeKeys).toContain(`pre${r}`);
});
