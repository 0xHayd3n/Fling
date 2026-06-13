import { screen, type BrowserWindow } from "electron";

// App layout vertical: padding + toolbar + gap + canvas + padding.
// App layout horizontal: padding + canvas + padding + side-controls-reserve.
// Toolbar is box-sizing: border-box, exactly 64px including the 1px borders.
// Must match Toolbar.module.css .toolbar height.
const TOOLBAR_HEIGHT = 64;
const APP_PADDING = 8;
const TOOLBAR_CANVAS_GAP = 8;
const TOOLBAR_MIN_WIDTH = 320;
const TARGET_WINDOW_HEIGHT = 800;
// Reserved transparent column to the right of the shell where SideControls
// float. Matches the sideArea width in App.module.css.
const SIDE_CONTROLS_RESERVE = 72;
const EXTRA_W = APP_PADDING * 2 + SIDE_CONTROLS_RESERVE;
const EXTRA_H = APP_PADDING * 2 + TOOLBAR_HEIGHT + TOOLBAR_CANVAS_GAP;

// Default 9:16 (portrait phone) when no device is connected, so the no-phone
// hero card sits in a window that matches the shell instead of leaving wide
// empty bands of dead space on each side.
export const DEFAULT_PHONE_ASPECT = 9 / 16;

export function phoneShapedBounds(
  win: BrowserWindow,
  aspect: number
): { width: number; height: number } {
  const display = screen.getDisplayMatching(win.getBounds());
  const maxH = Math.floor(display.workAreaSize.height * 0.85);
  const targetH = Math.min(TARGET_WINDOW_HEIGHT, maxH);
  const canvasH = Math.max(1, targetH - EXTRA_H);
  const canvasW = Math.ceil(canvasH * aspect);
  let finalW = canvasW + EXTRA_W;
  let finalH = targetH;
  if (finalW < TOOLBAR_MIN_WIDTH) {
    finalW = TOOLBAR_MIN_WIDTH;
    const adjustedCanvasW = TOOLBAR_MIN_WIDTH - EXTRA_W;
    finalH = Math.ceil(adjustedCanvasW / aspect) + EXTRA_H;
  }
  return { width: finalW, height: finalH };
}
