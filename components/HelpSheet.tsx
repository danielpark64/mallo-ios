// ─── 사용설명서 화면 ───────────────────────────────────────────────────────────
// 내용(lib/helpContent.ts)은 한국어 원문이고, 제목·문단을 t()로 감싸 영어 사전(en.help.ts)에서 번역을 찾는다.
import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type Palette } from '../lib/theme';
import { HELP_SECTIONS } from '../lib/helpContent';
import { useT } from '../lib/i18n';

export function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          <View style={s.navBar}>
            <TouchableOpacity style={s.navBtn} onPress={onClose}>
              <Text style={s.navCloseText}>{t('닫기')}</Text>
            </TouchableOpacity>
            <Text style={s.navTitle}>{t('사용설명서')}</Text>
            <View style={s.navBtn} />
          </View>
          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            <Text style={s.intro}>{t('세이람은 말로 적는 일정 · 알람 앱입니다. 마이크를 누르고 말하면 날짜와 시간을 알아듣고 일정으로 저장합니다.')}</Text>
            {HELP_SECTIONS.map((sec) => (
              <View key={sec.title} style={s.section}>
                <Text style={s.title}>{t(sec.title)}</Text>
                {sec.body.map((p, i) => (
                  <Text key={i} style={s.para}>{t(p)}</Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: 52, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  navBtn: { minWidth: 56, paddingHorizontal: 10, paddingVertical: 8 },
  navCloseText: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  navTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 48 },
  intro: { color: C.textSub, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  section: { backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  title: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  para: { color: C.textSub, fontSize: 14, lineHeight: 22, marginTop: 6 },
});
