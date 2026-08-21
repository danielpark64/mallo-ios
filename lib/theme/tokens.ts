// ─── 테마와 무관한 디자인 토큰 ─────────────────────────────────────────────────
import type { TextStyle, ViewStyle } from 'react-native';

export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32, '4xl': 40,
} as const;

/** 전 화면 좌우 패딩. 예전엔 16과 20이 섞여 세로 정렬선이 어긋났다 */
export const screenPad = 20;

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, full: 9999,
} as const;

/** 라이트 전용 그림자. 다크에서는 elevation() 헬퍼가 테두리로 대체한다 */
export const shadow: Record<'e1' | 'e2' | 'e3', ViewStyle> = {
  e1: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,  shadowOffset: { width: 0, height: 2 },  elevation: 2 },
  e2: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },  elevation: 6 },
  e3: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
};

/**
 * ⚠️ fontWeight를 쓰지 않는다 — 커스텀 fontFamily에 weight를 함께 주면
 * Android는 가짜 볼드, iOS는 파일 매칭이 어긋난다. weight는 패밀리명으로만 표현.
 * Pretendard는 PostScript 이름 = 파일명이라 양 플랫폼에서 같은 문자열이 통한다.
 */
export const font = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

export type TypoVariant =
  | 'display' | 'title1' | 'title2' | 'body' | 'bodySm'
  | 'label' | 'caption' | 'micro';

export const typo: Record<TypoVariant, TextStyle> = {
  display: { fontFamily: font.bold,     fontSize: 28, lineHeight: 36, letterSpacing: -0.6 },
  title1:  { fontFamily: font.bold,     fontSize: 22, lineHeight: 30, letterSpacing: -0.4 },
  title2:  { fontFamily: font.bold,     fontSize: 18, lineHeight: 26, letterSpacing: -0.3 },
  body:    { fontFamily: font.medium,   fontSize: 16, lineHeight: 24, letterSpacing: -0.2 },
  bodySm:  { fontFamily: font.regular,  fontSize: 15, lineHeight: 22, letterSpacing: -0.2 },
  label:   { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, letterSpacing: -0.1 },
  caption: { fontFamily: font.medium,   fontSize: 13, lineHeight: 18 },
  micro:   { fontFamily: font.semibold, fontSize: 11, lineHeight: 16, letterSpacing: 0.2 },
};

/** 시각·카운트 등 자릿수가 흔들리면 안 되는 숫자에 얹는다 */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

export const duration = { fast: 150, base: 220, slow: 320 } as const;
