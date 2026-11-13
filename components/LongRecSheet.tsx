// [LONGREC 시험판] 긴 녹음 — 회의·강의를 녹음하면서 글로 받아 적고, 텍스트·PDF로 내보낸다.
// 설정 › 긴 녹음(시험판)에서만 열린다. 시험판이라 화면 글은 한국어만 있다(정식으로 넣을 때 9개 언어로 옮긴다).
// 화면 셋: 목록 → 녹음 중 → 녹음 하나 보기(다시 듣기·고치기·내보내기)
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Platform, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Text } from './AppText';
import { pauseIfPlaying } from '../lib/audioPause';
import {
  audioSizeMb, defaultTitle, deleteLongAudio, keepLongAudio, loadLongRecs, saveLongRecs,
  shareLongAudio, shareLongPdf, shareLongText, whenLabel, type LongRec,
} from '../lib/longRec';
import { charCount, clock, type LongPara } from '../lib/longTranscript';
import { sttBlockedNotice } from '../lib/sttErrors';
import { useTheme, type Palette } from '../lib/theme';
import { onDeviceSupported, useLongRecorder } from '../lib/useLongRecorder';

export function LongRecSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [list, setList] = useState<LongRec[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canOnDevice = useMemo(() => onDeviceSupported(), []);
  const [onDevice, setOnDevice] = useState(canOnDevice);
  const rec = useLongRecorder();
  const liveRef = useRef<FlatList<LongPara>>(null);

  useEffect(() => { if (visible) setList(loadLongRecs()); }, [visible]);

  const update = (next: LongRec[]) => { setList(next); saveLongRecs(next); };
  const open = list.find((r) => r.id === openId) ?? null;

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await rec.start({ onDevice: canOnDevice && onDevice });
    } catch (e) {
      Alert.alert('녹음을 시작하지 못했어요', String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await rec.stop();
      const id = Date.now().toString(36);
      const createdAt = Date.now() - result.durationSec * 1000;
      const uri = result.uri ? keepLongAudio(result.uri, id) : '';
      if (!uri && !result.paras.length) {
        Alert.alert('저장할 내용이 없어요', '녹음도 글도 남지 않았어요.');
        return;
      }
      const item: LongRec = {
        id, title: defaultTitle(createdAt), createdAt, durationSec: result.durationSec,
        uri, paras: result.paras, onDevice: canOnDevice && onDevice,
      };
      update([item, ...list]);
      setOpenId(id);
      // 시험판: 끊김이 얼마나 잦았는지 바로 알려 준다
      Alert.alert('저장했어요', `길이 ${clock(result.durationSec * 1000)} · 글 ${charCount(result.paras)}자\n받아쓰기가 다시 연결된 횟수: ${result.restarts}번`);
    } catch (e) {
      Alert.alert('저장하지 못했어요', String(e));
    } finally {
      setBusy(false);
    }
  };

  const askClose = () => {
    if (!rec.recording) { setOpenId(null); onClose(); return; }
    Alert.alert('녹음 중이에요', '녹음을 끝내고 저장할까요?', [
      { text: '계속 녹음', style: 'cancel' },
      // 닫으려던 것이므로 저장한 뒤 화면까지 닫는다(저장 결과 알림은 그대로 뜬다)
      { text: '끝내고 저장', onPress: async () => { await handleStop(); setOpenId(null); onClose(); } },
    ]);
  };

  const handleDelete = (r: LongRec) => {
    Alert.alert('이 녹음을 지울까요?', '녹음 파일과 글이 모두 지워지고 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기', style: 'destructive',
        onPress: () => { deleteLongAudio(r.uri); update(list.filter((x) => x.id !== r.id)); setOpenId(null); },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={askClose}>
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          {rec.recording ? (
            <>
              <View style={s.navBar}>
                <View style={s.navBtn} />
                <Text style={s.navTitle}>녹음 중</Text>
                <View style={s.navBtn} />
              </View>
              <View style={s.recHead}>
                <View style={s.recRow}>
                  <View style={s.dot} />
                  <Text style={s.timer}>{clock(rec.elapsedMs)}</Text>
                </View>
                <Text style={s.recSub}>
                  {!rec.canStt
                    ? '이 폰에서는 녹음만 돼요(받아쓰기 없음)'
                    : rec.sttBlocked
                      ? sttBlockedNotice(Platform.OS)
                      : rec.listening ? '받아 적는 중' : '받아쓰기 연결 중…'}
                </Text>
                <Text style={s.recInfo}>글 {charCount(rec.paras)}자 · 다시 연결 {rec.restarts}번 · 화면은 켜 둡니다</Text>
              </View>
              <FlatList
                ref={liveRef}
                style={s.flex}
                contentContainerStyle={s.paraList}
                data={rec.paras}
                keyExtractor={(p, i) => `${i}-${p.atMs}`}
                onContentSizeChange={() => liveRef.current?.scrollToEnd({ animated: false })}
                renderItem={({ item }) => (
                  <View style={s.para}>
                    <Text style={s.paraTime}>{clock(item.atMs)}</Text>
                    <Text style={s.paraText}>{item.text}</Text>
                  </View>
                )}
                ListEmptyComponent={<Text style={s.empty}>말소리가 들리면 여기에 글이 쌓여요</Text>}
              />
              <View style={s.footer}>
                <TouchableOpacity style={[s.bigBtn, s.stopBtn]} onPress={handleStop} disabled={busy} activeOpacity={0.8} accessibilityRole="button">
                  <Text style={s.bigBtnText}>{busy ? '저장하는 중…' : '끝내고 저장'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : open ? (
            <LongRecDetail
              key={open.id}
              rec={open}
              onBack={() => setOpenId(null)}
              onChange={(next) => update(list.map((x) => (x.id === next.id ? next : x)))}
              onDelete={() => handleDelete(open)}
            />
          ) : (
            <>
              <View style={s.navBar}>
                <TouchableOpacity style={s.navBtn} onPress={askClose} accessibilityRole="button">
                  <Text style={s.navSide}>닫기</Text>
                </TouchableOpacity>
                <Text style={s.navTitle}>긴 녹음 (시험판)</Text>
                <View style={s.navBtn} />
              </View>
              <FlatList
                style={s.flex}
                contentContainerStyle={s.listBody}
                data={list}
                keyExtractor={(r) => r.id}
                ListHeaderComponent={
                  <View style={s.card}>
                    <Text style={s.cardTitle}>회의·강의 녹음</Text>
                    <Text style={s.cardSub}>녹음하면서 말을 글로 받아 적어요. 끝나면 텍스트나 PDF로 내보낼 수 있어요.</Text>
                    {canOnDevice && (
                      <View style={s.switchRow}>
                        <View style={s.flex}>
                          <Text style={s.switchTitle}>폰 안에서만 받아쓰기</Text>
                          <Text style={s.switchSub}>
                            {onDevice ? '소리가 폰 밖으로 나가지 않고, 중간에 덜 끊겨요' : '인터넷으로 받아써요. 약 1분마다 다시 연결돼요'}
                          </Text>
                        </View>
                        <Switch value={onDevice} onValueChange={setOnDevice} />
                      </View>
                    )}
                    <TouchableOpacity style={s.bigBtn} onPress={handleStart} disabled={busy} activeOpacity={0.8} accessibilityRole="button">
                      <Text style={s.bigBtnText}>{busy ? '준비하는 중…' : '녹음 시작'}</Text>
                    </TouchableOpacity>
                    <Text style={s.cardNote}>녹음하는 동안 화면이 켜져 있어요. 1시간에 저장 공간 약 14MB를 써요.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.item} onPress={() => setOpenId(item.id)} activeOpacity={0.7} accessibilityRole="button">
                    <View style={s.flex}>
                      <Text style={s.itemTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={s.itemSub}>
                        {whenLabel(item.createdAt)} · {clock(item.durationSec * 1000)} · 글 {charCount(item.paras)}자
                      </Text>
                    </View>
                    <Text style={s.chevron}>›</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={s.empty}>아직 녹음이 없어요</Text>}
              />
            </>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/** 녹음 하나 보기 — 다시 듣기(문단을 누르면 그 자리부터), 글 고치기, 내보내기 */
function LongRecDetail({
  rec, onBack, onChange, onDelete,
}: { rec: LongRec; onBack: () => void; onChange: (r: LongRec) => void; onDelete: () => void }) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const player = useAudioPlayer(rec.uri || undefined, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(rec.title);
  const [texts, setTexts] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const sizeMb = useMemo(() => audioSizeMb(rec.uri), [rec.uri]);
  const posMs = (status.currentTime ?? 0) * 1000;
  // 지금 재생 중인 문단: 시작 시각이 재생 위치보다 앞선 마지막 문단
  let playingIdx = -1;
  if (status.playing) rec.paras.forEach((p, i) => { if (p.atMs <= posMs + 300) playingIdx = i; });

  const playFrom = async (ms: number | null) => {
    if (!rec.uri || editing) return;
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      if (ms != null) await player.seekTo(ms / 1000);
      player.play();
    } catch (e) {
      Alert.alert('재생하지 못했어요', String(e));
    }
  };
  const toggle = () => { if (status.playing) pauseIfPlaying(player, true); else playFrom(null); };

  const startEdit = () => {
    pauseIfPlaying(player);
    setTexts(rec.paras.map((p) => p.text));
    setTitle(rec.title);
    setEditing(true);
  };
  const finishEdit = () => {
    // 비운 문단은 지운다
    const paras = rec.paras
      .map((p, i) => ({ ...p, text: (texts[i] ?? p.text).trim() }))
      .filter((p) => p.text);
    onChange({ ...rec, title: title.trim() || rec.title, paras });
    setEditing(false);
  };

  const share = async (kind: 'txt' | 'pdf' | 'audio') => {
    if (sharing) return;
    setSharing(true);
    try {
      pauseIfPlaying(player);
      if (kind === 'txt') await shareLongText(rec);
      else if (kind === 'pdf') await shareLongPdf(rec);
      else await shareLongAudio(rec);
    } catch (e) {
      Alert.alert('내보내지 못했어요', String(e));
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <View style={s.navBar}>
        <TouchableOpacity style={s.navBtn} onPress={editing ? () => setEditing(false) : onBack} accessibilityRole="button">
          <Text style={s.navSide}>{editing ? '취소' : '‹ 목록'}</Text>
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{editing ? '고치기' : '녹음'}</Text>
        <TouchableOpacity style={[s.navBtn, s.navRight]} onPress={editing ? finishEdit : startEdit} accessibilityRole="button">
          <Text style={s.navAction}>{editing ? '완료' : '고치기'}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.detailHead}>
        {editing ? (
          <TextInput style={s.titleInput} value={title} onChangeText={setTitle} placeholder="제목" placeholderTextColor={C.textDim} />
        ) : (
          <Text style={s.detailTitle}>{rec.title}</Text>
        )}
        <Text style={s.itemSub}>
          {whenLabel(rec.createdAt)} · {clock(rec.durationSec * 1000)} · 글 {charCount(rec.paras)}자
          {sizeMb != null ? ` · ${sizeMb}MB` : ''}{rec.onDevice ? ' · 폰 안 인식' : ''}
        </Text>
        {!!rec.uri && !editing && (
          <View style={s.playRow}>
            <TouchableOpacity style={s.playBtn} onPress={toggle} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={status.playing ? '멈춤' : '재생'}>
              <Text style={s.playBtnText}>{status.playing ? '❚❚' : '▶'}</Text>
            </TouchableOpacity>
            <Text style={s.playTime}>{clock(posMs)} / {clock(rec.durationSec * 1000)}</Text>
            <Text style={s.playHint}>문단을 누르면 그 자리부터 들려요</Text>
          </View>
        )}
        {!rec.uri && <Text style={s.cardNote}>녹음 파일이 없어요(글만 저장됨)</Text>}
      </View>
      <FlatList
        style={s.flex}
        contentContainerStyle={s.paraList}
        data={rec.paras}
        keyExtractor={(p, i) => `${i}-${p.atMs}`}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        renderItem={({ item, index }) => (
          editing ? (
            <View style={s.para}>
              <Text style={s.paraTime}>{clock(item.atMs)}</Text>
              <TextInput
                style={s.paraInput}
                multiline
                value={texts[index] ?? ''}
                onChangeText={(v) => setTexts((prev) => { const next = [...prev]; next[index] = v; return next; })}
              />
            </View>
          ) : (
            <TouchableOpacity style={s.para} onPress={() => playFrom(item.atMs)} activeOpacity={0.6} disabled={!rec.uri}>
              <Text style={[s.paraTime, index === playingIdx && s.paraTimeOn]}>{clock(item.atMs)}</Text>
              <Text style={[s.paraText, index === playingIdx && s.paraTextOn]}>{item.text}</Text>
            </TouchableOpacity>
          )
        )}
        ListEmptyComponent={<Text style={s.empty}>받아 적은 글이 없어요</Text>}
      />
      {!editing && (
        <View style={s.footer}>
          <View style={s.shareRow}>
            <TouchableOpacity style={s.shareBtn} onPress={() => share('txt')} disabled={sharing} activeOpacity={0.8} accessibilityRole="button">
              <Text style={s.shareBtnText}>텍스트</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shareBtn} onPress={() => share('pdf')} disabled={sharing} activeOpacity={0.8} accessibilityRole="button">
              <Text style={s.shareBtnText}>PDF</Text>
            </TouchableOpacity>
            {!!rec.uri && (
              <TouchableOpacity style={s.shareBtn} onPress={() => share('audio')} disabled={sharing} activeOpacity={0.8} accessibilityRole="button">
                <Text style={s.shareBtnText}>녹음 파일</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={s.deleteBtn} onPress={onDelete} accessibilityRole="button">
            <Text style={s.deleteText}>이 녹음 지우기</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: 52, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 8, minWidth: 72 },
  navRight: { alignItems: 'flex-end' },
  navSide: { color: C.textSub, fontSize: 16, fontWeight: '600' },
  navAction: { color: C.accent, fontSize: 16, fontWeight: '700' },
  navTitle: { color: C.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  listBody: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 18 },
  cardTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  cardSub: { color: C.textSub, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  cardNote: { color: C.textSub, fontSize: 12, lineHeight: 18, marginTop: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  switchTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  switchSub: { color: C.textSub, fontSize: 12, lineHeight: 18, marginTop: 2 },
  bigBtn: { alignItems: 'center', backgroundColor: C.accent, paddingVertical: 15, borderRadius: 14 },
  stopBtn: { backgroundColor: C.red },
  bigBtnText: { color: C.onAccent, fontSize: 16, fontWeight: '800' },
  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10,
  },
  itemTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  itemSub: { color: C.textSub, fontSize: 12, lineHeight: 18 },
  chevron: { color: C.textSub, fontSize: 22, marginLeft: 8 },
  empty: { color: C.textSub, fontSize: 14, textAlign: 'center', marginTop: 28 },
  recHead: { alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.border },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.red },
  timer: { color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recSub: { color: C.textSub, fontSize: 14, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
  recInfo: { color: C.textSub, fontSize: 12, marginTop: 6 },
  paraList: { padding: 16, paddingBottom: 24 },
  para: { flexDirection: 'row', marginBottom: 14 },
  paraTime: { width: 54, color: C.textSub, fontSize: 12, fontWeight: '700', paddingTop: 3, fontVariant: ['tabular-nums'] },
  paraTimeOn: { color: C.accent },
  paraText: { flex: 1, color: C.text, fontSize: 16, lineHeight: 25 },
  paraTextOn: { color: C.accent },
  paraInput: {
    flex: 1, color: C.text, fontSize: 16, lineHeight: 23, backgroundColor: C.surface,
    borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 8,
  },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.border },
  detailHead: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  detailTitle: { color: C.text, fontSize: 19, fontWeight: '800', marginBottom: 4 },
  titleInput: {
    color: C.text, fontSize: 18, fontWeight: '700', backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6,
  },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  playBtnText: { color: C.onAccent, fontSize: 16, fontWeight: '800' },
  playTime: { color: C.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  playHint: { flex: 1, color: C.textSub, fontSize: 12 },
  shareRow: { flexDirection: 'row', gap: 10 },
  shareBtn: { flex: 1, alignItems: 'center', backgroundColor: C.surfaceHigh, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  shareBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  deleteText: { color: C.red, fontSize: 14, fontWeight: '600' },
});
