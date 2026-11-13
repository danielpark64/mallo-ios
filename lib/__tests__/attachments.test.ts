import { MAX_ATTACHMENTS, addAttachments, formatSize, pickAttachments, unusedRefs } from '../attachments';
import type { Attachment, ScheduleRecord } from '../storage';

const att = (ref: string, kind: Attachment['kind'] = 'photo'): Attachment => ({ ref, kind, name: ref, addedAt: 0 });
const rec = (id: string, attachments?: Attachment[]): ScheduleRecord => ({
  id, uri: '', durationSec: 0, transcript: '', content: id, scheduleAt: null, scheduleDisplay: '',
  hasDate: false, hasTime: false, createdAt: 0, attachments,
});

describe('addAttachments', () => {
  it('이미 붙은 것과 한 번에 두 번 고른 것은 한 번만', () => {
    const next = addAttachments([att('a')], [att('a'), att('b'), att('b'), att('c', 'file')]);
    expect(next.map((x) => x.ref)).toEqual(['a', 'b', 'c']);
  });

  it(`최대 ${MAX_ATTACHMENTS}개까지만`, () => {
    const cur = Array.from({ length: MAX_ATTACHMENTS - 1 }, (_, i) => att(`p${i}`));
    const next = addAttachments(cur, [att('x'), att('y')]);
    expect(next).toHaveLength(MAX_ATTACHMENTS);
    expect(next[next.length - 1].ref).toBe('x');
  });

  it('목록이 없던 일정에도 붙는다', () => {
    expect(addAttachments(undefined, [att('a')]).map((x) => x.ref)).toEqual(['a']);
  });
});

describe('unusedRefs', () => {
  it('다른 일정이 같은 사진을 쓰면 권한을 반납하지 않는다', () => {
    const remaining = [rec('1', [att('shared')]), rec('2')];
    expect(unusedRefs([att('shared'), att('only'), att('only')], remaining)).toEqual(['only']);
  });
});

describe('formatSize', () => {
  it('B·KB·MB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatSize(null)).toBe('');
  });
});

describe('pickAttachments', () => {
  it('네이티브 모듈이 없으면(테스트·웹) 빈 결과', async () => {
    await expect(pickAttachments('photo', 5)).resolves.toEqual({ items: [], denied: false, hidden: 0 });
  });
});
