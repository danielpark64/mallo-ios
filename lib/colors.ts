// ─── 색상 팔레트 ───────────────────────────────────────────────────────────────
// 화면에서는 `import { C }` 대신 `const C = useTheme()` (lib/theme.tsx) 로 받아야 라이트/다크가 바뀐다.
export const DARK = {
  bg: '#0E0E15',
  surface: '#232334',      // 카드 배경 — 바탕과 뚜렷이 구분
  surfaceHigh: '#32324C',
  border: '#40405E',
  accent: '#3D8BFF',
  red: '#F06A6A',
  green: '#4ADE80',
  text: '#F4F4FF',
  textSub: '#A6A6C4',
  textDim: '#5E5E7A',
  sun: '#F27D7D',
  sat: '#85B2F5',
  /** 강조색 위에 올리는 글자 (버튼 라벨 등) */
  onAccent: '#FFFFFF',
};

// 라이트: 노안 사용자를 고려해 본문·보조 글자 대비를 AA(4.5:1) 이상으로 잡는다
export const LIGHT: typeof DARK = {
  bg: '#F2F3F8',
  surface: '#FFFFFF',
  surfaceHigh: '#E6E8F1',
  border: '#D3D6E3',
  accent: '#2B6BD9',
  red: '#D14A4A',
  green: '#1F9A58',
  text: '#15172A',
  textSub: '#4C5070',
  textDim: '#9598B0',
  sun: '#C63F3F',
  sat: '#2B6BD9',
  onAccent: '#FFFFFF',
};

export type Palette = typeof DARK;

/** 테마 컨텍스트 밖(테스트·상수)에서 쓰는 기본 팔레트. 화면 코드에서는 useTheme()를 쓸 것 */
export const C = DARK;
