// 개발자 응원하기(계좌 후원 안내) — 홍보 배너의 "개발자 응원하기"에서만 열린다. 교대알람의 후원 화면과 같은 구성.
import { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Text } from './AppText';
import { useT } from '../lib/i18n';
import { SUPPORT_ACCOUNT } from '../lib/promo';
import { useTheme, type Palette } from '../lib/theme';

export function SupportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  // 계좌번호는 은행 앱에 붙여넣어야 하므로 한 번에 복사한다. 확인 창 대신 버튼 글자를 잠깐 바꿔 알린다.
  const handleCopy = async () => {
    try { await Clipboard.setStringAsync(SUPPORT_ACCOUNT.number); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Modal은 별도 창이라 바깥 SafeAreaProvider의 인셋이 전달되지 않는다 → 안쪽에 따로 둔다 */}
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          <View style={s.navBar}>
            <TouchableOpacity style={s.navBtn} onPress={onClose} accessibilityRole="button">
              <Text style={s.navCloseText}>{t('닫기')}</Text>
            </TouchableOpacity>
            <Text style={s.navTitle}>{t('개발자 응원하기')}</Text>
            <View style={s.navBtn} />
          </View>
          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            <Text style={s.emoji}>💜</Text>
            <Text style={s.desc}>{t('세이람이 마음에 드셨다면\n아래 계좌로 작은 후원을 보내주세요\n큰 힘이 됩니다 🙏')}</Text>
            <View style={s.card}>
              <Text style={s.bank}>{SUPPORT_ACCOUNT.bank}</Text>
              <Text style={s.number} selectable>{SUPPORT_ACCOUNT.number}</Text>
              <Text style={s.holder}>{t('예금주 {name}', { name: SUPPORT_ACCOUNT.holder })}</Text>
              <TouchableOpacity style={[s.copyBtn, copied && s.copyBtnDone]} onPress={handleCopy} activeOpacity={0.8} accessibilityRole="button">
                <Text style={s.copyBtnText}>{t(copied ? '✓ 복사됐어요' : '계좌번호 복사')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.note}>{t('자발적인 후원이며, 앱 이용에는 아무 영향이 없어요')}</Text>
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
  navBtn: { paddingHorizontal: 10, paddingVertical: 8, minWidth: 56 },
  navCloseText: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  navTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  body: { alignItems: 'center', padding: 28, paddingBottom: 60 },
  emoji: { fontSize: 56, marginBottom: 14 },
  desc: { color: C.textSub, fontSize: 15, lineHeight: 24, textAlign: 'center', marginBottom: 28 },
  card: {
    width: '100%', maxWidth: 440, alignItems: 'center', padding: 22,
    backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border,
  },
  bank: { color: C.textSub, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  number: { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: 0.5, marginBottom: 6 },
  holder: { color: C.textSub, fontSize: 13, fontWeight: '600', marginBottom: 18 },
  copyBtn: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: C.accent, paddingVertical: 13, borderRadius: 14 },
  copyBtnDone: { backgroundColor: C.green },
  copyBtnText: { color: C.onAccent, fontSize: 15, fontWeight: '800' },
  note: { color: C.textDim, fontSize: 12, marginTop: 22, textAlign: 'center' },
});
