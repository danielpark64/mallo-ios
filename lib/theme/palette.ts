// ─── 라이트/다크 팔레트 ────────────────────────────────────────────────────────
// 토스(TDS) 계열 색을 기준으로 정리. 두 팔레트는 같은 Palette 타입을 구현한다.

export type Palette = {
  bg: string;           // 화면 바탕
  surface: string;      // 카드/시트
  surfaceAlt: string;   // 입력창·인셋 컨트롤(카드 위에 파인 영역)
  surfacePress: string;
  border: string;
  divider: string;

  accent: string;
  accentPress: string;
  accentSoft: string;   // 선택 칩 배경
  onAccent: string;     // accent 위에 얹는 글자색

  red: string;          // 녹음/알람/삭제
  redSoft: string;
  green: string;

  text: string;
  textSub: string;
  textDim: string;
  textDisabled: string;

  sun: string;
  sat: string;

  overlay: string;
  shadow: string;
};

export const light: Palette = {
  bg: '#F2F4F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F4F6',
  surfacePress: '#EDF0F3',
  border: '#E5E8EB',
  divider: '#F2F4F6',

  accent: '#3182F6',
  accentPress: '#1B64DA',
  accentSoft: '#E8F3FF',
  onAccent: '#FFFFFF',

  red: '#F04452',
  redSoft: '#FFEBEE',
  green: '#15C47E',

  text: '#191F28',
  textSub: '#4E5968',
  textDim: '#8B95A1',
  textDisabled: '#B0B8C1',

  sun: '#F04452',
  sat: '#3182F6',

  overlay: 'rgba(0,0,0,0.40)',
  shadow: '#000000',
};

export const dark: Palette = {
  bg: '#101014',
  surface: '#1A1B21',
  surfaceAlt: '#26272F',
  surfacePress: '#2E303A',
  border: '#32343D',
  divider: '#25262D',

  // 다크 배경 대비를 확보하려고 라이트(#3182F6)보다 밝게 잡음
  accent: '#4D9BFF',
  accentPress: '#6FB2FF',
  accentSoft: '#17233A',
  onAccent: '#FFFFFF',

  red: '#FF6B6B',
  redSoft: '#331C1F',
  green: '#2ED697',

  text: '#EDEEF0',
  textSub: '#A0A6B0',
  textDim: '#6E7480',
  textDisabled: '#4A4E58',

  sun: '#FF7B7B',
  sat: '#7FB4FF',

  overlay: 'rgba(0,0,0,0.62)',
  shadow: '#000000',
};
