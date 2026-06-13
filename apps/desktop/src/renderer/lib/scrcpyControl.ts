const TYPE_KEYCODE = 0;
const TYPE_TOUCH = 2;
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;

// Android KeyEvent constants — matches android.view.KeyEvent values.
export const KEYCODE_POWER = 26;
export const KEYCODE_VOLUME_UP = 24;
export const KEYCODE_VOLUME_DOWN = 25;

/**
 * Encode a scrcpy 2.7 INJECT_KEYCODE control message.
 * Layout (14 bytes total): type(1) action(1) keycode(i32 BE) repeat(i32 BE) metaState(i32 BE).
 * Single physical "tap" of a key requires two messages: down then up.
 */
export function encodeKeyEvent(action: "down" | "up", keycode: number): Uint8Array {
  const buf = new ArrayBuffer(1 + 1 + 4 + 4 + 4);
  const view = new DataView(buf);
  view.setUint8(0, TYPE_KEYCODE);
  view.setUint8(1, action === "down" ? ACTION_DOWN : ACTION_UP);
  view.setInt32(2, keycode, false);
  view.setInt32(6, 0, false); // repeat
  view.setInt32(10, 0, false); // metaState
  return new Uint8Array(buf);
}

/** Convenience: concatenated down + up bytes for a single key tap. */
export function encodeKeyTap(keycode: number): Uint8Array {
  const down = encodeKeyEvent("down", keycode);
  const up = encodeKeyEvent("up", keycode);
  const combined = new Uint8Array(down.length + up.length);
  combined.set(down, 0);
  combined.set(up, down.length);
  return combined;
}

/**
 * Encode a scrcpy 2.7 INJECT_TOUCH_EVENT control message.
 * Layout (32 bytes total): type(1) action(1) pointerId(u64 BE) x(i32 BE) y(i32 BE)
 * screenW(u16 BE) screenH(u16 BE) pressure(u16 BE) actionButton(i32 BE) buttons(i32 BE).
 * Missing the actionButton field (which scrcpy reads as i32) misaligns every
 * subsequent message and crashes the server's control-recv thread.
 */
export function encodeTouch(
  action: "down" | "up" | "move",
  x: number, y: number,
  pointerId: number,
  screenW: number, screenH: number,
): Uint8Array {
  const buf = new ArrayBuffer(1 + 1 + 8 + 4 + 4 + 2 + 2 + 2 + 4 + 4);
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
  view.setInt32(off, 0, false); off += 4; // actionButton (no specific button)
  view.setInt32(off, 0, false);            // buttons (no buttons held)
  return new Uint8Array(buf);
}
