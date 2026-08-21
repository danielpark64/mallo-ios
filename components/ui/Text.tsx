// ─── AppText — 타이포 토큰을 얹은 Text 래퍼 ────────────────────────────────────
// fontWeight를 쓰지 않고 variant → Pretendard 패밀리명으로 굵기를 표현한다.
// `import { AppText as Text } from './ui/Text'` 로 바꾸면 기존 <Text> 108곳이
// JSX 변경 없이 그대로 동작한다.
import { Text as RNText, type TextProps } from 'react-native';
import { useTheme, type AppTextColor, type TypoVariant } from '../../lib/theme';

type Props = TextProps & {
  variant?: TypoVariant;
  color?: AppTextColor;
};

// 한글/영문/숫자/일반 문장부호 범위를 벗어나는 문자(이모지·화살표·기타 기호)가 있으면
// Pretendard를 강제하지 않는다. Pretendard의 cmap이 이런 코드포인트에 빈 사각형
// glyph를 갖고 있어서, 강제하면 iOS가 시스템 폰트/이모지로 자동 대체(fallback)하지
// 않고 그 빈 사각형을 그대로 그린다 — 이모지 아이콘(마이크·검색·화살표 등)이
// 깨진 네모로 보이는 원인. 이 아이콘들은 Phase 4에서 Feather로 전량 교체될
// 예정이라, 그전까지 임시로 시스템 폰트에 맡긴다.
// ASCII 출력가능 범위 + 라틴 확장 + 일반 문장부호 + 한글 자모/음절만 "정상 텍스트"로 본다.
const NON_KOREAN_LATIN = /[^\x20-\x7E¡-ɏ -⁯㄰-㆏가-힣\s]/;

export function AppText({ variant = 'body', color = 'text', style, allowFontScaling, children, ...rest }: Props) {
  const t = useTheme();
  const skipFont = typeof children === 'string' && NON_KOREAN_LATIN.test(children);
  const typo = skipFont ? { ...t.typo[variant], fontFamily: undefined } : t.typo[variant];
  // ⚠️ color도 같이 뺀다 — iOS는 Text에 color 스타일이 얹히면 이모지를
  // 컬러(emoji presentation) 대신 흑백 텍스트 글리프(text presentation)로
  // 렌더링한다. 예: 📅가 색 없는 작은 달력 아이콘 + "17"로 바뀌어버림.
  const colorStyle = skipFont ? null : { color: t.c[color] };
  return (
    <RNText
      // 32 같은 저사양 기기에서 시스템 글꼴 확대를 써도 달력·피커처럼
      // 레이아웃 수학이 걸린 곳이 안 깨지도록 기본 상한을 둔다.
      // 레이아웃이 민감한 자리는 호출부에서 allowFontScaling={false}로 끈다.
      maxFontSizeMultiplier={1.3}
      allowFontScaling={allowFontScaling}
      style={[typo, colorStyle, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
