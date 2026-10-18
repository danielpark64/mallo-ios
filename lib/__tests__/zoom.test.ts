// 달력 화면 확대(사진처럼): 손가락 사이 중심이 가리키던 곳이 확대 뒤에도 손가락 아래에 남는다. 화면 밖으로는 못 밀린다.
import { pinchZoom, panZoom, clampZoom, ZOOM_MAX } from '../calendarKit/zoom';

const W = 400, H = 800;
test('가운데(200,400)에서 2배로 벌리면 그 점이 그대로 가운데', () => {
  const z = pinchZoom({ s: 1, tx: 0, ty: 0 }, { x: 200, y: 400 }, { x: 200, y: 400 }, 2, W, H);
  expect(z).toEqual({ s: 2, tx: -200, ty: -400 });
  // 원래 (200,400)에 있던 내용 → 화면 tx + s*200 = 200
  expect(z.tx + z.s * 200).toBe(200);
});
test('왼쪽 위에서 벌리면 왼쪽 위 기준으로 커진다', () => {
  expect(pinchZoom({ s: 1, tx: 0, ty: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 2, W, H)).toEqual({ s: 2, tx: 0, ty: 0 });
});
test('최대 3배, 1배보다 작게는 안 된다', () => {
  expect(pinchZoom({ s: 1, tx: 0, ty: 0 }, { x: 200, y: 400 }, { x: 200, y: 400 }, 10, W, H).s).toBe(ZOOM_MAX);
  expect(pinchZoom({ s: 2, tx: -200, ty: -400 }, { x: 200, y: 400 }, { x: 200, y: 400 }, 0.1, W, H)).toEqual({ s: 1, tx: 0, ty: 0 });
});
test('두 손가락으로 끌면 따라 움직인다(벌리지 않고)', () => {
  const z = pinchZoom({ s: 2, tx: -200, ty: -400 }, { x: 200, y: 400 }, { x: 250, y: 400 }, 1, W, H);
  expect(z).toEqual({ s: 2, tx: -150, ty: -400 });
});
test('한 손가락 옆으로 밀기·화면 밖으로는 못 감', () => {
  expect(panZoom({ s: 2, tx: -200, ty: -400 }, 50, W, H)).toEqual({ s: 2, tx: -150, ty: -400 });
  expect(panZoom({ s: 2, tx: -200, ty: -400 }, 500, W, H).tx).toBe(0);
  expect(panZoom({ s: 2, tx: -200, ty: -400 }, -900, W, H).tx).toBe(-400);
});
test('clampZoom: 1배면 늘 제자리', () => {
  expect(clampZoom({ s: 1, tx: -30, ty: 20 }, W, H)).toEqual({ s: 1, tx: 0, ty: 0 });
});
