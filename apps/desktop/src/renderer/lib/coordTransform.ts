export interface Letterbox { offsetX: number; offsetY: number; renderedW: number; renderedH: number; }

export function computeLetterbox(
  canvasW: number, canvasH: number, deviceW: number, deviceH: number,
): Letterbox {
  if (deviceW === 0 || deviceH === 0) return { offsetX: 0, offsetY: 0, renderedW: canvasW, renderedH: canvasH };
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
