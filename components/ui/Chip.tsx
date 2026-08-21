// ─── Chip — AND/OR·스피커/수화기·알람모드 등 토글 3벌을 통합 ───────────────────────
import { StyleSheet, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '../../lib/theme';
import { PressScale } from './Pressable';
import { AppText } from './Text';

export function Chip({
  label, selected, onPress, icon, style,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  style?: import('react-native').StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const s = makeStyles(t);
  return (
    <PressScale
      onPress={onPress}
      haptic="selection"
      style={[s.base, selected && s.selected, style]}
    >
      {icon}
      <AppText variant="label" color={selected ? 'onAccent' : 'textSub'}>{label}</AppText>
    </PressScale>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  base: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.xs,
    paddingHorizontal: t.space.md, paddingVertical: t.space.sm,
    borderRadius: t.radius.full,
    backgroundColor: t.c.surfaceAlt,
  },
  selected: { backgroundColor: t.c.accent },
});
