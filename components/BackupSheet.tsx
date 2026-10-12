// ─── 백업 · 폰 옮기기 화면 ───────────────────────────────────────────────────────
// 백업 만들기(일정 + 모든 녹음을 한 폴더로), 백업 목록에서 복원/삭제.
// iOS는 파일 앱에 폴더가 그대로 보이고, Android는 고른 폴더로 내보내기/가져오기.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../lib/colors';
import {
  createBackup,
  deleteBackup,
  exportBackupToFolderAndroid,
  importBackupFromFolderAndroid,
  listBackups,
  restoreBackup,
  type BackupInfo,
  type RestoreResult,
} from '../lib/backup';
import type { ScheduleRecord } from '../lib/storage';

function fmt(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function BackupSheet({
  visible,
  records,
  onClose,
  onRestored,
}: {
  visible: boolean;
  records: ScheduleRecord[];
  onClose: () => void;
  /** 복원으로 합쳐진 새 목록 */
  onRestored: (records: ScheduleRecord[]) => void;
}) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    try { setBackups(listBackups()); } catch { setBackups([]); }
  }, []);
  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);

  const reportRestore = (r: RestoreResult) => {
    onRestored(r.records);
    refresh();
    const audioNote = r.missingAudio ? `\n녹음 파일 ${r.missingAudio}개는 백업에 없어 건너뛰었어요.` : '';
    Alert.alert('복원 완료', `일정 ${r.added}건을 추가했어요. 이미 있던 ${r.skipped}건은 그대로 두었어요.${audioNote}`);
  };

  const makeBackup = () => {
    try {
      const b = createBackup(records);
      refresh();
      Alert.alert('백업 완료', `일정 ${b.count}건, 녹음 ${b.audioFiles}개를 저장했어요.\n${b.name}`);
    } catch (e) {
      Alert.alert('백업 실패', String(e));
    }
  };

  const restore = (b: BackupInfo) => {
    Alert.alert('복원할까요?', `${fmt(b.createdAt)} 백업 (일정 ${b.count}건)\n지금 있는 일정은 지우지 않고, 없는 것만 더해요.`, [
      { text: '취소', style: 'cancel' },
      { text: '복원', onPress: () => {
        try { reportRestore(restoreBackup(b.uri, records)); }
        catch (e) { Alert.alert('복원 실패', String(e)); }
      } },
    ]);
  };

  const remove = (b: BackupInfo) => {
    Alert.alert('백업 삭제', `${fmt(b.createdAt)} 백업을 지울까요? 되돌릴 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { try { deleteBackup(b.uri); } catch {} refresh(); } },
    ]);
  };

  const exportAndroid = async () => {
    setBusy(true);
    try {
      const b = await exportBackupToFolderAndroid(records);
      if (b) Alert.alert('내보내기 완료', `고른 폴더에 "${b.name}"을 만들었어요.\n일정 ${b.count}건, 녹음 ${b.audioFiles}개`);
    } catch (e) { Alert.alert('내보내기 실패', String(e)); }
    finally { setBusy(false); }
  };
  const importAndroid = async () => {
    setBusy(true);
    try {
      const r = await importBackupFromFolderAndroid(records);
      if (r) reportRestore(r);
    } catch (e) { Alert.alert('가져오기 실패', String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          <View style={s.navBar}>
            <TouchableOpacity style={s.navBtn} onPress={onClose}>
              <Text style={s.navCloseText}>닫기</Text>
            </TouchableOpacity>
            <Text style={s.navTitle}>백업 · 폰 옮기기</Text>
            <View style={s.navBtn} />
          </View>

          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            <Text style={s.lead}>
              일정 {records.length}건과 녹음 파일을 통째로 한 폴더에 모아 둡니다. 폰을 바꾸거나 앱을 다시 설치해도 이 폴더만 있으면 그대로 되살릴 수 있어요.
            </Text>

            <TouchableOpacity style={s.primaryBtn} onPress={makeBackup} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>지금 백업 만들기</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' ? (
              <View style={s.hintBox}>
                <Text style={s.hintTitle}>다른 폰으로 옮기려면</Text>
                <Text style={s.hintText}>
                  1. 파일 앱 › 나의 iPhone › 말로 › mallo-backups 폴더에서 백업 폴더를 iCloud Drive나 컴퓨터로 복사해 두세요.{'\n'}
                  2. 새 폰에서 같은 자리(나의 iPhone › 말로 › mallo-backups)에 그 폴더를 넣고, 이 화면의 목록에서 복원을 누르세요.
                </Text>
              </View>
            ) : (
              <View style={s.hintBox}>
                <Text style={s.hintTitle}>다른 폰으로 옮기려면</Text>
                <Text style={s.hintText}>
                  드라이브·다운로드 같은 폴더로 내보내 두고, 새 폰에서 그 폴더를 골라 가져오세요.
                </Text>
                <View style={s.row}>
                  <TouchableOpacity style={[s.secondaryBtn, busy && s.disabled]} onPress={exportAndroid} disabled={busy} activeOpacity={0.8}>
                    <Text style={s.secondaryBtnText}>폴더로 내보내기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.secondaryBtn, busy && s.disabled]} onPress={importAndroid} disabled={busy} activeOpacity={0.8}>
                    <Text style={s.secondaryBtnText}>폴더에서 가져오기</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={s.sectionLabel}>이 폰에 있는 백업</Text>
            {backups.length === 0 ? (
              <Text style={s.empty}>아직 백업이 없어요</Text>
            ) : (
              backups.map((b) => (
                <View key={b.uri} style={s.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemTitle}>{fmt(b.createdAt) || b.name}</Text>
                    <Text style={s.itemSub}>일정 {b.count}건 · 녹음 {b.audioFiles}개</Text>
                  </View>
                  <TouchableOpacity style={s.itemBtn} onPress={() => restore(b)} accessibilityLabel={`${b.name} 복원`}>
                    <Text style={s.itemBtnText}>복원</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.itemDel} onPress={() => remove(b)} accessibilityLabel={`${b.name} 삭제`}>
                    <Text style={s.itemDelText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: 52, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  navBtn: { minWidth: 56, paddingHorizontal: 10, paddingVertical: 8 },
  navCloseText: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  navTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 40 },
  lead: { color: C.textSub, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hintBox: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: C.border, gap: 8 },
  hintTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  hintText: { color: C.textSub, fontSize: 13, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  secondaryBtn: { flex: 1, backgroundColor: C.surfaceHigh, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  sectionLabel: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  empty: { color: C.textDim, fontSize: 14, paddingVertical: 12 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  itemTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  itemSub: { color: C.textSub, fontSize: 12, marginTop: 2 },
  itemBtn: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  itemBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  itemDel: { paddingHorizontal: 8, paddingVertical: 8 },
  itemDelText: { color: C.textSub, fontSize: 13, fontWeight: '600' },
});
