// ─── Card — surface + radius + elevation(테마 분기) ────────────────────────────
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '../../lib/theme';

type Props = ViewProps & {
  style?: import('react-native').StyleProp<ViewStyle>;
  padded?: boolean;
};

export function Card({ style, padded = true, children, ...rest }: Props) {
  const t = useTheme();
  const s = makeStyles(t);
  return (
    <View style={[s.base, padded && s.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  base: {
    backgroundColor: t.c.surface,
    borderRadius: t.radius.lg,
    ...t.elevation('e1'),
  },
  padded: { padding: t.space.lg },
});
