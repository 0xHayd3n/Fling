import { useCallback } from "react";
import styles from "./CornerResize.module.css";

type Corner = "nw" | "ne" | "sw" | "se";

const MIN_W = 320;
const MIN_H = 360;

// Three-stripe diagonal hint, oriented by corner. The base SVG draws
// lines going from top-right toward bottom-left (the natural SE shape);
// CSS rotates the wrapper for the other three corners.
function HintSvg({ corner }: { corner: Corner }) {
  // Rotation in degrees so the diagonal points outward from the shell.
  const rotation = { se: 0, sw: 90, nw: 180, ne: 270 }[corner];
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path d="M 3 13 L 13 3" />
      <path d="M 6 14 L 14 6" />
      <path d="M 9 15 L 15 9" />
    </svg>
  );
}

export function CornerResize() {
  const startResize = useCallback((corner: Corner) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startScreenX = e.screenX;
    const startScreenY = e.screenY;

    void window.fling.window.getBounds().then((startBounds) => {
      let pending: { x: number; y: number; width: number; height: number } | null = null;
      let rafId = 0;

      const applyPending = () => {
        rafId = 0;
        if (!pending) return;
        void window.fling.window.setBounds(pending);
        pending = null;
      };

      const onMove = (ev: MouseEvent) => {
        const dx = ev.screenX - startScreenX;
        const dy = ev.screenY - startScreenY;
        let { x, y, width, height } = startBounds;

        if (corner === "nw" || corner === "sw") {
          // West edge: drag right shrinks width and shifts x right.
          const newW = Math.max(MIN_W, width - dx);
          x = x + (width - newW);
          width = newW;
        } else {
          // East edge: drag right grows width.
          width = Math.max(MIN_W, width + dx);
        }

        if (corner === "nw" || corner === "ne") {
          // North edge: drag down shrinks height and shifts y down.
          const newH = Math.max(MIN_H, height - dy);
          y = y + (height - newH);
          height = newH;
        } else {
          // South edge: drag down grows height.
          height = Math.max(MIN_H, height + dy);
        }

        pending = { x, y, width, height };
        if (!rafId) rafId = requestAnimationFrame(applyPending);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (rafId) cancelAnimationFrame(rafId);
        if (pending) void window.fling.window.setBounds(pending);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }, []);

  return (
    <>
      <div className={`${styles.corner} ${styles.nw}`} onMouseDown={startResize("nw")} aria-label="Resize from top-left">
        <span className={styles.hint}><HintSvg corner="nw" /></span>
      </div>
      <div className={`${styles.corner} ${styles.ne}`} onMouseDown={startResize("ne")} aria-label="Resize from top-right">
        <span className={styles.hint}><HintSvg corner="ne" /></span>
      </div>
      <div className={`${styles.corner} ${styles.sw}`} onMouseDown={startResize("sw")} aria-label="Resize from bottom-left">
        <span className={styles.hint}><HintSvg corner="sw" /></span>
      </div>
      <div className={`${styles.corner} ${styles.se}`} onMouseDown={startResize("se")} aria-label="Resize from bottom-right">
        <span className={styles.hint}><HintSvg corner="se" /></span>
      </div>
    </>
  );
}
