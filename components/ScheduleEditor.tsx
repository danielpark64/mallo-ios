import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from './Calendar';
import { formatDayHeader, formatTime } from '../lib/dateUtils';
import type { ScheduleRecord } from '../lib/storage';

export type EditorResult = {
  id?: string;
  content: string;
  date: Date;
  hasTime: boolean;
};

// ─── 무한궤도 스크롤 피커 ─────────────────────────────────────────────────────
const PICK_H = 54;
const LOOP   = 50;

const AMPM_ITEMS  = [0, 1];           // 0=오전, 1=오후
const HOURS12     = [1,2,3,4,5,6,7,8,9,10,11,12];
const MINUTES     = [0,5,10,15,20,25,30,35,40,45,50,55];

function ScrollPicker({
  value, items, onChange, label,
}: {
  value: number;
  items: number[];
  onChange: (v: number) => void;
  label: (v: number) => string;
}) {
  const flatRef        = useRef<FlatList>(null);
  const isScrolling    = useRef(false);
  const skipEffect     = useRef(false);

  const looped   = useMemo(() => Array.from({ length: LOOP }, () => items).flat(), [items]);
  const total    = looped.length;
  const midOff   = Math.floor(LOOP / 2) * items.length;

  const targetY = useCallback(
    (v: number) => (midOff + items.indexOf(v)) * PICK_H,
    [items, midOff]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      flatRef.current?.scrollToOffset({ offset: targetY(value), animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (skipEffect.current) { skipEffect.current = false; return; }
    if (isScrolling.current) return;
    flatRef.current?.scrollToOffset({ offset: targetY(value), animated: true });
  }, [value]);

  const handleEnd = useCallback((y: number) => {
    isScrolling.current = false;
    const idx    = Math.round(y / PICK_H);
    const clipped = Math.max(0, Math.min(total - 1, idx));
    const newVal  = looped[clipped];
    if (newVal !== value) {
      skipEffect.current = true;
      onChange(newVal);
    }
    // 끝 근처면 가운데로 순간이동
    const localIdx = items.indexOf(newVal);
    const tgt = (midOff + localIdx) * PICK_H;
    if (Math.abs(clipped - (midOff + localIdx)) > items.length * 2) {
      setTimeout(() => {
        flatRef.current?.scrollToOffset({ offset: tgt, animated: false });
      }, 50);
    }
  }, [value, looped, total, items, midOff, onChange]);

  const getItemLayout = useCallback((_: any, i: number) => ({
    length: PICK_H, offset: PICK_H * (i + 1), index: i,
  }), []);

  const renderItem = useCallback(({ item }: { item: number }) => (
    <TouchableOpacity style={pick.item} onPress={() => onChange(item)} activeOpacity={0.6}>
      <Text style={item === value ? pick.sel : pick.dim}>{label(item)}</Text>
    </TouchableOpacity>
  ), [value, onChange, label]);

  return (
    <View style={pick.wrap}>
      <View style={pick.highlight} pointerEvents="none" />
      <FlatList
        ref={flatRef}
        data={looped}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICK_H}
        decelerationRate="fast"
        windowSize={3}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: PICK_H }}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onMomentumScrollEnd={(e: any) => handleEnd(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e: any) => {
          if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.01)
            handleEnd(e.nativeEvent.contentOffset.y);
        }}
      />
    </View>
  );
}

