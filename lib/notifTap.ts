// 알람·미리 알림의 Expo 알림 '본문'을 눌렀을 때 무엇을 할지(순수 함수, jest — lib/__tests__/notifTap.test.ts).
// 1.2.3: Android에서 알람이 네이티브로 울리는 중에 본문을 누른 것은 끄라는 뜻이 아니다 → 끄지 않고 울림 화면(끄기·5분 후)을 맨 앞에 띄운다.
//  - 'ringScreenOnly'      : 지금 울리는 바로 그 일정 — 울림 화면만 띄우고 끝(상세도 열지 않고 끄지도 않는다). 울림 화면을 못 띄웠으면 'normal'처럼
//  - 'ringScreenThenNormal': 다른 일정이 울리는 중 — 그 울림 화면을 앞에 띄우고, 누른 일정은 평소대로(상세 열기 + 그 일정 재알림 취소)
//  - 'normal'              : 울리는 중이 아님·iOS·버튼(끄기/5분 뒤)·밀어서 닫기 — 평소 처리
export type BodyTapPlan = 'ringScreenOnly' | 'ringScreenThenNormal' | 'normal';

export function bodyTapPlan(o: { os: string; isBodyTap: boolean; ringingId: string | null; recordId: string }): BodyTapPlan {
  if (o.os !== 'android' || !o.isBodyTap || !o.ringingId) return 'normal';
  return o.ringingId === o.recordId ? 'ringScreenOnly' : 'ringScreenThenNormal';
}
