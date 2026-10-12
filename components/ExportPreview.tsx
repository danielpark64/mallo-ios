// ─── 내보내기 미리보기 (텍스트 / PDF) ──────────────────────────────────────────
// 변환된 결과를 먼저 보여주고, 그 화면에서 내보내기(공유 시트)·복사를 고른다.
// PDF는 실제 PDF와 같은 내용·배치를 흰 종이 느낌의 카드로 그려 보여준다.
import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { copyRecords, docSubtitle, exportRecordsPdf, exportRecordsTxt, recordRows, recordsToText } from '../lib/exportUtils';
import type { ScheduleRecord } from '../lib/storage';

export type ExportKind = 'txt' | 'pdf';

export function ExportPreview({
  visible,
  kind,
  records,
  onClose,
}: {
  visible: boolean;
  kind: ExportKind;
  records: ScheduleRecord[];
  onClose: () => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  // Modal을 계속 마운트해 둬야 닫힐 때도 slide 애니메이션이 나온다. 본문은 visible일 때만 계산.
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          <View style={s.navBar}>
            <TouchableOpacity style={s.navBtn} onPress={onClose}>
              <Text style={s.navCloseText}>{t('닫기')}</Text>
            </TouchableOpacity>
            <Text style={s.navTitle}>{t(kind === 'pdf' ? 'PDF 미리보기' : '텍스트 미리보기')}</Text>
            <View style={s.navBtn} />
          </View>

          {visible && <PreviewBody kind={kind} records={records} />}

          <View style={s.bottomBar}>
            {kind === 'txt' && (
              <TouchableOpacity style={s.secondaryBtn} onPress={() => copyRecords(records)} activeOpacity={0.8}>
                <Text style={s.secondaryBtnText}>{t('복사')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={async () => {
                // 공유 시트가 닫히면 미리보기도 닫는다 (한 번 내보내면 할 일이 끝난 경우가 대부분)
                await (kind === 'pdf' ? exportRecordsPdf(records) : exportRecordsTxt(records));
                onClose();
              }}
              activeOpacity={0.85}
              accessibilityLabel={t('내보내기')}
            >
              <Text style={s.primaryBtnText}>{t(kind === 'pdf' ? 'PDF로 내보내기' : '텍스트로 내보내기')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function PreviewBody({ kind, records }: { kind: ExportKind; records: ScheduleRecord[] }) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const text = useMemo(() => (kind === 'txt' ? recordsToText(records) : ''), [kind, records]);
  const rows = useMemo(() => (kind === 'pdf' ? recordRows(records) : []), [kind, records]);

  if (kind === 'txt') {
    return (
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.countLine}>{t('일정 {n}건', { n: records.length })}</Text>
        <View style={s.txtBox}>
          <Text style={s.txtText} selectable>{text}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Text style={s.countLine}>{t('일정 {n}건 · 아래 모양 그대로 PDF가 만들어져요', { n: records.length })}</Text>
      <View style={s.page}>
        <Text style={s.pageTitle}>{t('세이람 일정')}</Text>
        <Text style={s.pageSub}>{docSubtitle(records.length)}</Text>
        {rows.map((row, i) => (
          <View key={i} style={[s.pageRow, i === rows.length - 1 && s.pageRowLast]}>
            <Text style={s.pageWhen}>{row.when}</Text>
            <View style={s.pageBody}>
              <Text style={s.pageMain}>{row.main}</Text>
              {row.notes.map((n, j) => (
                <Text key={j} style={s.pageNote}>• {n}</Text>
              ))}
            </View>
          </View>
        ))}
        {rows.length === 0 && <Text style={s.pageEmpty}>{t('내보낼 일정이 없어요')}</Text>}
      </View>
    </ScrollView>
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

  body: { padding: 20, paddingBottom: 32 },
  countLine: { color: C.textSub, fontSize: 13, fontWeight: '600', marginBottom: 12 },

  // 텍스트 미리보기
  txtBox: { backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  txtText: { color: C.text, fontSize: 15, lineHeight: 24 },

  // PDF 미리보기 — 흰 종이
  page: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 22 },
  pageTitle: { color: '#111', fontSize: 20, fontWeight: '700' },
  pageSub: { color: '#666', fontSize: 12, marginTop: 4, marginBottom: 14 },
  pageRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#DDD', gap: 14 },
  pageRowLast: { borderBottomWidth: 0 },
  pageWhen: { color: '#1A56C4', fontSize: 13, fontWeight: '600', width: 118 },
  pageBody: { flex: 1 },
  pageMain: { color: '#111', fontSize: 14, lineHeight: 21 },
  pageNote: { color: '#555', fontSize: 13, lineHeight: 20, marginTop: 4 },
  pageEmpty: { color: '#888', fontSize: 14, textAlign: 'center', paddingVertical: 24 },

  bottomBar: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  secondaryBtn: {
    flex: 1, height: 52, borderRadius: 14, backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { color: C.text, fontSize: 16, fontWeight: '600' },
  primaryBtn: {
    flex: 2, height: 52, borderRadius: 14, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
