// ─── Icon — Feather 선형 아이콘 단일 패밀리 + 의미 기반 이름 매핑 ───────────────────
// 나중에 자작 SVG로 갈아탈 때도 호출부(NAME)는 그대로 두면 된다.
import Feather from '@expo/vector-icons/Feather';
import { useTheme, type AppTextColor } from '../../lib/theme';

const MAP = {
  search: 'search',
  calendar: 'calendar',
  mic: 'mic',
  play: 'play',
  pause: 'pause',
  stop: 'square',
  bell: 'bell',
  plus: 'plus',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  trash: 'trash-2',
  speaker: 'volume-2',
  earpiece: 'phone',
  check: 'check',
  clock: 'clock',
  share: 'share',
  x: 'x',
} as const;

export type IconName = keyof typeof MAP;

export function Icon({
  name, size = 20, color = 'text',
}: {
  name: IconName;
  size?: number;
  color?: AppTextColor;
}) {
  const t = useTheme();
  return <Feather name={MAP[name]} size={size} color={t.c[color]} />;
}
