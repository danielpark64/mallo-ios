// ─── Sheet — 바텀시트 공통 (녹음 오버레이·필터 시트 등) ──────────────────────────
import { Modal, Pressable, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme, type Theme } from '../../lib/theme';
import { AppText as Text } from './Text';

export function Sheet({
  visible, onClose, children, style, transparent = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: ViewStyle | (ViewStyle | false | null | undefined)[];
  transparent?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = makeStyles(t);

  return (
    <Modal visible={visible} animationType="slide" transparent={transparent} onRequestClose={onClose}>
      {/* 어두운 시트 위이므로 테마와 무관하게 밝은 상태바 글자 유지 */}
      <StatusBar style="light" />
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[s.sheet, { paddingBottom: t.space.xl + insets.bottom }, style]}
          onStartShouldSetResponder={() => true}
        >
          <View style={s.handle} />
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: t.c.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: t.c.surface,
    borderTopLeftRadius: t.radius['2xl'], borderTopRightRadius: t.radius['2xl'],
    paddingHorizontal: t.space.xl, paddingTop: t.space.md,
    alignItems: 'center',
    position: 'relative',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: t.c.border, marginBottom: t.space.lg },
  closeBtn: {
    position: 'absolute', top: t.space.md, right: t.space.md,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.c.surfaceAlt,
  },
  closeBtnText: { color: t.c.textSub, fontSize: 14, fontWeight: '700' },
});
