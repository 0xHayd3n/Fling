export interface Letterbox { offsetX: number; offsetY: number; renderedW: number; renderedH: number; }

export function computeLetterbox(
  canvasW: number, canvasH: number, deviceW: number, deviceH: number,
): Letterbox {
  if (deviceW === 0 || deviceH === 0) return { offsetX: 0, offsetY: 0, renderedW: canvasW, renderedH: canvasH };
  // When canvas aspect matches device aspect (within tolerance), fill the canvas
  // entirely instead of letterboxing. This eliminates 1-pixel rounding bars
  // when the window aspect is already locked to the device.
  const canvasAspect = canvasW / canvasH;
  const deviceAspect = deviceW / deviceH;
  if (Math.abs(canvasAspect - deviceAspect) / deviceAspect < 0.05) {
    return { offsetX: 0, offsetY: 0, renderedW: canvasW, renderedH: canvasH };
  }
  const scale = Math.min(canvasW / deviceW, canvasH / deviceH);
  const renderedW = Math.floor(deviceW * scale);
  const renderedH = Math.floor(deviceH * scale);
  return {
    offsetX: Math.floor((canvasW - renderedW) / 2),
    offsetY: Math.floor((canvasH - renderedH) / 2),
    renderedW, renderedH,
  };
}

export function canvasToDevice(
  mouseX: number, mouseY: number, lb: Letterbox, deviceW: number, deviceH: number,
): { x: number; y: number } | null {
  if (mouseX < lb.offsetX || mouseX >= lb.offsetX + lb.renderedW) return null;
  if (mouseY < lb.offsetY || mouseY >= lb.offsetY + lb.renderedH) return null;
  return {
    x: Math.floor(((mouseX - lb.offsetX) * deviceW) / lb.renderedW),
    y: Math.floor(((mouseY - lb.offsetY) * deviceH) / lb.renderedH),
  };
}

// Clamping variant used for pointer-up events. Dropping an up-event when the
// finger releases outside the device area would leave the device thinking a
// touch is still down — a stuck-finger state until the next session restart.
// Always returns a coordinate; clamps the input to the rendered area.
export function canvasToDeviceClamped(
  mouseX: number, mouseY: number, lb: Letterbox, deviceW: number, deviceH: number,
): { x: number; y: number } {
  const maxX = lb.offsetX + lb.renderedW - 1;
  const maxY = lb.offsetY + lb.renderedH - 1;
  const clampedX = Math.min(maxX, Math.max(lb.offsetX, mouseX));
  const clampedY = Math.min(maxY, Math.max(lb.offsetY, mouseY));
  return {
    x: Math.floor(((clampedX - lb.offsetX) * deviceW) / Math.max(1, lb.renderedW)),
    y: Math.floor(((clampedY - lb.offsetY) * deviceH) / Math.max(1, lb.renderedH)),
  };
}
