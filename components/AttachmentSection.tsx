// ─── 일정 화면의 "사진·파일·메모" 칸 ───────────────────────────────────────────
// 작은 미리보기 줄 + [＋]. [＋]를 누르면 부모가 팝업(＋ 사진 · ＋ 파일 · 📋 붙여넣기)을 띄우고, 그 동작은 useAttachActions가 한다.
// 사진을 누르면 크게, 파일을 누르면 다른 앱(Android)·미리보기(iOS)로 연다.
// 붙여넣기는 누를 때만 클립보드를 읽는다: 이미지 → 사진, 주소 한 줄 → 링크(누르면 연다), 글 → 메모(누르면 펼친다).
// 길게 누르면 첨부를 뺀다(원본은 그대로). 원본이 지워졌으면 "원본 없음" 칸을 보여 준다.
// 미리보기는 메모리에서만 만들고 이 화면이 열려 있을 때만 갖고 있는다(저장 공간·부하 최소).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from './AppText';
import { useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import type { Attachment } from '../lib/storage';
import {
  MAX_ATTACHMENTS,
  addAttachments,
  attachSupported,
  attachmentExists,
  appFileName,
  formatSize,
  isMemo,
  loadImageOf,
  ocrSupported,
  openAttachment,
  photoAccess,
  pickAttachments,
  saveClipboardImage,
  thumbnailOf,
} from '../lib/attachments';
import { hasSameMemo, makeLinkAttachment, makeTextAttachment, readClipboard } from '../lib/clipImport';

type Thumb = { uri: string | null; missing: boolean };

/** 사진·파일 고르기와 붙여넣기 — 일정 화면의 첨부 팝업이 쓴다(저장·권한 반납은 onChange를 받은 부모가) */
export function useAttachActions(attachments: Attachment[], onChange: (next: Attachment[], removed: Attachment[]) => void) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // 한 프레임에 두 번 눌려도 선택기를 한 번만 연다
  const room = MAX_ATTACHMENTS - attachments.length;

  const add = async (kind: 'photo' | 'file') => {
    if (busyRef.current) return;
    if (room <= 0) {
      Alert.alert(t('첨부는 {n}개까지 붙일 수 있어요', { n: MAX_ATTACHMENTS }));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await pickAttachments(kind, room);
      if (r.denied) {
        Alert.alert(t('사진 접근 권한이 필요해요'), t('설정 › 세이람 › 사진에서 접근을 허용해 주세요. 사진은 복사하지 않고 위치만 저장해요.'));
        return;
      }
      if (r.hidden > 0) {
        if (Platform.OS === 'ios') Alert.alert(t('허용하지 않은 사진은 붙이지 못했어요'), t('설정 › 세이람 › 사진에서 그 사진도 허용해 주세요.'));
        else Alert.alert(t('{n}개는 붙이지 못했어요', { n: r.hidden }), t('이 항목은 앱을 다시 열면 읽을 수 없어서 뺐어요. 다른 위치에서 골라 주세요.'));
      }
      if (r.items.length) onChange(addAttachments(attachments, r.items), []);
    } catch {
      Alert.alert(t('첨부하지 못했어요'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // 복사한 것 붙이기 — 이 버튼을 누를 때만 클립보드를 읽는다
  const paste = async () => {
    if (busyRef.current) return;
    if (room <= 0) {
      Alert.alert(t('첨부는 {n}개까지 붙일 수 있어요', { n: MAX_ATTACHMENTS }));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const c = await readClipboard();
      if (c.kind === 'empty') { Alert.alert(t('복사한 내용이 없어요')); return; }
      if (c.kind === 'image') {
        const a = await saveClipboardImage();
        if (!a) { Alert.alert(t('첨부하지 못했어요')); return; }
        onChange(addAttachments(attachments, [a]), []);
        return;
      }
      const kind = c.kind === 'link' ? 'link' : 'text';
      const body = c.kind === 'link' ? c.url : c.text;
      if (hasSameMemo(attachments, kind, body)) { Alert.alert(t('이미 붙인 내용이에요')); return; }
      onChange(addAttachments(attachments, [kind === 'link' ? makeLinkAttachment(body) : makeTextAttachment(body)]), []);
    } catch {
      Alert.alert(t('첨부하지 못했어요'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { add, paste, busy };
}

export function AttachmentSection({ recordId, attachments, onChange, onMakeSchedule, onAddPress }: {
  recordId: string;
  /** [＋] 칸을 누르면 — 부모가 첨부 팝업을 연다. 없으면 [＋] 칸을 두지 않는다 */
  onAddPress?: () => void;
  attachments: Attachment[];
  /** 새 목록과 빠진 첨부 — 저장·권한 반납은 부모가 */
  onChange: (next: Attachment[], removed: Attachment[]) => void;
  /** 사진 크게 보기의 [📅 이 사진으로 일정 만들기] — 글자 인식·새 일정은 부모가 */
  onMakeSchedule?: (photo: Attachment) => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const [thumbs, setThumbs] = useState<Record<string, Thumb>>({});
  const [viewer, setViewer] = useState<{ a: Attachment; uri: string | null } | null>(null);
  const [memo, setMemo] = useState<Attachment | null>(null);

  // 보이는 첨부의 미리보기만 만든다(새로 붙은 것만 추가로)
  const refsKey = attachments.map((a) => a.ref).join('\n');
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const a of attachments) {
        if (!alive) return;
        if (thumbs[a.ref] || isMemo(a)) continue;
        const uri = await thumbnailOf(a);
        const missing = uri == null && !(await attachmentExists(a));
        if (alive) setThumbs((m) => ({ ...m, [a.ref]: { uri, missing } }));
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, refsKey]);
  // 다른 일정으로 넘어가면 부모가 key로 이 칸을 새로 만든다 → 미리보기도 새로(메모리)

  if (!attachSupported()) return null;
  // http/https 링크만 연다(다른 스킴은 열지 않는다)
  const openLink = async (url: string) => {
    if (!/^https?:\/\//i.test(url.trim())) { Alert.alert(t('이 링크를 열 수 없어요')); return; }
    try { await Linking.openURL(url.trim()); } catch { Alert.alert(t('이 링크를 열 수 없어요')); }
  };

  const remove = (a: Attachment) => {
    // 붙여넣은 이미지는 원본이 없고 파일을 지우니 그에 맞는 문구로
    const msg = appFileName(a.ref) ? t('붙여넣은 이미지를 지울까요?') : t('이 일정에서만 빠지고 원본 사진·파일은 그대로 있어요.');
    Alert.alert(t('첨부 빼기'), msg, [
      { text: t('취소'), style: 'cancel' },
      { text: t('빼기'), style: 'destructive', onPress: () => {
        if (viewer?.a.ref === a.ref) setViewer(null);
        if (memo?.ref === a.ref) setMemo(null);
        onChange(attachments.filter((x) => x.ref !== a.ref), [a]);
      } },
    ]);
  };

  const press = async (a: Attachment) => {
    if (a.kind === 'link') { if (a.text) openLink(a.text); return; }
    if (a.kind === 'text') { setMemo(a); return; }
    // iOS: 사진 접근을 끈 경우는 "지워졌어요"가 아니라 권한 안내
    if (a.ref.startsWith('ph:') && photoAccess() === 'denied') {
      Alert.alert(t('사진 접근 권한이 필요해요'), t('설정 › 세이람 › 사진에서 접근을 허용해 주세요. 사진은 복사하지 않고 위치만 저장해요.'));
      return;
    }
    if (thumbs[a.ref]?.missing) {
      Alert.alert(t('원본을 찾을 수 없어요'), t('사진·파일이 지워졌거나 옮겨졌어요. 길게 눌러 이 첨부를 뺄 수 있어요.'));
      return;
    }
    if (a.kind === 'photo') {
      setViewer({ a, uri: null });
      const uri = await loadImageOf(a);
      setViewer((v) => (v?.a.ref === a.ref ? { a, uri } : v));
      if (uri == null) {
        setViewer(null);
        Alert.alert(t('원본을 찾을 수 없어요'), t('사진·파일이 지워졌거나 옮겨졌어요. 길게 눌러 이 첨부를 뺄 수 있어요.'));
      }
      return;
    }
    if (!(await openAttachment(a))) Alert.alert(t('이 파일을 열 수 있는 앱이 없어요'));
  };

  return (
    <View>
      <Text style={s.label}>{t('사진·파일·메모')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} testID="attach-row">
        {attachments.map((a) => {
          const th = thumbs[a.ref];
          return (
            <Pressable
              key={a.ref}
              onPress={() => press(a)}
              onLongPress={() => remove(a)}
              delayLongPress={400}
              style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`${t(a.kind === 'photo' ? '사진' : a.kind === 'text' ? '메모' : a.kind === 'link' ? '링크' : '파일')} ${a.name}`}
              accessibilityHint={t('길게 누르면 첨부를 빼요')}
            >
              {isMemo(a) ? (
                <View style={s.fileBox}>
                  <Text style={s.fileIcon}>{a.kind === 'link' ? '🔗' : '📝'}</Text>
                  <Text style={s.fileName} numberOfLines={1}>{a.name || t(a.kind === 'link' ? '링크' : '메모')}</Text>
                </View>
              ) : th?.uri ? (
                <Image source={{ uri: th.uri }} style={s.thumb} />
              ) : th?.missing ? (
                <View style={s.fileBox}><Text style={s.missingText}>{t('원본 없음')}</Text></View>
              ) : a.kind === 'file' || th ? (
                <View style={s.fileBox}>
                  <Text style={s.fileIcon}>📄</Text>
                  <Text style={s.fileName} numberOfLines={1}>{a.name || t('파일')}</Text>
                </View>
              ) : (
                <View style={s.fileBox}><ActivityIndicator color={C.textSub} /></View>
              )}
            </Pressable>
          );
        })}
        {onAddPress ? (
          <TouchableOpacity
            style={s.addTile}
            onPress={onAddPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('사진·파일 붙이기')}
            testID="attach-add"
          >
            <Text style={s.addTileText}>＋</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* 사진 크게 보기 — 누르면 닫힌다 */}
      <Modal visible={viewer != null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={s.viewerBg} onPress={() => setViewer(null)} accessibilityRole="button" accessibilityLabel={t('닫기')}>
          {viewer?.uri ? (
            <Image source={{ uri: viewer.uri }} style={s.viewerImg} resizeMode="contain" />
          ) : (
            <ActivityIndicator color="#fff" size="large" />
          )}
          {viewer?.uri && onMakeSchedule && ocrSupported() ? (
            <TouchableOpacity
              style={s.viewerMake}
              onPress={() => { const a = viewer.a; setViewer(null); onMakeSchedule(a); }}
              accessibilityRole="button"
              testID="photo-make-schedule"
            >
              <Text style={s.viewerMakeText}>{t('📅 이 사진으로 일정 만들기')}</Text>
            </TouchableOpacity>
          ) : null}
          {viewer ? (
            <View style={s.viewerBar}>
              <Text style={s.viewerName} numberOfLines={1}>{viewer.a.name}{viewer.a.size ? `  ·  ${formatSize(viewer.a.size)}` : ''}</Text>
              <Text style={s.viewerClose}>{t('닫기')}</Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>

      {/* 메모 펼쳐 보기 — 글은 고를 수 있고 [복사]로 다시 복사할 수 있다 */}
      <Modal visible={memo != null} transparent animationType="fade" onRequestClose={() => setMemo(null)}>
        <View style={s.memoBg}>
          <View style={s.memoCard}>
            <Text style={s.memoTitle}>{t('메모')}</Text>
            <ScrollView style={s.memoScroll}>
              <Text style={s.memoText} selectable>{memo?.text ?? ''}</Text>
            </ScrollView>
            <View style={s.memoBtnRow}>
              <TouchableOpacity
                style={s.addBtn}
                onPress={async () => { try { await Clipboard.setStringAsync(memo?.text ?? ''); Alert.alert(t('복사했어요')); } catch {} }}
                accessibilityRole="button"
              >
                <Text style={s.addBtnText}>{t('복사')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.addBtn, s.memoClose]} onPress={() => setMemo(null)} accessibilityRole="button">
                <Text style={s.addBtnText}>{t('닫기')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const TILE = 60;
const makeStyles = (C: Palette) => StyleSheet.create({
  label: { color: C.textSub, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  row: { gap: 8, paddingBottom: 4 },
  tile: { width: TILE },
  thumb: { width: TILE, height: TILE, borderRadius: 12, backgroundColor: C.surface },
  fileBox: {
    width: TILE, height: TILE, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', padding: 6,
  },
  fileIcon: { fontSize: 20 },
  fileName: { color: C.textSub, fontSize: 10, textAlign: 'center', marginTop: 1 },
  missingText: { color: C.textSub, fontSize: 10, textAlign: 'center' },
  addTile: {
    width: TILE, height: TILE, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.accent,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface,
  },
  addTileText: { color: C.accent, fontSize: 24, fontWeight: '800' },
  addBtn: {
    paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  addBtnText: { color: C.text, fontSize: 14, fontWeight: '700' },
  viewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '82%' },
  viewerBar: {
    position: 'absolute', left: 0, right: 0, bottom: Platform.OS === 'ios' ? 40 : 64,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12,
  },
  viewerName: { flex: 1, color: '#ddd', fontSize: 13 },
  viewerClose: { color: '#fff', fontSize: 16, fontWeight: '700' },
  viewerMake: {
    position: 'absolute', top: Platform.OS === 'ios' ? 64 : 40, alignSelf: 'center',
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: C.accent,
  },
  viewerMakeText: { color: C.onAccent, fontSize: 15, fontWeight: '700' },
  memoBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  memoCard: { backgroundColor: C.bg, borderRadius: 16, padding: 18, maxHeight: '80%' },
  memoTitle: { color: C.accent, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  memoScroll: { flexGrow: 0 },
  memoText: { color: C.text, fontSize: 16, lineHeight: 23 },
  memoBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  memoClose: { minWidth: 72, alignItems: 'center' },
});
