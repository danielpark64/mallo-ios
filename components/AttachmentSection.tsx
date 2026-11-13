// ─── 일정 상세의 "사진·파일" 칸 ────────────────────────────────────────────────
// 작은 미리보기 줄 + [＋ 사진] [＋ 파일]. 사진을 누르면 크게, 파일을 누르면 다른 앱(Android)·미리보기(iOS)로 연다.
// 길게 누르면 첨부를 뺀다(원본은 그대로). 원본이 지워졌으면 "원본 없음" 칸을 보여 준다.
// 미리보기는 메모리에서만 만들고 이 화면이 열려 있을 때만 갖고 있는다(저장 공간·부하 최소).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import type { Attachment } from '../lib/storage';
import {
  MAX_ATTACHMENTS,
  addAttachments,
  attachSupported,
  attachmentExists,
  formatSize,
  loadImageOf,
  openAttachment,
  photoAccess,
  pickAttachments,
  thumbnailOf,
} from '../lib/attachments';

type Thumb = { uri: string | null; missing: boolean };

export function AttachmentSection({ recordId, attachments, onChange }: {
  recordId: string;
  attachments: Attachment[];
  /** 새 목록과 빠진 첨부 — 저장·권한 반납은 부모가 */
  onChange: (next: Attachment[], removed: Attachment[]) => void;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const [thumbs, setThumbs] = useState<Record<string, Thumb>>({});
  const [viewer, setViewer] = useState<{ a: Attachment; uri: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // 한 프레임에 두 번 눌려도 선택기를 한 번만 연다

  // 보이는 첨부의 미리보기만 만든다(새로 붙은 것만 추가로)
  const refsKey = attachments.map((a) => a.ref).join('\n');
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const a of attachments) {
        if (!alive) return;
        if (thumbs[a.ref]) continue;
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

  const remove = (a: Attachment) => {
    Alert.alert(t('첨부 빼기'), t('이 일정에서만 빠지고 원본 사진·파일은 그대로 있어요.'), [
      { text: t('취소'), style: 'cancel' },
      { text: t('빼기'), style: 'destructive', onPress: () => {
        if (viewer?.a.ref === a.ref) setViewer(null);
        onChange(attachments.filter((x) => x.ref !== a.ref), [a]);
      } },
    ]);
  };

  const press = async (a: Attachment) => {
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
      <Text style={s.label}>{t('사진·파일')}</Text>
      {attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
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
                accessibilityLabel={`${t(a.kind === 'photo' ? '사진' : '파일')} ${a.name}`}
                accessibilityHint={t('길게 누르면 첨부를 빼요')}
              >
                {th?.uri ? (
                  <Image source={{ uri: th.uri }} style={s.thumb} />
                ) : th?.missing ? (
                  <View style={s.fileBox}><Text style={s.missingText}>{t('원본 없음')}</Text></View>
                ) : a.kind === 'file' || th ? (
                  <View style={s.fileBox}>
                    <Text style={s.fileIcon}>📄</Text>
                    <Text style={s.fileName} numberOfLines={2}>{a.name || t('파일')}</Text>
                  </View>
                ) : (
                  <View style={s.fileBox}><ActivityIndicator color={C.textSub} /></View>
                )}
                {a.kind === 'file' && th?.uri ? (
                  <Text style={s.fileCaption} numberOfLines={1}>{a.name}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={s.btnRow}>
        <TouchableOpacity style={s.addBtn} onPress={() => add('photo')} disabled={busy} activeOpacity={0.8} accessibilityRole="button">
          <Text style={s.addBtnText}>{t('＋ 사진')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.addBtn} onPress={() => add('file')} disabled={busy} activeOpacity={0.8} accessibilityRole="button">
          <Text style={s.addBtnText}>{t('＋ 파일')}</Text>
        </TouchableOpacity>
      </View>
      {attachments.length > 0 && <Text style={s.hint}>{t('원본은 복사하지 않아요. 길게 누르면 뺄 수 있어요.')}</Text>}

      {/* 사진 크게 보기 — 누르면 닫힌다 */}
      <Modal visible={viewer != null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={s.viewerBg} onPress={() => setViewer(null)} accessibilityRole="button" accessibilityLabel={t('닫기')}>
          {viewer?.uri ? (
            <Image source={{ uri: viewer.uri }} style={s.viewerImg} resizeMode="contain" />
          ) : (
            <ActivityIndicator color="#fff" size="large" />
          )}
          {viewer ? (
            <View style={s.viewerBar}>
              <Text style={s.viewerName} numberOfLines={1}>{viewer.a.name}{viewer.a.size ? `  ·  ${formatSize(viewer.a.size)}` : ''}</Text>
              <Text style={s.viewerClose}>{t('닫기')}</Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const TILE = 84;
const makeStyles = (C: Palette) => StyleSheet.create({
  label: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  row: { gap: 8, paddingBottom: 4 },
  tile: { width: TILE },
  thumb: { width: TILE, height: TILE, borderRadius: 12, backgroundColor: C.surface },
  fileBox: {
    width: TILE, height: TILE, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', padding: 6,
  },
  fileIcon: { fontSize: 26 },
  fileName: { color: C.textSub, fontSize: 11, textAlign: 'center', marginTop: 2 },
  fileCaption: { color: C.textSub, fontSize: 11, marginTop: 3 },
  missingText: { color: C.textSub, fontSize: 12, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addBtn: {
    paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  addBtnText: { color: C.text, fontSize: 14, fontWeight: '700' },
  hint: { color: C.textSub, fontSize: 12, marginTop: 8 },
  viewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '82%' },
  viewerBar: {
    position: 'absolute', left: 0, right: 0, bottom: Platform.OS === 'ios' ? 40 : 64,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12,
  },
  viewerName: { flex: 1, color: '#ddd', fontSize: 13 },
  viewerClose: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
