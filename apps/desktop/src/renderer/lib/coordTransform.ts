export function canvasToDevice(
  x: number, y: number,
  rectW: number, rectH: number,
  deviceW: number, deviceH: number,
): { x: number; y: number } | null {
  if (x < 0 || x >= rectW) return null;
  if (y < 0 || y >= rectH) return null;
  if (rectW <= 0 || rectH <= 0) return null;
  return {
    x: Math.floor((x / rectW) * deviceW),
    y: Math.floor((y / rectH) * deviceH),
  };
}

// Clamping variant for pointer-up events. Dropping an up-event when the
// finger releases outside the canvas area would leave the device thinking
// a touch is still down — a stuck-finger state until the next session.
// Always returns a coordinate; clamps the input to inside the rect.
export function canvasToDeviceClamped(
  x: number, y: number,
  rectW: number, rectH: number,
  deviceW: number, deviceH: number,
): { x: number; y: number } {
  const safeW = Math.max(1, rectW);
  const safeH = Math.max(1, rectH);
  const cx = Math.min(safeW - 1, Math.max(0, x));
  const cy = Math.min(safeH - 1, Math.max(0, y));
  return {
    x: Math.floor((cx / safeW) * deviceW),
    y: Math.floor((cy / safeH) * deviceH),
  };
}
