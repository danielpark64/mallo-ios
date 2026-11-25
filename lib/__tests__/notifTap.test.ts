// Expo 알림 본문 탭 경로(1.2.3) — 기기에서는 네이티브 울림 중에 Expo 알림이 안 떠 직접 못 눌러 봐서 판정을 테스트로 고정한다
import { bodyTapPlan } from '../notifTap';

const base = { os: 'android', isBodyTap: true, ringingId: 'r1', recordId: 'r1' };

test('Android, 울리는 그 일정의 본문 탭 → 울림 화면만(끄지 않음)', () => {
  expect(bodyTapPlan(base)).toBe('ringScreenOnly');
});

test('Android, 다른 일정이 울리는 중 → 울림 화면을 앞에 + 누른 일정은 평소대로', () => {
  expect(bodyTapPlan({ ...base, recordId: 'r2' })).toBe('ringScreenThenNormal');
});

test('울리는 중이 아님·iOS·버튼 탭은 평소 처리', () => {
  expect(bodyTapPlan({ ...base, ringingId: null })).toBe('normal');
  expect(bodyTapPlan({ ...base, os: 'ios' })).toBe('normal');
  expect(bodyTapPlan({ ...base, isBodyTap: false })).toBe('normal'); // 끄기·5분 뒤 버튼(폰·워치)은 그대로 끈다/미룬다
});