// ─── 편집기 모달 ──────────────────────────────────────────────────────────────
export function ScheduleEditor({
  visible, record, defaultDate, markedDays, onSave, onDelete, onClose,
}: {
  visible: boolean;
  record: ScheduleRecord | null;
  defaultDate: Date;
  markedDays: Set<string>;
  onSave: (r: EditorResult) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [date, setDate]       = useState(new Date());
  const [ampm, setAmpm]       = useState(0);   // 0=오전 1=오후
  const [hour12, setHour12]   = useState(9);   // 1~12
  const [minute, setMinute]   = useState(0);
  const [showCal, setShowCal] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (record) {
      setContent(record.content || record.transcript || '');
      const d = record.scheduleAt ? new Date(record.scheduleAt) : new Date(defaultDate);
      setDate(d);
      const h = d.getHours();
      setAmpm(h < 12 ? 0 : 1);
      setHour12(h % 12 === 0 ? 12 : h % 12);
      setMinute(d.getMinutes());
    } else {
      setContent('');
      setDate(new Date(defaultDate));
      setAmpm(0);
      setHour12(9);
      setMinute(0);
    }
    setShowCal(false);
  }, [visible, record]);

  const h24Preview = hour12 % 12 + (ampm === 0 ? 0 : 12);

  const handleSave = () => {
    if (!content.trim()) { Alert.alert('내용을 입력해주세요'); return; }
    const d = new Date(date);
    d.setHours(h24Preview, minute, 0, 0);
    onSave({ id: record?.id, content: content.trim(), date: d, hasTime: true });
  };

  const handleDelete = () => {
    if (!record) return;
    Alert.alert('일정 삭제', '이 일정을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(record.id) },
    ]);
  };

  const labelAmpm  = useCallback((v: number) => v === 0 ? '오전' : '오후', []);
  const labelHour  = useCallback((v: number) => String(v), []);
  const labelMin   = useCallback((v: number) => v.toString().padStart(2, '0'), []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{record ? '일정 수정' : '새 일정'}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%' }} nestedScrollEnabled>
            {/* 내용 */}
            <Text style={styles.label}>내용</Text>
            <TextInput
              style={styles.input}
              value={content}
              onChangeText={setContent}
              placeholder="할 일을 입력하세요"
              placeholderTextColor="#55557a"
              multiline
            />

            {/* 날짜 */}
            <Text style={styles.label}>날짜</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowCal((s) => !s)}>
              <Text style={styles.dateBtnText}>{formatDayHeader(date)}</Text>
              <Text style={styles.dateBtnChevron}>{showCal ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showCal && (
              <View style={styles.calBox}>
                <Calendar
                  selectedDate={date}
                  onSelectDate={(d) => { setDate(d); setShowCal(false); }}
                  markedDays={markedDays}
                />
              </View>
            )}

            {/* 시간 */}
            <Text style={styles.label}>시간</Text>
            <View style={styles.pickerRow}>
              <ScrollPicker value={ampm}   items={AMPM_ITEMS} onChange={setAmpm}   label={labelAmpm} />
              <ScrollPicker value={hour12} items={HOURS12}    onChange={setHour12} label={labelHour} />
              <Text style={styles.colon}>:</Text>
              <ScrollPicker value={minute} items={MINUTES}    onChange={setMinute} label={labelMin}  />
              <Text style={styles.timePreview}>
                {formatTime(new Date(2000, 0, 1, h24Preview, minute))}
              </Text>
            </View>
          </ScrollView>

          {/* 버튼 */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            {record && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteText}>삭제</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const pick = StyleSheet.create({
  wrap:      { flex: 1, height: PICK_H * 3, overflow: 'hidden', position: 'relative' },
  highlight: { position: 'absolute', top: PICK_H, left: 4, right: 4, height: PICK_H, backgroundColor: '#26263f', borderRadius: 10 },
  item:      { height: PICK_H, justifyContent: 'center', alignItems: 'center' },
  sel:       { fontSize: 28, color: '#f0f0ff', fontWeight: '700' },
  dim:       { fontSize: 18, color: '#44446a', fontWeight: '400' },
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#14142a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '90%',
    alignItems: 'center',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#33334a', marginBottom: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },

  label: { color: '#9bdcff', fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: '#1d1d38', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    color: '#f0f0ff', fontSize: 16, minHeight: 48,
  },

  dateBtn: {
    backgroundColor: '#1d1d38', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dateBtnText:    { color: '#f0f0ff', fontSize: 16, fontWeight: '500' },
  dateBtnChevron: { color: '#9bdcff', fontSize: 12 },
  calBox:         { borderRadius: 12, marginTop: 8 },

  timeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  timeToggle:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  timeToggleLabel: { color: '#aaaacc', fontSize: 13 },

  pickerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a30', borderRadius: 16, paddingHorizontal: 8, marginTop: 6 },
  colon:       { color: '#f0f0ff', fontSize: 26, fontWeight: '700', paddingHorizontal: 2 },
  timePreview: { color: '#666680', fontSize: 11, marginLeft: 6, minWidth: 44 },

  btnRow:    { flexDirection: 'row', gap: 10, width: '100%', marginTop: 18 },
  cancelBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: '#26263f', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#aaaacc', fontSize: 15, fontWeight: '600' },
  deleteBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: '#3a1620', alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#e06c6c', fontSize: 15, fontWeight: '600' },
  saveBtn:   { flex: 1.4, height: 52, borderRadius: 14, backgroundColor: '#e05c5c', alignItems: 'center', justifyContent: 'center' },
  saveText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});
