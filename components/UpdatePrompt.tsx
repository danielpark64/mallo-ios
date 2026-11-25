// 새 버전 안내 창(1.2.3) — "새 버전이 있어요" + 큰 [업데이트] + 작은 [나중에]. 필수 판(required)은 [나중에]가 없다(구조만).
// 교대알람 src/components/common/UpdatePrompt.tsx(1.6.3)와 같은 모양 — 색만 세이람 테마(lib/theme)로.
// ⚠️ RN Modal 컴포넌트를 쓰지 않는다 — 화면 안 덮개(View)라 다른 창(Modal)·Android 울림 화면(별도 Activity)이 늘 그 위에 뜬다.
//    그리는 쪽(App.tsx)도 울리는 중·다른 창이 열려 있을 때는 그리지 않는다.
import { useEffect } from 'react';
import { BackHandler, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { useT } from '../lib/i18n';
import { useTheme } from '../lib/theme';

interface Props {
  required: boolean;
  onUpdate: () => void;
  onLater: () => void;
}

export function UpdatePrompt({ required, onUpdate, onLater }: Props) {
  const { t } = useT();
  const C = useTheme();
  // Android 뒤로 가기 = [나중에](필수 판은 닫지 않는다). 덮개가 떠 있는 동안 뒤 화면이 대신 뒤로 가지 않게 늘 막는다
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (!required) onLater(); return true; });
    return () => sub.remove();
  }, [required, onLater]);
  return (
    <View style={s.backdrop} accessibilityViewIsModal>
      <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Text style={[s.title, { color: C.text }]}>{t('새 버전이 있어요')}</Text>
        <TouchableOpacity style={[s.updateBtn, { backgroundColor: C.accent }]} onPress={onUpdate} activeOpacity={0.85} accessibilityRole="button">
          <Text style={[s.updateTxt, { color: C.onAccent }]}>{t('업데이트')}</Text>
        </TouchableOpacity>
        {!required && (
          <TouchableOpacity style={s.laterBtn} onPress={onLater} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }} accessibilityRole="button">
            <Text style={[s.laterTxt, { color: C.textSub }]}>{t('나중에')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 1000,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  card: { width: '100%', maxWidth: 360, borderRadius: 20, borderWidth: 1, paddingTop: 28, paddingBottom: 14, paddingHorizontal: 20, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 22 },
  updateBtn: { alignSelf: 'stretch', minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  updateTxt: { fontSize: 18, fontWeight: '700' },
  laterBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 16 },
  laterTxt: { fontSize: 13 },
});
