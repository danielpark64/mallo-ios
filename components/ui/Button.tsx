// ─── Button — primary/secondary/ghost/danger ───────────────────────────────────
import { StyleSheet, View } from 'react-native';
import { useTheme, type Theme } from '../../lib/theme';
import { PressScale } from './Pressable';
import { AppText } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export function Button({
  label, onPress, variant = 'primary', size = 'lg', disabled, icon,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const t = useTheme();
  const s = makeStyles(t);
  const bg = {
    primary: t.c.accent,
    secondary: t.c.surfaceAlt,
    ghost: 'transparent',
    danger: t.c.red,
  }[variant];
  const fg: 'onAccent' | 'text' | 'textSub' = variant === 'primary' || variant === 'danger' ? 'onAccent' : 'text';

  return (
    <PressScale
      disabled={disabled}
      onPress={onPress}
      haptic="light"
      style={[
        s.base,
        size === 'md' && s.md,
        { backgroundColor: bg },
        disabled && s.disabled,
      ]}
    >
      <View style={s.row}>
        {icon}
        <AppText variant="label" color={fg}>{label}</AppText>
      </View>
    </PressScale>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  base: {
    height: 56, borderRadius: t.radius.lg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: t.space.lg,
  },
  md: { height: 44, borderRadius: t.radius.md },
  disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
});
