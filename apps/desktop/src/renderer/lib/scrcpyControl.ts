const TYPE_TOUCH = 2;
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;

export function encodeTouch(
  action: "down" | "up" | "move",
  x: number, y: number,
  pointerId: number,
  screenW: number, screenH: number,
): Uint8Array {
  const buf = new ArrayBuffer(1 + 1 + 8 + 4 + 4 + 2 + 2 + 2 + 4);
  const view = new DataView(buf);
  let off = 0;
  view.setUint8(off, TYPE_TOUCH); off += 1;
  view.setUint8(off, action === "down" ? ACTION_DOWN : action === "up" ? ACTION_UP : ACTION_MOVE); off += 1;
  view.setBigUint64(off, BigInt(pointerId), false); off += 8;
  view.setInt32(off, x, false); off += 4;
  view.setInt32(off, y, false); off += 4;
  view.setUint16(off, screenW, false); off += 2;
  view.setUint16(off, screenH, false); off += 2;
  view.setUint16(off, action === "up" ? 0 : 0xffff, false); off += 2;
  view.setUint32(off, 0, false);
  return new Uint8Array(buf);
}
