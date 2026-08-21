// ─── 설정 시트 — 테마(시스템/라이트/다크) 선택 ─────────────────────────────────
import { StyleSheet, View } from 'react-native';
import { useStyles, useThemeOverride, type Theme } from '../lib/theme';
import { Sheet } from './ui/Sheet';
import { Chip } from './ui/Chip';
import { AppText } from './ui/Text';

const OPTIONS: { value: 'system' | 'light' | 'dark'; label: string }[] = [
  { value: 'system', label: '시스템 설정' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStyles(makeStyles);
  const { override, setOverride } = useThemeOverride();

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={s.header}>
        <AppText variant="title2">설정</AppText>
      </View>

      <View style={s.row}>
        <AppText variant="label" color="textSub">화면 테마</AppText>
        <View style={s.chipRow}>
          {OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              selected={override === o.value}
              onPress={() => setOverride(o.value)}
            />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  header: { width: '100%', marginBottom: t.space.lg },
  row: { width: '100%', gap: t.space.sm, paddingBottom: t.space.lg },
  chipRow: { flexDirection: 'row', gap: t.space.sm },
});
