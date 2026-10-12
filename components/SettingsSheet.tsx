// ─── 설정 화면 ─────────────────────────────────────────────────────────────────
// 달력 기본 보기, 백업 · 폰 옮기기, 사용설명서, 앱 정보를 한곳에 모은다.
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { C } from '../lib/colors';
import type { CalendarMode } from '../lib/prefs';
import type { ScheduleRecord } from '../lib/storage';
import { BackupSheet } from './BackupSheet';
import { HelpSheet } from './HelpSheet';

export function SettingsSheet({
  visible,
  records,
  calendarMode,
  onCalendarMode,
  onRestored,
  onClose,
}: {
  visible: boolean;
  records: ScheduleRecord[];
  calendarMode: CalendarMode;
  onCalendarMode: (m: CalendarMode) => void;
  onRestored: (records: ScheduleRecord[]) => void;
  onClose: () => void;
}) {
  const [backupOpen, setBackupOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const withAudio = records.filter((r) => r.uri).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          <View style={s.navBar}>
            <TouchableOpacity style={s.navBtn} onPress={onClose}>
              <Text style={s.navCloseText}>닫기</Text>
            </TouchableOpacity>
            <Text style={s.navTitle}>설정</Text>
            <View style={s.navBtn} />
          </View>

          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            <Text style={s.sectionLabel}>달력</Text>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>기본 보기</Text>
                  <Text style={s.rowSub}>앱을 열 때 달력을 어떻게 보여줄지</Text>
                </View>
                <View style={s.segment}>
                  {(['month', 'week'] as const).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[s.segBtn, calendarMode === m && s.segBtnOn]}
                      onPress={() => calendarMode !== m && onCalendarMode(m)}
                      accessibilityState={{ selected: calendarMode === m }}
                      accessibilityLabel={m === 'month' ? '월 보기' : '주 보기'}
                    >
                      <Text style={[s.segText, calendarMode === m && s.segTextOn]}>{m === 'month' ? '월' : '주'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={s.sectionLabel}>데이터</Text>
            <View style={s.card}>
              <TouchableOpacity style={s.rowBetween} onPress={() => setBackupOpen(true)} activeOpacity={0.7} accessibilityLabel="백업 · 폰 옮기기">
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>백업 · 폰 옮기기</Text>
                  <Text style={s.rowSub}>일정 {records.length}건 · 녹음 있는 일정 {withAudio}건</Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionLabel}>도움말</Text>
            <View style={s.card}>
              <TouchableOpacity style={s.rowBetween} onPress={() => setHelpOpen(true)} activeOpacity={0.7} accessibilityLabel="사용설명서">
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>사용설명서</Text>
                  <Text style={s.rowSub}>말하는 요령, 달력·찾기, 구간 재생, 알람, 백업</Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionLabel}>앱 정보</Text>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>버전</Text>
                <Text style={s.rowValue}>{version}</Text>
              </View>
              <View style={s.divider} />
              <Text style={s.note}>
                모든 녹음과 일정은 이 폰 안에만 저장되고 서버로 보내지 않습니다. 음성 인식은 기기의 음성 인식 기능을 사용합니다.
              </Text>
            </View>
          </ScrollView>

          <BackupSheet
            visible={backupOpen}
            records={records}
            onClose={() => setBackupOpen(false)}
            onRestored={onRestored}
          />
          <HelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />
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
  sectionLabel: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 6, marginBottom: 8 },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: C.border },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: C.textSub, fontSize: 12, marginTop: 3 },
  rowValue: { color: C.textSub, fontSize: 14 },
  chevron: { color: C.textSub, fontSize: 22, fontWeight: '300' },
  segment: { flexDirection: 'row', backgroundColor: C.surfaceHigh, borderRadius: 9, padding: 3 },
  segBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 7 },
  segBtnOn: { backgroundColor: C.accent },
  segText: { color: C.textSub, fontSize: 13, fontWeight: '700' },
  segTextOn: { color: '#fff' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  note: { color: C.textSub, fontSize: 13, lineHeight: 20 },
});
